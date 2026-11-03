package com.notdxbi.dxbi.tv

import android.app.Notification
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadNotificationHelper
import androidx.media3.exoplayer.offline.DownloadRequest
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.exoplayer.scheduler.Scheduler
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * Phones: films and episodes saved to watch offline. A stream (an addon's link, debrid ones
 * included) is downloaded in the background with Media3's DownloadManager, its subtitles alongside,
 * and plays from the phone in dx.bi's player, picking up where it was left.
 */
@OptIn(UnstableApi::class)
object Downloads {

    class Item(val id: String, val stream: JSONObject, val state: Int, val percent: Float, val bytes: Long) {
        val title: String get() = stream.optString("title")
        val subtitle: String get() = stream.optString("subtitle")
        val art: String? get() = stream.optString("background").takeIf { it.startsWith("http") }
        val done get() = state == Download.STATE_COMPLETED
        val failed get() = state == Download.STATE_FAILED
    }

    private val _items = MutableStateFlow<List<Item>>(emptyList())
    val items: StateFlow<List<Item>> = _items

    private var manager: DownloadManager? = null
    private lateinit var cache: SimpleCache
    private lateinit var prefs: android.content.SharedPreferences
    private val handler = Handler(Looper.getMainLooper())
    private val http by lazy { OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build() }

    @Synchronized
    fun manager(context: Context): DownloadManager {
        manager?.let { return it }
        val app = context.applicationContext
        prefs = app.getSharedPreferences("downloads", Context.MODE_PRIVATE)
        val db = StandaloneDatabaseProvider(app)
        cache = SimpleCache(File(app.getExternalFilesDir(null) ?: app.filesDir, "downloads"), NoOpCacheEvictor(), db)
        val m = DownloadManager(app, db, cache, withHeaders(), Executors.newFixedThreadPool(2))
        m.maxParallelDownloads = 2
        m.addListener(object : DownloadManager.Listener {
            override fun onDownloadChanged(manager: DownloadManager, download: Download, finalException: Exception?) = refresh()
            override fun onDownloadRemoved(manager: DownloadManager, download: Download) = refresh()
            override fun onInitialized(manager: DownloadManager) = refresh()
        })
        manager = m
        refresh()
        return m
    }

    /** Addons can ask for headers on their links: kept per link, added to every request for it */
    private fun withHeaders(): DataSource.Factory = ResolvingDataSource.Factory(OkHttpDataSource.Factory(http)) { spec ->
        val saved = prefs.getString("headers:${spec.uri}", null)?.let { runCatching { JSONObject(it) }.getOrNull() }
        if (saved == null) spec else spec.withAdditionalHeaders(saved.keys().asSequence().associateWith { saved.optString(it) })
    }

    /** What the player reads a download through: the phone first, the internet for anything not saved yet */
    fun playback(context: Context): DataSource.Factory {
        manager(context)
        return CacheDataSource.Factory().setCache(cache).setUpstreamDataSourceFactory(withHeaders()).setCacheWriteDataSinkFactory(null)
    }

    /** Starts saving the stream the page handed over (the same details the player gets) */
    fun add(context: Context, json: String) {
        val app = context.applicationContext
        manager(app)
        val stream = JSONObject(json)
        val url = stream.optString("url")
        if (url.isEmpty() || stream.optBoolean("torrent")) {
            Toast.makeText(app, "Only debrid and direct streams can be downloaded", Toast.LENGTH_LONG).show()
            return
        }
        val id = "${stream.optString("hash").hashCode()}-${stream.optString("videoId")}".replace(Regex("[^\\w-]"), "")
        Toast.makeText(app, "Downloading ${stream.optString("title")}", Toast.LENGTH_SHORT).show()
        thread(name = "dxbi-download-prepare") {
            stream.optJSONObject("headers")?.takeIf { it.length() > 0 }?.let { prefs.edit().putString("headers:$url", it.toString()).apply() }
            // subtitles are small: saved straight away (up to three, already ordered by language)
            val subs = stream.optJSONArray("subtitles") ?: JSONArray()
            val saved = JSONArray()
            val dir = File(app.filesDir, "download-subs/$id").apply { mkdirs() }
            for (i in 0 until minOf(subs.length(), 3)) {
                val s = subs.optJSONObject(i) ?: continue
                val file = File(dir, "$i." + (Uri.parse(s.optString("url")).lastPathSegment?.substringAfterLast('.', "srt")?.take(4) ?: "srt"))
                val ok = runCatching {
                    http.newCall(Request.Builder().url(s.optString("url")).build()).execute().use { r ->
                        if (!r.isSuccessful) return@use false
                        file.outputStream().use { out -> r.body!!.byteStream().copyTo(out) }
                        true
                    }
                }.getOrDefault(false)
                if (ok) saved.put(JSONObject(s.toString()).put("url", Uri.fromFile(file).toString()))
            }
            stream.put("subtitles", saved)
            val request = DownloadRequest.Builder(id, Uri.parse(url)).setData(stream.toString().toByteArray()).build()
            DownloadService.sendAddDownload(app, DownloadsService::class.java, request, false)
        }
    }

    fun remove(context: Context, item: Item) {
        DownloadService.sendRemoveDownload(context.applicationContext, DownloadsService::class.java, item.id, false)
        File(context.applicationContext.filesDir, "download-subs/${item.id}").deleteRecursively()
        prefs.edit().remove("pos:${item.id}").apply()
    }

    /** Plays a download in dx.bi's player, from the phone, where it was left */
    fun play(context: Context, item: Item) {
        val stream = JSONObject(item.stream.toString())
            .put("offline", item.id)
            .put("startMs", prefs.getLong("pos:${item.id}", stream0(item)))
            // (no up-next card or skip times offline: those come from the internet)
            .put("next", JSONObject.NULL)
        context.startActivity(Intent(context, PlayerActivity::class.java).putExtra(PlayerActivity.EXTRA_STREAM, stream.toString()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private fun stream0(item: Item) = item.stream.optLong("startMs", 0L)

    /** Where a download was left (the player says when it closes) */
    fun leftAt(id: String, positionMs: Long, ended: Boolean) {
        if (!::prefs.isInitialized) return
        prefs.edit().putLong("pos:$id", if (ended) 0L else positionMs).apply()
    }

    private val tick = Runnable { refresh() }

    fun refresh() {
        val m = manager ?: return
        val list = mutableListOf<Item>()
        runCatching {
            m.downloadIndex.getDownloads().use { c ->
                while (c.moveToNext()) {
                    val d = c.download
                    val stream = runCatching { JSONObject(String(d.request.data)) }.getOrDefault(JSONObject())
                    list += Item(d.request.id, stream, d.state, d.percentDownloaded.coerceAtLeast(0f), d.bytesDownloaded)
                }
            }
        }
        // (the index only keeps how far a download got now and then: the ones running are read live)
        val live = m.currentDownloads.associateBy { it.request.id }
        _items.value = list.map { i -> live[i.id]?.let { d -> Item(i.id, i.stream, d.state, d.percentDownloaded.coerceAtLeast(0f), d.bytesDownloaded) } ?: i }
            .sortedByDescending { it.state != Download.STATE_COMPLETED }
        handler.removeCallbacks(tick)
        if (m.currentDownloads.isNotEmpty()) handler.postDelayed(tick, 1000)
    }
}

/** Keeps downloads going with the app closed, with their progress in a notification */
@OptIn(UnstableApi::class)
class DownloadsService : DownloadService(
    FOREGROUND_NOTIFICATION_ID,
    DEFAULT_FOREGROUND_NOTIFICATION_UPDATE_INTERVAL,
    CHANNEL,
    R.string.downloads_channel,
    0,
) {
    override fun getDownloadManager(): DownloadManager = Downloads.manager(this)

    override fun getScheduler(): Scheduler? = null

    override fun getForegroundNotification(downloads: MutableList<Download>, notMetRequirements: Int): Notification =
        DownloadNotificationHelper(this, CHANNEL).buildProgressNotification(this, R.drawable.ic_play, null, null, downloads, notMetRequirements)

    private companion object {
        const val FOREGROUND_NOTIFICATION_ID = 7041
        const val CHANNEL = "downloads"
    }
}

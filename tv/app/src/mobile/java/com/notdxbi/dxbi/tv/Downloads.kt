package com.notdxbi.dxbi.tv

import android.app.Activity
import android.app.Notification
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.StatFs
import android.widget.Toast
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultDataSource
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
import androidx.media3.exoplayer.scheduler.Requirements
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
 * Phones: films and episodes saved to watch offline, like Netflix's downloads. A stream (an addon's
 * link, debrid ones included) is downloaded in the background with Media3's DownloadManager, its
 * subtitles alongside, and plays from the phone in dx.bi's player, picking up where it was left.
 * dx.bi picks the stream (in the quality asked for: plugin api.phone.download), or it's the one
 * chosen from the list.
 *
 * Torrents download through dx.bi's own torrent engine (TorrentEngine), which the downloader reads
 * from like any other link (dxbi-torrent://<hash>…, resolved to its local address each time).
 */
@OptIn(UnstableApi::class)
object Downloads {

    class Item(val id: String, val stream: JSONObject, val state: Int, val percent: Float, val bytes: Long, val total: Long, val stopped: Boolean, val watchedAt: Long) {
        val title: String get() = stream.optString("title")
        val subtitle: String get() = stream.optString("subtitle")
        val art: String? get() = stream.optString("background").takeIf { it.startsWith("http") }
        val poster: String? get() = stream.optString("poster").takeIf { it.startsWith("http") }
        val metaId: String get() = stream.optString("metaId")
        val videoId: String get() = stream.optString("videoId")
        val type: String get() = stream.optString("type")
        val season: Int? get() = if (stream.has("season") && !stream.isNull("season")) stream.optInt("season") else null
        val number: Int? get() = if (stream.has("number") && !stream.isNull("number")) stream.optInt("number") else null
        val quality: String get() = stream.optString("quality")
        val provider: String get() = stream.optString("provider")
        val done get() = state == Download.STATE_COMPLETED
        val failed get() = state == Download.STATE_FAILED
        val paused get() = stopped && !done && !failed
        val watched get() = watchedAt > 0
    }

    /** Downloads → Settings: what the Download buttons save, deleting watched ones, Wi-Fi only, where */
    data class Settings(val quality: String, val autoDelete: String, val wifiOnly: Boolean, val storage: Int)

    /** Somewhere downloads can go: the phone itself, or a memory card */
    data class Place(val index: Int, val label: String, val dir: File, val free: Long)

    private val _items = MutableStateFlow<List<Item>>(emptyList())
    val items: StateFlow<List<Item>> = _items

    private val _settings = MutableStateFlow(Settings("ask", "off", false, 0))
    val settings: StateFlow<Settings> = _settings

    /** Waiting for Wi-Fi (or any connection) before the downloads can carry on */
    private val _waiting = MutableStateFlow(false)
    val waiting: StateFlow<Boolean> = _waiting

    private var manager: DownloadManager? = null
    // (for removals the list starts itself: watched ones)
    private var appContext: Context? = null
    private lateinit var cache: SimpleCache
    private lateinit var prefs: android.content.SharedPreferences
    private val handler = Handler(Looper.getMainLooper())
    private val http by lazy { OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build() }

    private fun prefsOf(context: Context): android.content.SharedPreferences {
        if (!::prefs.isInitialized) {
            prefs = context.applicationContext.getSharedPreferences("downloads", Context.MODE_PRIVATE)
            _settings.value = Settings(
                prefs.getString("quality", "ask") ?: "ask",
                prefs.getString("autoDelete", "off") ?: "off",
                prefs.getBoolean("wifiOnly", false),
                prefs.getInt("storage", 0),
            )
        }
        return prefs
    }

    /** The phone's own storage, then any memory card (the app's own folder on each) */
    fun places(context: Context): List<Place> {
        val app = context.applicationContext
        val dirs = app.getExternalFilesDirs(null).toList()
        val out = mutableListOf<Place>()
        dirs.forEachIndexed { i, d ->
            if (d == null) return@forEachIndexed
            val free = runCatching { StatFs(d.path).availableBytes }.getOrDefault(-1L)
            out += Place(i, if (i == 0) "Phone storage" else if (dirs.size > 2) "Memory card $i" else "Memory card", File(d, "downloads"), free)
        }
        if (out.isEmpty()) out += Place(0, "Phone storage", File(app.filesDir, "downloads"), runCatching { StatFs(app.filesDir.path).availableBytes }.getOrDefault(-1L))
        return out
    }

    private fun folder(context: Context): File {
        val all = places(context)
        return (all.firstOrNull { it.index == prefsOf(context).getInt("storage", 0) } ?: all.first()).dir
    }

    @Synchronized
    fun manager(context: Context): DownloadManager {
        manager?.let { return it }
        val app = context.applicationContext
        appContext = app
        prefsOf(app)
        val db = StandaloneDatabaseProvider(app)
        cache = SimpleCache(folder(app), NoOpCacheEvictor(), db)
        val m = DownloadManager(app, db, cache, withHeaders(), Executors.newFixedThreadPool(2))
        m.maxParallelDownloads = 2
        m.requirements = requirements()
        m.addListener(object : DownloadManager.Listener {
            override fun onDownloadChanged(manager: DownloadManager, download: Download, finalException: Exception?) {
                // a torrent's own copy goes once the download has it all
                if (download.state == Download.STATE_COMPLETED) TorrentEngine.hashOf(download.request.uri.toString())?.let { TorrentEngine.drop(app, it, torrentDir(app)) }
                refresh()
            }
            override fun onDownloadRemoved(manager: DownloadManager, download: Download) = refresh()
            override fun onInitialized(manager: DownloadManager) {
                // (torrents left behind by downloads that have since gone)
                val wanted = runCatching {
                    manager.downloadIndex.getDownloads().use { c ->
                        buildSet { while (c.moveToNext()) if (c.download.state != Download.STATE_COMPLETED) TorrentEngine.hashOf(c.download.request.uri.toString())?.let { add(it) } }
                    }
                }.getOrNull()
                if (wanted != null) TorrentEngine.tidy(torrentDir(app), wanted)
                refresh()
            }
            override fun onRequirementsStateChanged(manager: DownloadManager, requirements: Requirements, notMetRequirements: Int) = refresh()
        })
        manager = m
        refresh()
        return m
    }

    private fun requirements() = Requirements(if (_settings.value.wifiOnly) Requirements.NETWORK_UNMETERED else Requirements.NETWORK)

    /** Where torrents being downloaded keep their own copy until it's been saved */
    private fun torrentDir(context: Context): File = File(folder(context).parentFile ?: context.filesDir, "torrent-parts")

    /** Addons can ask for headers on their links: kept per link, added to every request for it */
    private fun withHeaders(): DataSource.Factory = ResolvingDataSource.Factory(OkHttpDataSource.Factory(http)) { spec ->
        val app = appContext
        if (spec.uri.scheme == TorrentEngine.SCHEME) {
            spec.withUri(TorrentEngine.resolveDownload(app ?: throw java.io.IOException("Downloads aren't set up"), spec.uri, torrentDir(app)))
        } else {
            val saved = prefs.getString("headers:${spec.uri}", null)?.let { runCatching { JSONObject(it) }.getOrNull() }
            if (saved == null) spec else spec.withAdditionalHeaders(saved.keys().asSequence().associateWith { saved.optString(it) })
        }
    }

    /**
     * What the player reads a download through: the phone first, the internet for anything not saved yet.
     * Its subtitles were saved as files (file://), which only DefaultDataSource opens: through the
     * cache alone (web addresses only) they failed, and downloads had no subtitles to choose.
     */
    fun playback(context: Context): DataSource.Factory {
        manager(context)
        val saved = CacheDataSource.Factory().setCache(cache).setUpstreamDataSourceFactory(withHeaders()).setCacheWriteDataSinkFactory(null)
        return DefaultDataSource.Factory(context.applicationContext, saved)
    }

    /** The download of one film or episode, if there is one */
    fun find(metaId: String, videoId: String): Item? = _items.value.firstOrNull { it.metaId == metaId && it.videoId == videoId }

    /**
     * Starts saving the stream the page (or the plugin's pick) handed over (the same details the
     * player gets). [quiet]: no "Downloading…" message (a whole season says it once). False when it
     * can't be downloaded or already is.
     */
    fun add(context: Context, json: String, quiet: Boolean = false): Boolean {
        val app = context.applicationContext
        manager(app)
        val stream = JSONObject(json)
        // a torrent: { infoHash, fileIdx, trackers[], name } (plugin api.phone.download / downloadOption)
        stream.optJSONObject("magnet")?.takeIf { it.optString("infoHash").matches(Regex("(?i)[0-9a-f]{40}")) }?.let { m ->
            val trackers = m.optJSONArray("trackers")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.isNotEmpty() } } ?: emptyList()
            stream.put("url", TorrentEngine.downloadUri(m.optString("infoHash"), m.optInt("fileIdx", -1), trackers, m.optString("name")))
            stream.remove("magnet")
            stream.put("torrent", false)
        }
        val url = stream.optString("url")
        if (url.isEmpty() || stream.optBoolean("torrent")) {
            // (a torrent the page started playing: its address only lasts while it plays)
            Toast.makeText(app, "Couldn't download that one. Try Download again from the stream's ⋮ menu.", Toast.LENGTH_LONG).show()
            return false
        }
        // (a stream played through the page names its title in its player address:
        // #/player/<stream>/<addon>/<meta addon>/<type>/<id>/<video>)
        val parts = stream.optString("hash").split("/")
        if (stream.optString("metaId").isEmpty() && parts.size >= 8 && parts[1] == "player") {
            stream.put("type", Uri.decode(parts[5])).put("metaId", Uri.decode(parts[6]))
            if (stream.optString("videoId").isEmpty()) stream.put("videoId", Uri.decode(parts[7]))
        }
        val metaId = stream.optString("metaId")
        val videoId = stream.optString("videoId").ifEmpty { metaId }
        stream.put("videoId", videoId)
        val id = (if (metaId.isNotEmpty()) "$metaId:$videoId" else "${stream.optString("hash").hashCode()}-$videoId").replace(Regex("[^\\w:.-]"), "_")
        val old = _items.value.firstOrNull { it.id == id }
        if (old != null && !old.failed) {
            if (!quiet) Toast.makeText(app, if (old.done) "Already downloaded" else "Already downloading", Toast.LENGTH_SHORT).show()
            return false
        }
        if (!quiet) Toast.makeText(app, "Downloading ${listOf(stream.optString("title"), stream.optString("subtitle")).filter { it.isNotEmpty() }.joinToString(" · ")}", Toast.LENGTH_SHORT).show()
        prefs.edit().remove("watched:$id").remove("pos:$id").apply()
        thread(name = "dxbi-download-prepare") {
            stream.optJSONObject("headers")?.takeIf { it.length() > 0 }?.let { prefs.edit().putString("headers:$url", it.toString()).apply() }
            // (a torrent's copy from a failed try is picked up again: only a different one is dropped)
            if (old != null) TorrentEngine.hashOf(old.stream.optString("url"))?.takeIf { it != TorrentEngine.hashOf(url) }?.let { TorrentEngine.drop(app, it, torrentDir(app)) }
            // subtitles are small: saved straight away (up to three, already ordered by language)
            val subs = stream.optJSONArray("subtitles") ?: JSONArray()
            val saved = JSONArray()
            val dir = File(app.filesDir, "download-subs/$id").apply { mkdirs() }
            for (i in 0 until minOf(subs.length(), 3)) {
                val s = subs.optJSONObject(i) ?: continue
                val file = File(dir, "$i." + (Uri.parse(s.optString("url")).lastPathSegment?.substringAfterLast('.', "srt")?.take(4)?.takeIf { it.matches(Regex("srt|vtt|ass|ssa")) } ?: "srt"))
                val ok = runCatching {
                    http.newCall(Request.Builder().url(s.optString("url")).build()).execute().use { r ->
                        if (!r.isSuccessful) return@use false
                        file.outputStream().use { out -> r.body!!.byteStream().copyTo(out) }
                        true
                    }
                }.getOrDefault(false)
                // (addons' links often have no extension: the file's first line says what it is)
                val named = if (!ok) file else runCatching {
                    val head = file.inputStream().use { input -> ByteArray(512).let { b -> String(b, 0, maxOf(0, input.read(b)), Charsets.UTF_8) } }.trimStart('\uFEFF', ' ', '\r', '\n')
                    val ext = when {
                        head.startsWith("WEBVTT") -> "vtt"
                        head.startsWith("[Script Info]", ignoreCase = true) -> "ass"
                        else -> file.extension
                    }
                    if (ext == file.extension) file else File(dir, "$i.$ext").also { file.renameTo(it) }
                }.getOrDefault(file)
                if (ok) saved.put(JSONObject(s.toString()).put("url", Uri.fromFile(named).toString()))
            }
            stream.put("subtitles", saved)
            if (old != null) DownloadService.sendRemoveDownload(app, DownloadsService::class.java, id, false)
            val request = DownloadRequest.Builder(id, Uri.parse(url)).setData(stream.toString().toByteArray()).build()
            DownloadService.sendAddDownload(app, DownloadsService::class.java, request, false)
        }
        return true
    }

    fun remove(context: Context, item: Item) {
        DownloadService.sendRemoveDownload(context.applicationContext, DownloadsService::class.java, item.id, false)
        TorrentEngine.hashOf(item.stream.optString("url"))?.let { TorrentEngine.drop(context.applicationContext, it, torrentDir(context.applicationContext)) }
        File(context.applicationContext.filesDir, "download-subs/${item.id}").deleteRecursively()
        prefsOf(context).edit().remove("pos:${item.id}").remove("watched:${item.id}").apply()
    }

    fun pause(context: Context, item: Item) =
        DownloadService.sendSetStopReason(context.applicationContext, DownloadsService::class.java, item.id, 1, false)

    fun resume(context: Context, item: Item) =
        DownloadService.sendSetStopReason(context.applicationContext, DownloadsService::class.java, item.id, Download.STOP_REASON_NONE, false)

    /** A failed one, again (the same link: Torrentio's ask the debrid service afresh each time) */
    fun retry(context: Context, item: Item) {
        DownloadService.sendRemoveDownload(context.applicationContext, DownloadsService::class.java, item.id, false)
        handler.postDelayed({
            val request = DownloadRequest.Builder(item.id, Uri.parse(item.stream.optString("url"))).setData(item.stream.toString().toByteArray()).build()
            DownloadService.sendAddDownload(context.applicationContext, DownloadsService::class.java, request, false)
        }, 400)
    }

    fun setWatched(context: Context, item: Item, watched: Boolean) {
        prefsOf(context).edit().apply { if (watched) putLong("watched:${item.id}", System.currentTimeMillis()) else remove("watched:${item.id}") }.apply()
        refresh()
    }

    /** Deletes every download that's been watched */
    fun removeWatched(context: Context) = _items.value.filter { it.watched && it.done }.forEach { remove(context, it) }

    /** Plays a download in dx.bi's player, from the phone, where it was left */
    fun play(context: Context, item: Item) {
        val stream = JSONObject(item.stream.toString())
            .put("offline", item.id)
            .put("startMs", prefsOf(context).getLong("pos:${item.id}", item.stream.optLong("startMs", 0L)))
            // (no up-next card or skip times offline: those come from the internet)
            .put("next", JSONObject.NULL)
        context.startActivity(Intent(context, PlayerActivity::class.java).putExtra(PlayerActivity.EXTRA_STREAM, stream.toString()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /** Where a download was left (the player says when it closes): near the end counts as watched */
    fun leftAt(id: String, positionMs: Long, durationMs: Long, ended: Boolean) {
        if (!::prefs.isInitialized) return
        val finished = ended || (durationMs > 60_000 && positionMs >= durationMs * 0.92)
        prefs.edit().putLong("pos:$id", if (finished) 0L else positionMs).apply {
            if (finished && !prefs.contains("watched:$id")) putLong("watched:$id", System.currentTimeMillis())
        }.apply()
        refresh()
    }

    // ---------------------------------------------------------------------------------------------
    // Settings

    fun setQuality(context: Context, quality: String) {
        prefsOf(context).edit().putString("quality", quality).apply()
        _settings.value = _settings.value.copy(quality = quality)
    }

    fun setAutoDelete(context: Context, mode: String) {
        prefsOf(context).edit().putString("autoDelete", mode).apply()
        _settings.value = _settings.value.copy(autoDelete = mode)
        refresh()
    }

    fun setWifiOnly(context: Context, on: Boolean) {
        prefsOf(context).edit().putBoolean("wifiOnly", on).apply()
        _settings.value = _settings.value.copy(wifiOnly = on)
        manager?.requirements = requirements()
    }

    /**
     * Moves downloads to another place (the phone or a memory card), then restarts dx.bi: the
     * downloads' store can't be reopened somewhere else while the app runs. [progress] hears how far
     * the copy is (0 to 1), on another thread.
     */
    fun moveTo(activity: Activity, place: Place, progress: (Float) -> Unit, failed: (String) -> Unit) {
        val app = activity.applicationContext
        val from = folder(app)
        if (from == place.dir) return
        manager?.pauseDownloads()
        thread(name = "dxbi-download-move") {
            try {
                Thread.sleep(800) // (the running ones let go of their files)
                val files = from.walkTopDown().filter { it.isFile }.toList()
                val total = files.sumOf { it.length() }.coerceAtLeast(1)
                if (place.free in 0 until total + 100_000_000L) error("Not enough space there: it needs ${"%.1f".format(total / 1e9)} GB.")
                var copied = 0L
                for (f in files) {
                    val to = File(place.dir, f.relativeTo(from).path)
                    to.parentFile?.mkdirs()
                    f.inputStream().use { input -> to.outputStream().use { out ->
                        val buf = ByteArray(1 shl 16)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            copied += n
                            progress(copied.toFloat() / total)
                        }
                    } }
                }
                prefs.edit().putInt("storage", place.index).commit()
                from.deleteRecursively()
                handler.post {
                    // start again as a new process, in the new place
                    val start = activity.packageManager.getLaunchIntentForPackage(activity.packageName)?.component
                    if (start != null) activity.startActivity(Intent.makeRestartActivityTask(start))
                    Runtime.getRuntime().exit(0)
                }
            } catch (e: Exception) {
                place.dir.deleteRecursively()
                manager?.resumeDownloads()
                handler.post { failed(e.message ?: "Couldn't move them.") }
            }
        }
    }

    // ---------------------------------------------------------------------------------------------

    private val tick = Runnable { refresh() }

    fun refresh() {
        val m = manager ?: return
        val list = mutableListOf<Item>()
        val now = System.currentTimeMillis()
        runCatching {
            m.downloadIndex.getDownloads().use { c ->
                while (c.moveToNext()) {
                    val d = c.download
                    val stream = runCatching { JSONObject(String(d.request.data)) }.getOrDefault(JSONObject())
                    list += Item(d.request.id, stream, d.state, d.percentDownloaded.coerceAtLeast(0f), d.bytesDownloaded, d.contentLength, d.stopReason != Download.STOP_REASON_NONE, prefs.getLong("watched:${d.request.id}", 0L))
                }
            }
        }
        // (the index only keeps how far a download got now and then: the ones running are read live)
        val live = m.currentDownloads.associateBy { it.request.id }
        val items = list.map { i -> live[i.id]?.let { d -> Item(i.id, i.stream, d.state, d.percentDownloaded.coerceAtLeast(0f), d.bytesDownloaded, d.contentLength, d.stopReason != Download.STOP_REASON_NONE, i.watchedAt) } ?: i }
            .sortedWith(compareBy({ it.stream.optString("title") }, { it.season ?: 0 }, { it.number ?: 0 }))
        // watched ones go the way Downloads → Settings says
        val wait = when (_settings.value.autoDelete) { "finished" -> 0L; "day" -> 24 * 3600 * 1000L; else -> -1L }
        val gone = if (wait < 0) emptyList() else items.filter { it.done && it.watched && now - it.watchedAt >= wait }
        _items.value = items - gone.toSet()
        _waiting.value = m.notMetRequirements != 0 && items.any { !it.done && !it.failed && !it.paused }
        // torrents fetch only while their download runs (not paused, or waiting for Wi-Fi)
        TorrentEngine.keepRunning(m.currentDownloads.filter { it.state == Download.STATE_DOWNLOADING }.mapNotNull { TorrentEngine.hashOf(it.request.uri.toString()) }.toSet())
        appContext?.let { c -> if (gone.isNotEmpty()) handler.post { gone.forEach { remove(c, it) } } }
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

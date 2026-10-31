package com.notdxbi.dxbi.tv

import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.annotation.OptIn
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.ui.PlayerView
import androidx.media3.ui.SubtitleView
import okhttp3.OkHttpClient
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * The native player: plays the stream Stremio picked (MKV, HEVC, HDR and surround sound included,
 * as far as the TV's hardware can), with the addons' subtitles. Reports its position back so the
 * watch progress is kept.
 */
@OptIn(UnstableApi::class)
class PlayerActivity : AppCompatActivity() {

    private lateinit var playerView: PlayerView
    private lateinit var controls: PlayerControls
    private lateinit var clock: TextView
    private var showClock = true
    private lateinit var seekFlash: TextView
    private var player: ExoPlayer? = null
    private val handler = Handler(Looper.getMainLooper())
    private var closed = false
    private var lastError: String? = null
    private var lastText: List<String?> = emptyList()

    private val reportProgress = object : Runnable {
        override fun run() {
            report()
            handler.postDelayed(this, PROGRESS_INTERVAL_MS)
        }
    }
    private val hideFlash = Runnable { seekFlash.visibility = View.GONE }

    // Skip intro / recap / credits: the episode's times (seconds; end -1 = to the end), whether dx.bi
    // skips by itself ("intro": intros and recaps, "all": credits too), and which were skipped already
    private class Segment(val type: String, val start: Double, val end: Double)
    private var segments: List<Segment> = emptyList()
    private var autoSkip = "off"
    private val autoSkipped = mutableSetOf<Segment>()
    private var showing: Segment? = null
    private lateinit var skipButton: TextView
    // A torrent played on the TV itself: how it's going, while the picture waits for it
    private var torrent = false
    private val torrentStatus = object : Runnable {
        override fun run() {
            val exo = player
            val waiting = exo == null || exo.playbackState == Player.STATE_BUFFERING || exo.playbackState == Player.STATE_IDLE
            val text = if (torrent && waiting) TorrentEngine.status() else null
            if (text != null) {
                seekFlash.text = text
                seekFlash.visibility = View.VISIBLE
            } else if (seekFlash.text.contains("peer") || seekFlash.text.startsWith("Finding")) {
                seekFlash.visibility = View.GONE
            }
            handler.postDelayed(this, 700)
        }
    }
    private val updateClock = object : Runnable {
        override fun run() {
            val exo = player
            if (exo != null) {
                val format = android.text.format.DateFormat.getTimeFormat(this@PlayerActivity)
                val left = if (exo.duration > 0) ((exo.duration - exo.currentPosition) / exo.playbackParameters.speed).toLong() else 0L
                val now = System.currentTimeMillis()
                clock.text = format.format(now) + if (left > 0) " · Ends at ${format.format(now + left)}" else ""
            }
            handler.postDelayed(this, 1000)
        }
    }
    private val checkSkip = object : Runnable {
        override fun run() {
            updateSkip()
            handler.postDelayed(this, 500)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        setContentView(R.layout.activity_player)
        playerView = findViewById(R.id.player_view)
        clock = findViewById(R.id.clock)
        seekFlash = findViewById(R.id.seek_flash)
        skipButton = findViewById(R.id.skip_button)
        skipButton.setOnClickListener { doSkip() }

        val stream = JSONObject(intent.getStringExtra(EXTRA_STREAM) ?: "{}")
        segments = stream.optJSONArray("skips")?.let { list ->
            (0 until list.length()).mapNotNull { i ->
                val o = list.optJSONObject(i) ?: return@mapNotNull null
                val type = o.optString("type")
                if (type !in setOf("intro", "recap", "credits")) return@mapNotNull null
                Segment(type, o.optDouble("start", 0.0), if (o.isNull("end")) -1.0 else o.optDouble("end", -1.0))
            }
        } ?: emptyList()
        autoSkip = stream.optString("autoSkip", "off")
        showClock = stream.optBoolean("clock", true)
        torrent = stream.optBoolean("torrent", false)
        findViewById<TextView>(R.id.title).text = stream.optString("title")
        findViewById<TextView>(R.id.subtitle).apply {
            text = stream.optString("subtitle")
            visibility = if (text.isNullOrEmpty()) View.GONE else View.VISIBLE
        }

        stream.optJSONObject("subtitleStyle")?.let { styleSubtitles(it) }

        val url = stream.optString("url")
        if (url.isEmpty()) {
            finishWith(error = "no stream address")
            return
        }

        // Addons can ask for headers on their links (Stremio's proxyHeaders)
        val headers = mutableMapOf<String, String>()
        stream.optJSONObject("headers")?.let { h -> h.keys().forEach { k -> headers[k] = h.optString(k) } }
        val http = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            // a torrent's first bytes wait for its details and first pieces to come from peers
            .readTimeout(if (torrent) 150L else 30L, TimeUnit.SECONDS)
            .followRedirects(true)
            .build()
        // (an addon's own User-Agent replaces ours: Media3 would send both)
        val ownAgent = headers.keys.any { it.equals("User-Agent", ignoreCase = true) }
        val dataSource = OkHttpDataSource.Factory(http)
            .setUserAgent(if (ownAgent) null else "dxbi-tv/${BuildConfigVersion.name(this)}")
            .setDefaultRequestProperties(headers)

        // The TV's own decoders first, falling back to software ones when a format isn't supported
        val renderers = DefaultRenderersFactory(this)
            .setEnableDecoderFallback(true)
            .setExtensionRendererMode(DefaultRenderersFactory.EXTENSION_RENDERER_MODE_ON)

        val exo = ExoPlayer.Builder(this, renderers)
            .setMediaSourceFactory(DefaultMediaSourceFactory(dataSource))
            .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true)
            .setHandleAudioBecomingNoisy(true)
            .setSeekBackIncrementMs(SEEK_STEP_MS)
            .setSeekForwardIncrementMs(SEEK_STEP_MS)
            .build()
        player = exo
        playerView.player = exo
        val accent = try { Color.parseColor(stream.optString("accent")) } catch (_: Exception) { Color.parseColor("#E50914") }
        controls = PlayerControls(this, playerView, exo, accent, clock.takeIf { showClock }, stream.optBoolean("hasNext"), ::seek) { next -> finishWith(next = next) }

        // Subtitles start off, like Netflix (and dx.bi's default): pick one from the subtitles button.
        // Files with several audio tracks (dual-audio releases) start in Stremio's audio language
        // (Settings → Player), when they have it
        val audioLanguage = stream.optString("audioLanguage").ifEmpty { null }
        exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
            .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
            .setPreferredTextLanguage(null)
            .setSelectUndeterminedTextLanguage(false)
            .apply { if (audioLanguage != null) setPreferredAudioLanguage(audioLanguage) }
            .build()

        val subtitles = mutableListOf<MediaItem.SubtitleConfiguration>()
        stream.optJSONArray("subtitles")?.let { list ->
            for (i in 0 until list.length()) {
                val s = list.optJSONObject(i) ?: continue
                val subUrl = s.optString("url").takeIf { it.isNotEmpty() } ?: continue
                subtitles += MediaItem.SubtitleConfiguration.Builder(Uri.parse(subUrl))
                    .setMimeType(subtitleMime(subUrl))
                    .setLanguage(s.optString("lang").ifEmpty { null })
                    .setLabel(s.optString("label").ifEmpty { s.optString("lang") })
                    .setSelectionFlags(0)
                    .build()
            }
        }

        val item = MediaItem.Builder()
            .setUri(Uri.parse(url))
            .setSubtitleConfigurations(subtitles)
            .build()
        exo.setMediaItem(item, stream.optLong("startMs", 0L).coerceAtLeast(0L))
        exo.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) finishWith(ended = true)
            }

            // A subtitle switched on mid-line only shows from its next line: a seek to where we are
            // brings the current one up straight away
            override fun onTracksChanged(tracks: Tracks) {
                val text = tracks.groups.filter { it.type == C.TRACK_TYPE_TEXT }.flatMap { g -> (0 until g.length).filter { g.isTrackSelected(it) }.map { i -> g.getTrackFormat(i).id } }
                if (text.isNotEmpty() && text != lastText) exo.seekTo(exo.currentPosition)
                lastText = text
            }

            override fun onPlayerError(error: PlaybackException) {
                lastError = (if (torrent) TorrentEngine.failed() else null) ?: describe(error)
                finishWith(error = lastError)
            }
        })
        exo.prepare()
        exo.playWhenReady = true
        handler.postDelayed(reportProgress, PROGRESS_INTERVAL_MS)
        if (showClock) handler.post(updateClock)
        if (segments.isNotEmpty()) handler.postDelayed(checkSkip, 500)
        if (torrent) handler.post(torrentStatus)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            // Back leaves the player straight away, like Netflix (the position is kept)
            override fun handleOnBackPressed() {
                if (!controls.closePanel()) finishWith()
            }
        })
    }

    /**
     * With the controls hidden, the remote works like Netflix's: left/right skip 10 seconds, OK
     * pauses or plays. With the controls showing, the arrows move between them as usual.
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val exo = player ?: return super.dispatchKeyEvent(event)
        if (event.action == KeyEvent.ACTION_DOWN) {
            when (event.keyCode) {
                KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_SPACE -> { exo.playWhenReady = !exo.playWhenReady; controls.show(); return true }
                KeyEvent.KEYCODE_MEDIA_PLAY -> { exo.play(); return true }
                KeyEvent.KEYCODE_MEDIA_PAUSE -> { exo.pause(); controls.show(); return true }
                KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> { seek(+1); return true }
                KeyEvent.KEYCODE_MEDIA_REWIND -> { seek(-1); return true }
            }
            // OK presses Skip while it's up (and the controls aren't)
            if (showing != null && !controls.visible && (event.keyCode == KeyEvent.KEYCODE_DPAD_CENTER || event.keyCode == KeyEvent.KEYCODE_ENTER)) {
                doSkip()
                return true
            }
            if (controls.visible) controls.poke()
            if (!controls.visible) {
                when (event.keyCode) {
                    KeyEvent.KEYCODE_DPAD_LEFT -> { seek(-1); return true }
                    KeyEvent.KEYCODE_DPAD_RIGHT -> { seek(+1); return true }
                    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                        exo.playWhenReady = !exo.playWhenReady
                        controls.show()
                        return true
                    }
                    KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN -> { controls.show(); return true }
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun segmentEnd(s: Segment, durationMs: Long): Long =
        if (s.end < 0) durationMs else (s.end * 1000).toLong()

    private fun updateSkip() {
        val exo = player ?: return
        val duration = exo.duration.takeIf { it != C.TIME_UNSET } ?: return
        val now = exo.currentPosition
        // (not the last second of a part: pressing then would skip nothing)
        val seg = segments.firstOrNull { now >= (it.start * 1000).toLong() && now < segmentEnd(it, duration) - 1000 }
        val auto = seg != null && (autoSkip == "all" || (autoSkip == "intro" && seg.type != "credits"))
        if (seg != null && auto && seg !in autoSkipped) {
            autoSkipped += seg
            doSkip(seg)
            return
        }
        if (seg == showing) return
        showing = seg
        if (seg == null) {
            skipButton.visibility = View.GONE
            return
        }
        skipButton.text = when (seg.type) {
            "intro" -> "Skip intro"
            "recap" -> "Skip recap"
            else -> "Skip credits"
        }
        skipButton.visibility = View.VISIBLE
        if (!controls.visible) skipButton.requestFocus()
    }

    private fun doSkip(seg: Segment? = showing) {
        val exo = player ?: return
        val s = seg ?: return
        val duration = exo.duration.takeIf { it != C.TIME_UNSET } ?: return
        exo.seekTo(segmentEnd(s, duration).coerceAtMost(duration))
        showing = null
        skipButton.visibility = View.GONE
        playerView.requestFocus()
    }

    private fun seek(direction: Int) {
        val exo = player ?: return
        if (direction > 0) exo.seekForward() else exo.seekBack()
        seekFlash.text = if (direction > 0) "+10 s   ${clock(exo.currentPosition)}" else "−10 s   ${clock(exo.currentPosition)}"
        seekFlash.visibility = View.VISIBLE
        handler.removeCallbacks(hideFlash)
        handler.postDelayed(hideFlash, 900)
    }

    private fun report() {
        val exo = player ?: return
        val duration = exo.duration.takeIf { it != C.TIME_UNSET } ?: 0L
        PlaybackBus.listener?.onProgress(exo.currentPosition, duration, !exo.isPlaying)
    }

    private fun finishWith(ended: Boolean = false, error: String? = null, next: Boolean = false) {
        if (closed) return
        closed = true
        handler.removeCallbacksAndMessages(null)
        if (::controls.isInitialized) controls.release()
        val exo = player
        val duration = exo?.duration?.takeIf { it != C.TIME_UNSET } ?: 0L
        val position = if (ended) duration else exo?.currentPosition ?: 0L
        PlaybackBus.closed(position, duration, ended, error, next)
        if (torrent) TorrentEngine.close()
        finish()
    }

    override fun onPause() {
        super.onPause()
        // Leaving the app (Home button) pauses, and the progress so far is kept
        player?.pause()
        report()
    }

    override fun onDestroy() {
        if (!closed) finishWith()
        handler.removeCallbacksAndMessages(null)
        if (::controls.isInitialized) controls.release()
        player?.release()
        player = null
        super.onDestroy()
    }

    /**
     * Stremio's subtitle settings (size, colours, outline, position) instead of the player's white
     * text on black boxes. Colours come as #RRGGBB or #RRGGBBAA.
     */
    private fun styleSubtitles(style: JSONObject) {
        val view = playerView.subtitleView ?: return
        fun color(key: String, fallback: Int): Int {
            val hex = style.optString(key).removePrefix("#")
            val v = hex.toLongOrNull(16) ?: return fallback
            return when (hex.length) {
                6 -> (0xFF000000 or v).toInt()
                8 -> ((v and 0xFF) shl 24 or (v ushr 8)).toInt()
                else -> fallback
            }
        }
        val opacity = (style.optDouble("opacity", 100.0) / 100).coerceIn(0.0, 1.0)
        val text = color("text", Color.WHITE).let { Color.argb((Color.alpha(it) * opacity).toInt(), Color.red(it), Color.green(it), Color.blue(it)) }
        val outline = color("outline", Color.BLACK)
        val typeface = if (style.optBoolean("bold")) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        view.setStyle(CaptionStyleCompat(
            text,
            color("background", Color.TRANSPARENT),
            Color.TRANSPARENT,
            if (Color.alpha(outline) > 0) CaptionStyleCompat.EDGE_TYPE_OUTLINE else CaptionStyleCompat.EDGE_TYPE_NONE,
            outline,
            typeface,
        ))
        // the file's own colours and sizes would win over these otherwise
        view.setApplyEmbeddedStyles(false)
        view.setApplyEmbeddedFontSizes(false)
        val size = style.optDouble("size", 100.0).coerceIn(50.0, 300.0) / 100
        view.setFractionalTextSize((SubtitleView.DEFAULT_TEXT_SIZE_FRACTION * size).toFloat())
        // Stremio's offset is how far up from the bottom of the picture the lines sit
        val offset = style.optDouble("offset", 5.0).coerceIn(0.0, 40.0) / 100
        view.setBottomPaddingFraction(0f)
        view.addOnLayoutChangeListener { v, _, top, _, bottom, _, _, _, _ ->
            val pad = ((bottom - top) * offset).toInt()
            if (v.paddingBottom != pad) v.post { v.setPadding(0, 0, 0, pad) }
        }
    }

    private fun subtitleMime(url: String): String {
        val path = Uri.parse(url).lastPathSegment?.lowercase() ?: ""
        return when {
            path.endsWith(".vtt") -> MimeTypes.TEXT_VTT
            path.endsWith(".ass") || path.endsWith(".ssa") -> MimeTypes.TEXT_SSA
            path.endsWith(".ttml") || path.endsWith(".dfxp") -> MimeTypes.APPLICATION_TTML
            else -> MimeTypes.APPLICATION_SUBRIP
        }
    }

    private fun describe(error: PlaybackException): String = when (error.errorCode) {
        PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS -> "the server refused it"
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT -> "the connection failed"
        PlaybackException.ERROR_CODE_DECODER_INIT_FAILED,
        PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED,
        PlaybackException.ERROR_CODE_DECODING_FORMAT_EXCEEDS_CAPABILITIES ->
            // No software decoders are bundled: DTS and TrueHD audio (common in BluRay rips) only play
            // on TVs that decode them
            "this TV can't decode its video or audio format (DTS and TrueHD audio often can't play: pick a release with AAC, AC3 or DD+ audio)"
        PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED -> "its file format isn't supported"
        else -> error.errorCodeName.removePrefix("ERROR_CODE_").lowercase().replace('_', ' ')
    }

    private fun clock(ms: Long): String {
        val s = ms / 1000
        return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60) else "%d:%02d".format(s / 60, s % 60)
    }

    companion object {
        const val EXTRA_STREAM = "stream"
        private const val PROGRESS_INTERVAL_MS = 5000L
        private const val SEEK_STEP_MS = 10_000L
    }
}

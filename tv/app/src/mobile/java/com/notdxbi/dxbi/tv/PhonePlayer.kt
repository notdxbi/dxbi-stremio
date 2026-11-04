package com.notdxbi.dxbi.tv

import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Rational
import android.widget.FrameLayout
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import org.json.JSONObject

/**
 * The phone app's part of [PlayerActivity]: controls laid out like a streaming app's and worked by
 * touch, gestures, a small window when leaving the app, lock screen and headphone controls, carrying
 * on in another app, and downloads played from the phone.
 */
@UnstableApi
class PhonePlayer(private val host: PlayerHost, private val stream: JSONObject) : PlayerHooks {

    private val activity get() = host.activity
    private var exo: ExoPlayer? = null
    private var gestures: PlayerGestures? = null
    private var session: MediaSession? = null
    private var listening = false

    /** A download playing from the phone (its id), rather than a stream the page handed over */
    private val offlineId = stream.optString("offline").ifEmpty { null }

    // Carrying on in another app (VLC, mpv…) from where this one is: where it got to is where this
    // video's progress stands
    private val elsewhere = activity.registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val r = ExternalPlayer.result(result.data)
        if (r.positionMs > 0) host.finishWith(ended = r.ended, positionMs = r.positionMs, durationMs = r.durationMs) else host.finishWith()
    }

    override fun dataSource(online: DataSource.Factory): DataSource.Factory =
        if (offlineId != null) Downloads.playback(activity) else online

    override fun controls(exo: ExoPlayer, sound: SoundMode, zoom: PictureZoom, accent: Int, hasNext: Boolean, showClock: Boolean): Controls =
        PhoneControls(
            activity, host.playerView, exo, sound, zoom, host::shiftSubtitles, accent,
            title = stream.optString("title"),
            subtitle = stream.optString("subtitle"),
            hasNext = hasNext,
            showClock = showClock,
            seek = host::seek,
            leaveParty = host::leaveParty,
            leave = { go -> host.finishWith(next = go) },
            onLock = { gestures?.lock() },
            onUnlock = { gestures?.unlock() },
            onExternal = ::playElsewhere,
        )

    override fun started(exo: ExoPlayer, controls: Controls) {
        this.exo = exo
        // headphone buttons, Bluetooth and the small window's controls reach the player
        // (an id of its own: Up Next opens the next player before this one is gone, and two sessions
        // with one id crash the app)
        session = MediaSession.Builder(activity, exo).setId("dxbi-player-${System.identityHashCode(this)}").build()
        // taps, double taps, slides and pinches (the remote still works the same everywhere)
        val touch = PlayerGestures(activity, host.playerView, exo, controls, host::seek, host::flash).also { gestures = it }
        touch.onLockedTap = { (controls as? PhoneControls)?.showUnlock() }
        host.playerView.setOnTouchListener(touch)
        // messages (±10 s, brightness, speed…) small at the top, off the picture's middle
        val flash = host.seekFlash
        val density = activity.resources.displayMetrics.density
        flash.layoutParams = (flash.layoutParams as FrameLayout.LayoutParams).apply { topMargin = (22 * density).toInt() }
        flash.textSize = 14f
        (6 * density).toInt().let { v -> flash.setPadding(v * 2, v, v * 2, v) }
        ContextCompat.registerReceiver(activity, pipButtons, IntentFilter(ACTION_PIP), ContextCompat.RECEIVER_NOT_EXPORTED)
        listening = true
        changed()
    }

    override fun subtitleId(source: String, index: Int) = "$source:$index"

    private fun playElsewhere() {
        val exo = exo ?: return
        if (offlineId != null) return host.flash("Downloads play here only", 1500)
        val chooser = ExternalPlayer.chooser(stream, exo.currentPosition) ?: return
        exo.pause()
        try {
            elsewhere.launch(chooser)
        } catch (_: Exception) {
            ExternalPlayer.noApp(activity)
        }
    }

    // A download wasn't handed over by the page: its place is kept here instead
    override fun keep(positionMs: Long, durationMs: Long, ended: Boolean): Boolean {
        val id = offlineId ?: return false
        Downloads.leftAt(id, positionMs, durationMs, ended)
        return true
    }

    // -----------------------------------------------------------------------------------------------
    // Leaving the app while a video plays keeps it playing in a small window

    private val pipButtons = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.getStringExtra("do")) {
                "play" -> exo?.play()
                "pause" -> exo?.pause()
                "back" -> exo?.seekBack()
                "forward" -> exo?.seekForward()
            }
        }
    }

    private fun pipAction(icon: Int, title: String, what: String, code: Int): RemoteAction {
        val intent = PendingIntent.getBroadcast(activity, code, Intent(ACTION_PIP).setPackage(activity.packageName).putExtra("do", what), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return RemoteAction(Icon.createWithResource(activity, icon), title, title, intent)
    }

    private fun pipParams(): PictureInPictureParams? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null
        val exo = exo ?: return null
        val size = exo.videoSize
        // (Android only takes shapes between 2.39:1 and 1:2.39)
        val ratio = if (size.width > 0 && size.height > 0) Rational(size.width, size.height) else Rational(16, 9)
        val shape = when {
            ratio.toFloat() > 2.39f -> Rational(239, 100)
            ratio.toFloat() < 1 / 2.39f -> Rational(100, 239)
            else -> ratio
        }
        val playing = exo.isPlaying
        val builder = PictureInPictureParams.Builder()
            .setAspectRatio(shape)
            .setActions(listOf(
                pipAction(R.drawable.ic_rewind, "Back 10 seconds", "back", 1),
                if (playing) pipAction(R.drawable.ic_pause, "Pause", "pause", 2) else pipAction(R.drawable.ic_play, "Play", "play", 2),
                pipAction(R.drawable.ic_forward, "Forward 10 seconds", "forward", 3),
            ))
        // Android 12 and later go into the small window by themselves, smoothly
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setAutoEnterEnabled(playing).setSeamlessResizeEnabled(true)
        return builder.build()
    }

    // the small window takes the video's shape, and its play button follows the player
    override fun changed() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        pipParams()?.let { runCatching { activity.setPictureInPictureParams(it) } }
    }

    override fun leaving() {
        // (before Android 12 the app asks for the small window itself)
        if (Build.VERSION.SDK_INT in Build.VERSION_CODES.O until Build.VERSION_CODES.S && exo?.isPlaying == true) {
            pipParams()?.let { runCatching { activity.enterPictureInPictureMode(it) } }
        }
    }

    override fun release() {
        gestures?.release()
        if (listening) runCatching { activity.unregisterReceiver(pipButtons) }
        listening = false
        session?.release()
        session = null
    }

    private companion object {
        const val ACTION_PIP = "com.notdxbi.dxbi.tv.PIP"
    }
}

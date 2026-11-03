package com.notdxbi.dxbi.tv

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.mediarouter.app.MediaRouteChooserDialog
import com.google.android.gms.cast.CastMediaControlIntent
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaLoadRequestData
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastOptions
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.OptionsProvider
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.SessionProvider
import com.google.android.gms.cast.framework.media.CastMediaOptions
import com.google.android.gms.cast.framework.media.NotificationOptions
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import com.google.android.gms.cast.framework.media.widget.ExpandedControllerActivity
import com.google.android.gms.common.images.WebImage
import org.json.JSONObject

/**
 * Phones: a stream played on a Chromecast or Google TV instead, through Google's own receiver, with
 * Google's casting controls. Its position goes back to Stremio as it plays, like the built-in player's.
 * Only direct and debrid streams: a torrent playing on the phone can't be reached by the TV.
 */
object Cast {

    @Volatile private var pending: String? = null
    private var lastMs = 0L
    private var durationMs = 0L
    private var casting = false

    fun context(context: Context): CastContext? = try {
        @Suppress("DEPRECATION") CastContext.getSharedInstance(context)
    } catch (_: Exception) {
        null // no Google Play services (Fire TV, some phones)
    }

    /** Whether a Chromecast is connected right now (Play then goes to it) */
    fun connected(context: Context): Boolean = context(context)?.sessionManager?.currentCastSession?.isConnected == true

    fun play(activity: MainActivity, json: String) {
        val cast = context(activity) ?: return fail(activity, "Casting needs Google Play services, which this device doesn't have")
        val stream = JSONObject(json)
        if (stream.optBoolean("torrent") || stream.optString("url").isEmpty()) return fail(activity, "Torrents can't be cast. Pick a debrid or direct stream.")
        val session = cast.sessionManager.currentCastSession
        if (session?.isConnected == true) {
            load(activity, session, stream)
            return
        }
        // Not connected yet: choose a device first, then it plays
        pending = json
        cast.sessionManager.addSessionManagerListener(object : SessionManagerListener<CastSession> {
            override fun onSessionStarted(session: CastSession, sessionId: String) {
                cast.sessionManager.removeSessionManagerListener(this, CastSession::class.java)
                pending?.let { load(activity, session, JSONObject(it)) }
                pending = null
            }
            override fun onSessionStartFailed(session: CastSession, error: Int) {
                cast.sessionManager.removeSessionManagerListener(this, CastSession::class.java)
                if (pending != null) fail(activity, "Couldn't connect to that device")
                pending = null
            }
            override fun onSessionStarting(session: CastSession) {}
            override fun onSessionEnding(session: CastSession) {}
            override fun onSessionEnded(session: CastSession, error: Int) {}
            override fun onSessionResuming(session: CastSession, sessionId: String) {}
            override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) {}
            override fun onSessionResumeFailed(session: CastSession, error: Int) {}
            override fun onSessionSuspended(session: CastSession, reason: Int) {}
        }, CastSession::class.java)
        MediaRouteChooserDialog(activity).apply {
            routeSelector = cast.mergedSelector ?: return fail(activity, "No cast devices found")
            setOnDismissListener {
                // closed without choosing: back to where they were
                activity.window.decorView.postDelayed({
                    if (pending != null && cast.sessionManager.currentCastSession?.isConnected != true) {
                        pending = null
                        PlaybackBus.closed(0, 0, ended = false, error = null)
                    }
                }, 1500)
            }
        }.show()
    }

    private fun load(context: Context, session: CastSession, stream: JSONObject) {
        val remote = session.remoteMediaClient ?: return fail(context, "That device can't play videos")
        val url = stream.optString("url")
        val path = Uri.parse(url).lastPathSegment.orEmpty().lowercase()
        val type = when {
            path.endsWith(".mkv") -> "video/x-matroska"
            path.endsWith(".webm") -> "video/webm"
            path.endsWith(".m3u8") -> "application/x-mpegurl"
            else -> "video/mp4"
        }
        val metadata = MediaMetadata(MediaMetadata.MEDIA_TYPE_MOVIE).apply {
            putString(MediaMetadata.KEY_TITLE, stream.optString("title"))
            stream.optString("subtitle").takeIf { it.isNotEmpty() }?.let { putString(MediaMetadata.KEY_SUBTITLE, it) }
            stream.optString("background").takeIf { it.startsWith("http") }?.let { addImage(WebImage(Uri.parse(it))) }
        }
        val info = MediaInfo.Builder(url).setStreamType(MediaInfo.STREAM_TYPE_BUFFERED).setContentType(type).setMetadata(metadata).build()
        lastMs = stream.optLong("startMs", 0L)
        durationMs = 0L
        casting = true
        remote.load(MediaLoadRequestData.Builder().setMediaInfo(info).setAutoplay(true).setCurrentTime(lastMs).build())
        remote.addProgressListener({ position, duration ->
            if (!casting) return@addProgressListener
            if (position > 0) lastMs = position
            if (duration > 0) durationMs = duration
            PlaybackBus.listener?.onProgress(lastMs, durationMs, !remote.isPlaying)
        }, 5000)
        remote.registerCallback(object : RemoteMediaClient.Callback() {
            override fun onStatusUpdated() {
                val status = remote.mediaStatus ?: return
                if (casting && status.playerState == MediaStatus.PLAYER_STATE_IDLE && status.idleReason != MediaStatus.IDLE_REASON_NONE) {
                    remote.unregisterCallback(this)
                    finish(ended = status.idleReason == MediaStatus.IDLE_REASON_FINISHED, error = if (status.idleReason == MediaStatus.IDLE_REASON_ERROR) "the cast device couldn't play it (it may not support this file's format)" else null)
                }
            }
        })
        context.startActivity(Intent(context, ExpandedControllerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    private fun finish(ended: Boolean, error: String?) {
        if (!casting) return
        casting = false
        PlaybackBus.closed(if (ended) durationMs else lastMs, durationMs, ended, error)
    }

    private fun fail(context: Context, message: String) {
        Toast.makeText(context, message, Toast.LENGTH_LONG).show()
        PlaybackBus.closed(0, 0, ended = false, error = null)
    }
}

/** What casting uses: Google's standard receiver, and its controls for the phone */
class CastSetup : OptionsProvider {
    override fun getCastOptions(context: Context): CastOptions = CastOptions.Builder()
        .setReceiverApplicationId(CastMediaControlIntent.DEFAULT_MEDIA_RECEIVER_APPLICATION_ID)
        .setCastMediaOptions(
            CastMediaOptions.Builder()
                .setExpandedControllerActivityClassName(ExpandedControllerActivity::class.java.name)
                .setNotificationOptions(NotificationOptions.Builder().setTargetActivityClassName(ExpandedControllerActivity::class.java.name).build())
                .build(),
        )
        .build()

    override fun getAdditionalSessionProviders(context: Context): List<SessionProvider>? = null
}

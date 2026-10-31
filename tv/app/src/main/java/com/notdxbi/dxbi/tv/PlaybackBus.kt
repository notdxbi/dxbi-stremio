package com.notdxbi.dxbi.tv

import android.content.Context
import android.content.pm.PackageManager
import org.json.JSONObject

/**
 * The player tells the main screen where it is, so Stremio keeps the watch progress.
 *
 * The stream being played and how it closed are kept here rather than in the page or the main
 * screen: Android can restart the page (and MainActivity recreates itself) while a video plays,
 * and the restarted page picks them up from here.
 */
object PlaybackBus {
    interface Listener {
        fun onProgress(positionMs: Long, durationMs: Long, paused: Boolean)
        fun onClosed()
    }

    @Volatile
    var listener: Listener? = null

    /** What the page handed to the player (its route and video included), while it plays */
    @Volatile
    var activePlayback: String? = null
        private set

    @Volatile
    private var pendingClose: String? = null

    fun started(json: String) {
        activePlayback = json
        pendingClose = null
    }

    fun closed(positionMs: Long, durationMs: Long, ended: Boolean, error: String?, next: Boolean = false) {
        val stream = try { JSONObject(activePlayback ?: "{}") } catch (_: Exception) { JSONObject() }
        pendingClose = JSONObject()
            .put("timeMs", positionMs)
            .put("durationMs", durationMs)
            .put("ended", ended)
            .put("next", next)
            .put("error", error ?: JSONObject.NULL)
            .put("hash", stream.optString("hash"))
            .put("videoId", stream.optString("videoId"))
            .toString()
        activePlayback = null
        listener?.onClosed()
    }

    @Synchronized
    fun takePendingClose(): String? = pendingClose.also { pendingClose = null }
}

object BuildConfigVersion {
    fun name(context: Context): String = try {
        context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "0"
    } catch (_: PackageManager.NameNotFoundException) {
        "0"
    }
}

package com.notdxbi.dxbi.tv

import android.widget.TextView
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView

// Where dx.bi for phones (the `mobile` flavor) joins dx.bi TV's code. Each flavor has its own `Phone`
// object: dx.bi TV's (src/tv) does nothing, so dx.bi TV runs as it always has; the phone app's
// (src/mobile) adds its native screens and its player's extras through these.

/** What the phone app's part of the player can ask of [PlayerActivity] */
interface PlayerHost {
    val activity: PlayerActivity
    val playerView: PlayerView
    val seekFlash: TextView
    fun seek(direction: Int)
    fun shiftSubtitles(byMs: Long): Long
    fun flash(text: String, forMs: Long)
    fun leaveParty()
    /** Closes the player ([positionMs]/[durationMs]: where another app left it, instead of this one) */
    fun finishWith(ended: Boolean = false, next: Boolean = false, positionMs: Long? = null, durationMs: Long? = null)
}

/** The phone app's part of the player: its controls, gestures, small window, lock screen and downloads */
@UnstableApi
interface PlayerHooks {
    /** Where the video comes from (a download plays from the phone) */
    fun dataSource(online: DataSource.Factory): DataSource.Factory
    fun controls(exo: ExoPlayer, sound: SoundMode, zoom: PictureZoom, accent: Int, hasNext: Boolean, showClock: Boolean): Controls
    fun started(exo: ExoPlayer, controls: Controls)
    /** A subtitle's id: where it came from, for the phone's subtitle menu */
    fun subtitleId(source: String, index: Int): String
    /** The video's shape, or playing or not, changed */
    fun changed()
    /** Leaving the app (Home) */
    fun leaving()
    /** Where the video got to; true when it keeps that itself (a download), rather than the page */
    fun keep(positionMs: Long, durationMs: Long, ended: Boolean): Boolean
    fun release()
}

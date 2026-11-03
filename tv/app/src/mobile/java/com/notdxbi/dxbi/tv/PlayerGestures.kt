package com.notdxbi.dxbi.tv

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Phones: the player by touch, the way streaming apps do it.
 *  - a tap in the middle plays or pauses; anywhere else it shows or hides the controls
 *  - a double tap on the left or right skips back or forward (keep tapping for more)
 *  - sliding sideways seeks, with where it'll land shown until the finger lifts
 *  - sliding up or down: brightness on the left, volume on the right
 *  - pinching zooms the picture to fill the screen, or back to all of it
 *  - holding plays at 2x; still holding, sliding right goes up to 4x and left down to 1.25x, a quarter
 *    at a time; letting go goes back to the speed it was
 *  - the lock button ignores every touch until it's unlocked
 */
@OptIn(UnstableApi::class)
class PlayerGestures(
    private val activity: PlayerActivity,
    private val playerView: PlayerView,
    private val exo: ExoPlayer,
    private val controls: Controls,
    private val seek: (Int) -> Unit,
    private val flash: (String, Long) -> Unit,
) : View.OnTouchListener {

    private val handler = Handler(Looper.getMainLooper())
    private val audio = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val slop = 24 * activity.resources.displayMetrics.density

    var locked = false
        private set

    private enum class Drag { None, Seek, Brightness, Volume }
    private var drag = Drag.None
    private var dragFrom = 0L
    private var dragTo = 0L
    private var startBrightness = 0.5f
    private var startVolume = 0
    private var pinch = 1f
    // holding for speed: the speed before, where the finger went down, the speed now
    private var holding = false
    private var holdFrom = 1f
    private var holdX = 0f
    private var holdSpeed = 2f
    private val step = 36 * activity.resources.displayMetrics.density

    /** A tap while locked: the controls bring up the unlock button, where the lock button was */
    var onLockedTap: () -> Unit = {}

    /** Ignores every touch (but a tap, for the unlock button) until [unlock] */
    fun lock() {
        locked = true
        controls.hide()
        flash("Locked · tap the screen, then the lock, to unlock", 1800)
    }

    fun unlock() {
        locked = false
        flash("Unlocked", 900)
    }

    private val taps = GestureDetector(activity, object : GestureDetector.SimpleOnGestureListener() {
        override fun onDown(e: MotionEvent) = true

        override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
            // the middle of the picture is the play button, whether or not the controls are up
            val x = e.x / playerView.width
            val y = e.y / playerView.height
            if (x in 0.35f..0.65f && y in 0.3f..0.7f) {
                exo.playWhenReady = !exo.playWhenReady
                if (!controls.visible) flash(if (exo.playWhenReady) "▶  Playing" else "❚❚  Paused", 800)
                else controls.poke()
            } else if (controls.visible) controls.hide() else controls.show()
            return true
        }

        override fun onLongPress(e: MotionEvent) {
            if (drag != Drag.None || pinches.isInProgress) return
            holding = true
            holdFrom = exo.playbackParameters.speed
            holdX = e.x
            holdSpeed = 2f
            controls.hide()
            exo.setPlaybackSpeed(holdSpeed)
            playerView.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
            flash(speedText(holdSpeed), 60_000)
        }

        override fun onDoubleTap(e: MotionEvent): Boolean {
            val x = e.x / playerView.width
            // (the middle is a single tap: play or pause)
            if (x < 0.35f) seek(-1) else if (x > 0.65f) seek(+1)
            return true
        }

        override fun onScroll(e1: MotionEvent?, e2: MotionEvent, dx: Float, dy: Float): Boolean {
            val start = e1 ?: return false
            val moveX = e2.x - start.x
            val moveY = e2.y - start.y
            if (drag == Drag.None) {
                // (not from the very top or bottom edge: those are Android's own swipes)
                val edge = playerView.height * 0.08f
                if (start.y < edge || start.y > playerView.height - edge) return false
                if (abs(moveX) < slop && abs(moveY) < slop) return false
                drag = when {
                    abs(moveX) > abs(moveY) -> Drag.Seek
                    start.x < playerView.width / 2f -> Drag.Brightness
                    else -> Drag.Volume
                }
                dragFrom = exo.currentPosition
                startBrightness = activity.window.attributes.screenBrightness.takeIf { it >= 0 } ?: systemBrightness()
                startVolume = audio.getStreamVolume(AudioManager.STREAM_MUSIC)
            }
            when (drag) {
                Drag.Seek -> {
                    val duration = exo.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: return true
                    // the screen's width is 3 minutes (or the whole video, when that's shorter)
                    val span = minOf(duration, 180_000L)
                    dragTo = (dragFrom + (moveX / playerView.width * span).toLong()).coerceIn(0L, duration)
                    val by = (dragTo - dragFrom) / 1000
                    flash("${clock(dragTo)}   ${if (by >= 0) "+" else "−"}${clock(abs(by) * 1000)}", 60_000)
                }
                Drag.Brightness -> {
                    val level = (startBrightness - moveY / (playerView.height * 0.8f)).coerceIn(0.01f, 1f)
                    activity.window.attributes = activity.window.attributes.apply { screenBrightness = level }
                    flash("Brightness ${(level * 100).roundToInt()}%", 60_000)
                }
                Drag.Volume -> {
                    val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                    val level = (startVolume - moveY / (playerView.height * 0.8f) * max).roundToInt().coerceIn(0, max)
                    if (level != audio.getStreamVolume(AudioManager.STREAM_MUSIC)) audio.setStreamVolume(AudioManager.STREAM_MUSIC, level, 0)
                    flash("Volume ${level * 100 / max.coerceAtLeast(1)}%", 60_000)
                }
                Drag.None -> {}
            }
            return true
        }
    })

    private val pinches = ScaleGestureDetector(activity, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
        override fun onScaleBegin(detector: ScaleGestureDetector): Boolean {
            pinch = 1f
            return true
        }

        override fun onScale(detector: ScaleGestureDetector): Boolean {
            pinch *= detector.scaleFactor
            return true
        }

        override fun onScaleEnd(detector: ScaleGestureDetector) {
            val fill = when {
                pinch > 1.12f -> true
                pinch < 0.88f -> false
                else -> return
            }
            playerView.resizeMode = if (fill) AspectRatioFrameLayout.RESIZE_MODE_ZOOM else AspectRatioFrameLayout.RESIZE_MODE_FIT
            flash(if (fill) "Zoomed to fill" else "Whole picture", 900)
        }
    })

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouch(v: View, event: MotionEvent): Boolean {
        if (locked) {
            if (event.action == MotionEvent.ACTION_UP) onLockedTap()
            return true
        }
        if (holding) {
            when (event.actionMasked) {
                MotionEvent.ACTION_MOVE -> {
                    val steps = ((event.x - holdX) / step).roundToInt()
                    val speed = (2f + steps * 0.25f).coerceIn(1.25f, 4f)
                    if (speed != holdSpeed) {
                        holdSpeed = speed
                        exo.setPlaybackSpeed(speed)
                        playerView.performHapticFeedback(android.view.HapticFeedbackConstants.CLOCK_TICK)
                        flash(speedText(speed), 60_000)
                    }
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    holding = false
                    exo.setPlaybackSpeed(holdFrom)
                    flash("", 0)
                }
            }
            // (the tap detector still needs to know the finger lifted)
            if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) taps.onTouchEvent(event)
            return true
        }
        pinches.onTouchEvent(event)
        if (!pinches.isInProgress && event.pointerCount == 1) taps.onTouchEvent(event)
        if (event.action == MotionEvent.ACTION_UP || event.action == MotionEvent.ACTION_CANCEL) {
            when (drag) {
                Drag.Seek -> {
                    exo.seekTo(dragTo)
                    flash(clock(dragTo), 700)
                }
                Drag.Brightness, Drag.Volume -> flash("", 0)
                Drag.None -> {}
            }
            drag = Drag.None
        }
        return true
    }

    private fun systemBrightness(): Float = try {
        android.provider.Settings.System.getInt(activity.contentResolver, android.provider.Settings.System.SCREEN_BRIGHTNESS) / 255f
    } catch (_: Exception) {
        0.5f
    }

    /** "2x ▶▶" */
    private fun speedText(speed: Float) = "${if (speed % 1f == 0f) speed.toInt().toString() else speed.toString()}x  ▶▶"

    fun release() = handler.removeCallbacksAndMessages(null)

    private fun clock(ms: Long): String {
        val s = ms / 1000
        return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60) else "%d:%02d".format(s / 60, s % 60)
    }
}

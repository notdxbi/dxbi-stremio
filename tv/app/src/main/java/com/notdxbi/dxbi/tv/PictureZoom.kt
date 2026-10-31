package com.notdxbi.dxbi.tv

import android.graphics.Bitmap
import android.graphics.Color
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.SurfaceView
import android.view.View
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.PlayerView

/** Zoom, and removing black bars that are part of the video (a 2.39:1 film in a 16:9 file) */
@OptIn(UnstableApi::class)
class PictureZoom(private val playerView: PlayerView) {
    private val frame: View get() = playerView.findViewById(androidx.media3.ui.R.id.exo_content_frame)
    private val handler = Handler(Looper.getMainLooper())
    var mode = "off"
        private set

    /** Reading the picture needs Android 8 */
    val canMeasure get() = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && playerView.videoSurfaceView is SurfaceView

    fun set(zoom: String) {
        mode = zoom
        handler.removeCallbacksAndMessages(null)
        apply(zoom.toFloatOrNull() ?: 1f, 0f, 0f)
        if (zoom == "auto") measure(0)
    }

    fun release() = handler.removeCallbacksAndMessages(null)

    private fun apply(scale: Float, x: Float, y: Float) {
        frame.animate().scaleX(scale).scaleY(scale).translationX(x).translationY(y).setDuration(220).start()
    }

    private fun measure(attempt: Int) {
        if (mode != "auto" || attempt > 8 || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val surface = playerView.videoSurfaceView as? SurfaceView ?: return
        val bitmap = Bitmap.createBitmap(96, 54, Bitmap.Config.ARGB_8888)
        try {
            PixelCopy.request(surface, bitmap, { result ->
                val bars = if (result == PixelCopy.SUCCESS) bars(bitmap) else null
                bitmap.recycle()
                if (bars == null) handler.postDelayed({ measure(attempt + 1) }, 2000)
                else fill(bars[0], bars[1], bars[2], bars[3])
            }, handler)
        } catch (_: IllegalArgumentException) {
            bitmap.recycle()
            handler.postDelayed({ measure(attempt + 1) }, 2000) // no picture yet
        }
    }

    /** Parts of the frame that are black at the top, right, bottom and left; null for a dark frame */
    private fun bars(b: Bitmap): FloatArray? {
        fun bright(x: Int, y: Int) = b.getPixel(x, y).let { Color.red(it) > 28 || Color.green(it) > 28 || Color.blue(it) > 28 }
        val w = b.width
        val h = b.height
        val rows = (0 until h).filter { y -> (0 until w).count { bright(it, y) } > w / 16 }
        val columns = (0 until w).filter { x -> (0 until h).count { bright(x, it) } > h / 16 }
        if (rows.size < h / 4 || columns.size < w / 4) return null
        // the same both ways, or it's a dark edge of this picture rather than bars
        val vertical = minOf(rows.first(), h - 1 - rows.last()).toFloat() / h
        val sideways = minOf(columns.first(), w - 1 - columns.last()).toFloat() / w
        return floatArrayOf(vertical, sideways, vertical, sideways)
    }

    private fun fill(t: Float, r: Float, b: Float, l: Float) {
        val shown = frame
        if (shown.width == 0 || shown.height == 0) return
        val width = shown.width * (1 - l - r)
        val height = shown.height * (1 - t - b)
        apply(minOf(playerView.width / width, playerView.height / height).coerceIn(1f, 2f), 0f, 0f)
    }
}

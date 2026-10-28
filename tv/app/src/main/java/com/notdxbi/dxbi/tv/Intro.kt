package com.notdxbi.dxbi.tv

import android.content.Context
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.SurfaceTexture
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.Surface
import android.view.TextureView
import android.widget.FrameLayout
import org.json.JSONObject
import kotlin.math.cos
import kotlin.math.sin

/**
 * The intro film, played by the TV itself over the page while it loads. The page can't afford it
 * (decoding AV1 in the web engine stopped 2 GB sticks), but every TV decodes H.264 in hardware, so
 * here it costs next to nothing. Follows dx.bi's Intro animation, Intro sound, Sound volume and accent.
 */
class Intro(private val activity: MainActivity, private val parent: FrameLayout) {

    private val main = Handler(Looper.getMainLooper())
    private var player: MediaPlayer? = null
    private var overlay: FrameLayout? = null
    private var video: TextureView? = null
    private var done = false

    val showing get() = overlay != null && !done

    fun start() {
        val settings = try {
            JSONObject(activity.getSharedPreferences("plugin-settings", Context.MODE_PRIVATE).getString("dxbi", "{}") ?: "{}")
        } catch (_: Exception) { JSONObject() }
        if (!settings.optBoolean("splash", true)) return

        val box = FrameLayout(activity).apply { setBackgroundColor(0xFF000000.toInt()) }
        val video = TextureView(activity)
        accentPaint(settings.optString("accent", "red"))?.let { video.setLayerPaint(it) }
        this.video = video
        box.addView(video, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER))
        // The film is 16:9: letterbox it on anything else (a phone held upright)
        box.addOnLayoutChangeListener { _, l, t, r, b, _, _, _, _ ->
            val w = r - l
            val h = b - t
            val lp = video.layoutParams
            val fitW = if (w * 9 <= h * 16) w else h * 16 / 9
            if (lp.width != fitW) {
                lp.width = fitW
                lp.height = fitW * 9 / 16
                video.post { video.layoutParams = lp }
            }
        }
        parent.addView(box, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        overlay = box

        val volume = if (!settings.optBoolean("introSound", true)) 0f
        else when (settings.optString("soundVolume", "subtle")) { "loud" -> 1f; "normal" -> 0.75f; else -> 0.45f }

        video.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
            override fun onSurfaceTextureAvailable(texture: SurfaceTexture, width: Int, height: Int) {
                if (done) return
                try {
                    val mp = MediaPlayer.create(activity, R.raw.intro) ?: return finish()
                    player = mp
                    mp.setSurface(Surface(texture))
                    mp.setVolume(volume, volume)
                    mp.setOnCompletionListener { finish() }
                    mp.setOnErrorListener { _, _, _ -> finish(); true }
                    mp.start()
                } catch (_: Exception) {
                    finish()
                }
            }
            override fun onSurfaceTextureSizeChanged(texture: SurfaceTexture, width: Int, height: Int) {}
            override fun onSurfaceTextureDestroyed(texture: SurfaceTexture) = true
            override fun onSurfaceTextureUpdated(texture: SurfaceTexture) {}
        }
        main.postDelayed({ finish() }, 7500) // safety net
    }

    /** OK, Back or a click skips it */
    fun skip() = finish()

    private fun finish() {
        if (done) return
        done = true
        player?.let { mp -> try { mp.stop() } catch (_: Exception) {}; mp.release() }
        player = null
        // A stopped TextureView keeps its last frame: skipping mid-film would freeze it on screen
        video?.visibility = android.view.View.INVISIBLE
        // Hold on black until the page has something to show (never more than 4 s), as on the desktop
        val since = System.currentTimeMillis()
        val check = object : Runnable {
            override fun run() {
                activity.pageReady { ready ->
                    if (ready || System.currentTimeMillis() - since > 4000) reveal() else main.postDelayed(this, 150)
                }
            }
        }
        check.run()
    }

    private fun reveal() {
        val box = overlay ?: return
        box.animate().alpha(0f).setDuration(600).withEndAction {
            parent.removeView(box)
            overlay = null
        }.start()
    }

    /** The film is rendered in red; turn it to the chosen accent (CSS hue-rotate, as the desktop does) */
    private fun accentPaint(accent: String): Paint? {
        val matrix = when (accent) {
            "white" -> ColorMatrix().apply {
                setSaturation(0f)
                postConcat(ColorMatrix().apply { setScale(1.5f, 1.5f, 1.5f, 1f) })
            }
            else -> {
                val shift = hue(ACCENTS[accent] ?: return null) - hue(ACCENTS.getValue("red"))
                if (shift.toInt() == 0) return null
                hueRotate(shift)
            }
        }
        return Paint().apply { colorFilter = ColorMatrixColorFilter(matrix) }
    }

    private fun hue(rgb: Int): Float {
        val hsv = FloatArray(3)
        android.graphics.Color.colorToHSV(rgb, hsv)
        return hsv[0]
    }

    // The matrix behind CSS filter: hue-rotate()
    private fun hueRotate(degrees: Float): ColorMatrix {
        val a = Math.toRadians(degrees.toDouble())
        val c = cos(a).toFloat()
        val s = sin(a).toFloat()
        return ColorMatrix(floatArrayOf(
            0.213f + c * 0.787f - s * 0.213f, 0.715f - c * 0.715f - s * 0.715f, 0.072f - c * 0.072f + s * 0.928f, 0f, 0f,
            0.213f - c * 0.213f + s * 0.143f, 0.715f + c * 0.285f + s * 0.140f, 0.072f - c * 0.072f - s * 0.283f, 0f, 0f,
            0.213f - c * 0.213f - s * 0.787f, 0.715f - c * 0.715f + s * 0.715f, 0.072f + c * 0.928f + s * 0.072f, 0f, 0f,
            0f, 0f, 0f, 1f, 0f,
        ))
    }

    companion object {
        // dx.bi's accent colours (ACCENTS in dxbi.plugin.js)
        private val ACCENTS = mapOf(
            "red" to 0xFFE50914.toInt(),
            "crimson" to 0xFFD81F3C.toInt(),
            "blue" to 0xFF2F80FF.toInt(),
            "purple" to 0xFF8B5CF6.toInt(),
            "green" to 0xFF1DB954.toInt(),
            "amber" to 0xFFF5A524.toInt(),
            "pink" to 0xFFEC4899.toInt(),
        )
    }
}

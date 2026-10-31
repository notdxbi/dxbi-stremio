package com.notdxbi.dxbi.tv

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View

/** The player's seek bar: what's played in the accent colour, what's loaded in grey, a knob when selected */
class SeekLine(context: Context, attrs: AttributeSet?) : View(context, attrs) {
    private val density = resources.displayMetrics.density
    private val line = Paint(Paint.ANTI_ALIAS_FLAG)
    var accent = Color.parseColor("#E50914")
    var played = 0f
        set(value) { field = value.coerceIn(0f, 1f); invalidate() }
    var loaded = 0f
        set(value) { field = value.coerceIn(0f, 1f); invalidate() }

    override fun onFocusChanged(gainFocus: Boolean, direction: Int, previous: android.graphics.Rect?) {
        super.onFocusChanged(gainFocus, direction, previous)
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val half = (if (isFocused) 3f else 2f) * density
        val mid = height / 2f
        val end = width.toFloat()
        fun bar(to: Float, colour: Int) {
            line.color = colour
            canvas.drawRoundRect(0f, mid - half, to, mid + half, half, half, line)
        }
        bar(end, Color.argb(64, 255, 255, 255))
        bar(end * loaded, Color.argb(96, 255, 255, 255))
        bar(end * played, accent)
        if (isFocused) {
            line.color = Color.WHITE
            canvas.drawCircle((end * played).coerceAtLeast(9f * density), mid, 9f * density, line)
        }
    }
}

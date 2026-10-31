package com.notdxbi.dxbi.tv

import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView

/**
 * dx.bi's player controls: the same layout as on a computer (back at the top, then the times and
 * seek bar, playback on the left, the title in the middle, options on the right), worked by remote.
 */
@OptIn(UnstableApi::class)
class PlayerControls(
    private val activity: PlayerActivity,
    private val playerView: PlayerView,
    private val exo: ExoPlayer,
    private val sound: SoundMode,
    private val zoom: PictureZoom,
    private val subtitleDelay: (Long) -> Long,
    accent: Int,
    private val clock: View?,
    hasNext: Boolean,
    private val seek: (Int) -> Unit,
    private val leave: (Boolean) -> Unit,
) {
    private val root: View = activity.findViewById(R.id.controls)
    private val panel: View = activity.findViewById(R.id.panel)
    private val panelTitle: TextView = activity.findViewById(R.id.panel_title)
    private val panelRows: LinearLayout = activity.findViewById(R.id.panel_rows)
    private val line: SeekLine = activity.findViewById(R.id.seek_line)
    private val play: ImageButton = activity.findViewById(R.id.ctl_play)
    private val timeNow: TextView = activity.findViewById(R.id.time_now)
    private val timeLeft: TextView = activity.findViewById(R.id.time_left)
    private val handler = Handler(Looper.getMainLooper())
    private var opener: View? = null
    private var lastFocus: View = play
    private var stats: TextView? = null

    private val hide = Runnable { if (!panelOpen) hide() }
    private val tick = object : Runnable {
        override fun run() {
            paint()
            handler.postDelayed(this, 500)
        }
    }

    private val buttons = listOf(R.id.ctl_play, R.id.ctl_rewind, R.id.ctl_forward, R.id.ctl_next, R.id.ctl_stats, R.id.ctl_picture, R.id.ctl_speed, R.id.ctl_subtitles, R.id.ctl_audio)
        .map { activity.findViewById<View>(it) }

    val visible get() = root.visibility == View.VISIBLE
    val panelOpen get() = panel.visibility == View.VISIBLE

    init {
        line.accent = accent
        click(R.id.ctl_back) { leave(false) }
        click(R.id.ctl_play) { exo.playWhenReady = !exo.playWhenReady; paint() }
        click(R.id.ctl_rewind) { seek(-1); paint() }
        click(R.id.ctl_forward) { seek(+1); paint() }
        click(R.id.ctl_next) { leave(true) }
        activity.findViewById<View>(R.id.ctl_next).visibility = if (hasNext) View.VISIBLE else View.GONE
        click(R.id.ctl_stats) { showStats(it) }
        click(R.id.ctl_picture) { showPicture(it) }
        click(R.id.ctl_speed) { showSpeed(it) }
        click(R.id.ctl_subtitles) { showTracks(it, C.TRACK_TYPE_TEXT, "Subtitles") }
        click(R.id.ctl_audio) { showTracks(it, C.TRACK_TYPE_AUDIO, "Audio") }
        // Phones: a tap shows or hides them, and the bar can be touched
        playerView.setOnClickListener { if (visible) hide() else show() }
        root.setOnClickListener { hide() }
        line.setOnTouchListener { view, event ->
            val duration = exo.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: return@setOnTouchListener false
            exo.seekTo((duration * (event.x / view.width).coerceIn(0f, 1f)).toLong())
            paint()
            poke()
            true
        }
        line.setOnKeyListener { _, code, event ->
            if (event.action != KeyEvent.ACTION_DOWN) return@setOnKeyListener false
            when (code) {
                KeyEvent.KEYCODE_DPAD_LEFT -> { seek(-1); paint(); true }
                KeyEvent.KEYCODE_DPAD_RIGHT -> { seek(+1); paint(); true }
                else -> false
            }
        }
    }

    /** Upright on a phone: the title moves above the buttons, and they share the width */
    fun fit(widthDp: Int, upright: Boolean) {
        val shown = buttons.count { it.visibility != View.GONE }
        val size = dp(minOf(52, (widthDp - 16) / shown - 2))
        for (button in buttons) {
            button.layoutParams = (button.layoutParams as ViewGroup.MarginLayoutParams).apply { width = size; height = size; marginEnd = dp(if (upright) 2 else 4) }
            button.setPadding(size / 4, size / 4, size / 4, size / 4)
        }
        val row = activity.findViewById<ViewGroup>(R.id.controls_row)
        val titles = activity.findViewById<View>(R.id.controls_title)
        row.setPadding(0, if (upright) dp(46) else 0, 0, 0)
        titles.layoutParams = (titles.layoutParams as android.widget.FrameLayout.LayoutParams).apply { gravity = if (upright) Gravity.TOP or Gravity.CENTER_HORIZONTAL else Gravity.CENTER; topMargin = if (upright) dp(-44) else 0 }
        val side = dp(if (upright) 12 else 56)
        // (the seek bar gets the room when it's narrow)
        for (id in listOf(R.id.time_now, R.id.time_left)) activity.findViewById<TextView>(id).minWidth = dp(if (upright) 44 else 72)
        activity.findViewById<View>(R.id.controls_bottom).setPadding(side, 0, side, dp(26))
        panel.layoutParams = (panel.layoutParams as android.widget.FrameLayout.LayoutParams).apply { width = minOf(dp(340), dp(widthDp - 24)); marginEnd = if (upright) dp(12) else dp(56); bottomMargin = dp(if (upright) 170 else 104) }
    }

    private fun click(id: Int, action: (View) -> Unit) {
        activity.findViewById<View>(id).apply {
            setOnClickListener { action(it) }
            setOnFocusChangeListener { view, has -> if (has) lastFocus = view }
        }
    }

    fun show() {
        if (!visible) {
            root.visibility = View.VISIBLE
            if (clock != null) clock.visibility = View.VISIBLE
            // Subtitles sit above the controls while they're up
            playerView.subtitleView?.translationY = -dp(if (activity.resources.configuration.orientation == android.content.res.Configuration.ORIENTATION_PORTRAIT) 0 else 110).toFloat()
            handler.post(tick)
            (if (lastFocus.isShown) lastFocus else play).requestFocus()
        }
        poke()
    }

    /** Pressing anything keeps them up a while longer */
    fun poke() {
        handler.removeCallbacks(hide)
        handler.postDelayed(hide, HIDE_AFTER_MS)
    }

    fun hide() {
        closePanel()
        root.visibility = View.GONE
        clock?.visibility = View.GONE
        playerView.subtitleView?.translationY = 0f
        handler.removeCallbacks(tick)
        handler.removeCallbacks(hide)
        playerView.requestFocus()
    }

    fun release() = handler.removeCallbacksAndMessages(null)

    fun paint() {
        play.setImageResource(if (exo.playWhenReady) R.drawable.ic_pause else R.drawable.ic_play)
        val duration = exo.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0L
        timeNow.text = time(exo.currentPosition)
        timeLeft.text = if (duration > 0) "-" + time(duration - exo.currentPosition) else "--:--"
        line.played = if (duration > 0) exo.currentPosition.toFloat() / duration else 0f
        line.loaded = if (duration > 0) exo.bufferedPosition.toFloat() / duration else 0f
        stats?.let { it.text = statsText() }
    }

    private fun time(ms: Long): String {
        val total = (ms.coerceAtLeast(0) / 1000).toInt()
        val h = total / 3600
        val m = total / 60 % 60
        val s = total % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
    }

    /** The remote stays inside an open menu: up and down move through it, sideways does nothing */
    fun panelKey(code: Int): Boolean {
        if (!panelOpen) return false
        val rows = (0 until panelRows.childCount).map { panelRows.getChildAt(it) }.filter { it.isFocusable }
        val at = rows.indexOf(panelRows.findFocus())
        when (code) {
            KeyEvent.KEYCODE_DPAD_UP -> rows.getOrNull(at - 1)?.requestFocus()
            KeyEvent.KEYCODE_DPAD_DOWN -> rows.getOrNull(at + 1)?.requestFocus()
            KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT -> {}
            else -> return false
        }
        return true
    }

    fun closePanel(): Boolean {
        if (!panelOpen) return false
        panel.visibility = View.GONE
        stats = null
        panelRows.removeAllViews()
        opener?.requestFocus()
        poke()
        return true
    }

    private fun openPanel(from: View, title: String) {
        opener = from
        panelTitle.text = title
        panelRows.removeAllViews()
        panel.visibility = View.VISIBLE
    }

    private fun heading(text: String) = TextView(activity).apply {
        this.text = text
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 13f)
        setTextColor(Color.argb(153, 255, 255, 255))
        setPadding(dp(12), dp(12), dp(12), dp(4))
        panelRows.addView(this)
    }

    private fun row(text: String, on: Boolean, keepOpen: Boolean = false, action: () -> Unit): TextView = TextView(activity).apply {
        this.text = if (on) "✓  $text" else text
        setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
        gravity = Gravity.CENTER_VERTICAL
        minHeight = dp(42)
        setPadding(dp(12), dp(6), dp(12), dp(6))
        setBackgroundResource(R.drawable.panel_row)
        setTextColor(if (on) Color.WHITE else Color.argb(204, 255, 255, 255))
        isFocusable = true
        setOnFocusChangeListener { view, has ->
            (view as TextView).setTextColor(if (has) Color.BLACK else if (on) Color.WHITE else Color.argb(204, 255, 255, 255))
        }
        setOnClickListener { action(); if (!keepOpen) closePanel() }
        panelRows.addView(this, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        tag = if (on) "on" else null
    }

    private fun dp(v: Int) = (v * activity.resources.displayMetrics.density).toInt()

    private fun focusFirst() {
        val rows = (0 until panelRows.childCount).map { panelRows.getChildAt(it) }.filter { it.isFocusable }
        (rows.firstOrNull { it.tag == "on" } ?: rows.firstOrNull())?.requestFocus()
    }

    private fun showSpeed(from: View) {
        openPanel(from, "Playback speed")
        for (speed in listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f)) {
            row(if (speed == 1f) "Normal" else "${speed}x", exo.playbackParameters.speed == speed) { exo.setPlaybackSpeed(speed) }
        }
        focusFirst()
    }

    private fun showPicture(from: View) {
        openPanel(from, "Picture & sound")
        heading("Picture")
        val modes = listOf(
            "Fit" to AspectRatioFrameLayout.RESIZE_MODE_FIT,
            "Crop" to AspectRatioFrameLayout.RESIZE_MODE_ZOOM,
            "Stretch" to AspectRatioFrameLayout.RESIZE_MODE_FILL,
        )
        for ((name, mode) in modes) row(name, playerView.resizeMode == mode) { playerView.resizeMode = mode }
        heading("Zoom")
        val zooms = listOfNotNull("off" to "Off", ("auto" to "Remove black bars").takeIf { zoom.canMeasure }, "1.1" to "110%", "1.25" to "125%", "1.33" to "133%")
        for ((value, name) in zooms) row(name, zoom.mode == value) { zoom.set(value) }
        heading("Sound")
        for (mode in SoundMode.MODES) row(mode.label, sound.mode === mode) { sound.mode = mode }
        focusFirst()
    }

    private fun showTracks(from: View, type: Int, title: String) {
        openPanel(from, title)
        val groups = exo.currentTracks.groups.filter { it.type == type }
        val anySelected = groups.any { it.isSelected }
        if (type == C.TRACK_TYPE_TEXT && anySelected) {
            heading("Timing")
            val shown = { ms: Long -> panelTitle.text = if (ms == 0L) "Subtitles" else "Subtitles · %+.2f s".format(ms / 1000f) }
            shown(subtitleDelay(0))
            row("Show 0.25 s earlier", false, keepOpen = true) { shown(subtitleDelay(-250)) }
            row("Show 0.25 s later", false, keepOpen = true) { shown(subtitleDelay(+250)) }
        }
        if (type == C.TRACK_TYPE_TEXT) {
            if (anySelected) heading("Track")
            row("Off", !anySelected) {
                exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
                    .clearOverridesOfType(type).setTrackTypeDisabled(type, true).build()
            }
        }
        var number = 0
        for (group in groups) for (i in 0 until group.length) {
            if (!group.isTrackSupported(i)) continue
            number++
            val format = group.getTrackFormat(i)
            val name = format.label ?: format.language?.let { java.util.Locale.forLanguageTag(it).displayLanguage }?.takeIf { it.isNotEmpty() } ?: "Track $number"
            val channels = if (type == C.TRACK_TYPE_AUDIO && format.channelCount > 0) " · ${channelName(format.channelCount)}" else ""
            row(name + channels, group.isTrackSelected(i)) {
                exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon()
                    .setTrackTypeDisabled(type, false)
                    .setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, i))
                    .build()
            }
        }
        if (number == 0 && type == C.TRACK_TYPE_AUDIO) row("No other audio", false) {}
        focusFirst()
    }

    private fun channelName(count: Int) = when (count) {
        1 -> "Mono"
        2 -> "Stereo"
        6 -> "5.1"
        8 -> "7.1"
        else -> "$count channels"
    }

    private fun showStats(from: View) {
        openPanel(from, "Stream stats")
        val text = TextView(activity).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
            setLineSpacing(0f, 1.35f)
            setPadding(dp(12), 0, dp(12), dp(10))
            isFocusable = true
        }
        panelRows.addView(text)
        stats = text
        text.requestFocus()
        paint()
    }

    private fun statsText(): String {
        val video = exo.videoFormat
        val audio = exo.audioFormat
        fun codec(mime: String?) = mime?.substringAfter('/')?.removePrefix("x-")?.uppercase() ?: "—"
        val lines = mutableListOf<String>()
        lines += "Picture  " + (if (video != null) "${video.width} × ${video.height}" else "—")
        lines += "Video  " + codec(video?.sampleMimeType) + (video?.frameRate?.takeIf { it > 0 }?.let { " · %.0f fps".format(it) } ?: "")
        lines += "Audio  " + codec(audio?.sampleMimeType) + (audio?.channelCount?.takeIf { it > 0 }?.let { " · " + channelName(it) } ?: "")
        (video?.bitrate?.takeIf { it > 0 })?.let { lines += "Bitrate  %.1f Mbps".format(it / 1_000_000f) }
        lines += "Buffered  %.0f s".format(exo.totalBufferedDuration / 1000f)
        return lines.joinToString("\n")
    }

    private companion object {
        const val HIDE_AFTER_MS = 6000L
    }
}

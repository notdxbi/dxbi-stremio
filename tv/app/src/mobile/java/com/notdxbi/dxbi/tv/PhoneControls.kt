package com.notdxbi.dxbi.tv

import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import androidx.annotation.OptIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.media3.common.C
import androidx.media3.common.MimeTypes
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView

/**
 * The player's controls on a phone, the way streaming apps lay them out: back, the title and quick
 * actions at the top; back 10 s, play and forward 10 s in the middle; the seek bar and labelled
 * buttons at the bottom. Menus slide in from the side when the phone is sideways and up from the
 * bottom when it's upright, over the video rather than on top of the other controls.
 * (TVs keep [PlayerControls], made for the remote.)
 */
@OptIn(UnstableApi::class)
class PhoneControls(
    private val activity: PlayerActivity,
    private val playerView: PlayerView,
    private val exo: ExoPlayer,
    private val sound: SoundMode,
    private val zoom: PictureZoom,
    private val subtitleDelay: (Long) -> Long,
    private val accent: Int,
    private val title: String,
    private val subtitle: String,
    private val hasNext: Boolean,
    private val showClock: Boolean,
    private val seek: (Int) -> Unit,
    private val leaveParty: () -> Unit,
    private val leave: (Boolean) -> Unit,
    private val onLock: () -> Unit,
    private val onUnlock: () -> Unit,
    private val onExternal: () -> Unit,
) : Controls {

    private enum class Panel { Tracks, Speed, More }

    private val handler = Handler(Looper.getMainLooper())
    private var shown by mutableStateOf(false)
    private var panel by mutableStateOf<Panel?>(null)
    // what's drawn from the player, read again every quarter second while the controls are up
    private var now by mutableLongStateOf(0L)
    private var partyCode by mutableStateOf<String?>(null)
    private var locked by mutableStateOf(false)
    private var unlockShown by mutableStateOf(false)
    private val hideUnlock = Runnable { unlockShown = false }

    /** A tap while locked: the lock button, where it always is, for a few seconds */
    fun showUnlock() {
        unlockShown = true
        handler.removeCallbacks(hideUnlock)
        handler.postDelayed(hideUnlock, 3000)
    }

    private fun lock() {
        locked = true
        onLock()
    }

    private fun unlock() {
        locked = false
        unlockShown = false
        onUnlock()
        show()
    }
    private var partyPeople by mutableStateOf<List<String>>(emptyList())

    private val autoHide = Runnable { if (panel == null) hide() }
    private val tick = object : Runnable {
        override fun run() {
            now = System.currentTimeMillis()
            handler.postDelayed(this, 250)
        }
    }

    init {
        val view = ComposeView(activity).apply { setContent { Ui() } }
        // over the picture, under the skip button, up next card and messages
        (playerView.parent as ViewGroup).addView(view, 1, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    override val visible get() = shown
    override val panelOpen get() = panel != null

    override fun show() {
        if (!shown) {
            shown = true
            handler.post(tick)
            playerView.subtitleView?.translationY = -activity.resources.displayMetrics.density * 90
        }
        poke()
    }

    override fun hide() {
        panel = null
        shown = false
        handler.removeCallbacks(tick)
        handler.removeCallbacks(autoHide)
        playerView.subtitleView?.translationY = 0f
    }

    override fun poke() {
        handler.removeCallbacks(autoHide)
        handler.postDelayed(autoHide, 5000)
    }

    override fun release() = handler.removeCallbacksAndMessages(null)

    override fun closePanel(): Boolean {
        if (panel == null) return false
        panel = null
        poke()
        return true
    }

    override fun panelKey(code: Int) = false

    override fun party(on: Boolean, code: String, people: List<String>) {
        partyCode = if (on) code else null
        partyPeople = people
    }

    override fun fit(widthDp: Int, upright: Boolean) {}

    private fun open(p: Panel) {
        panel = p
        handler.removeCallbacks(autoHide)
    }

    // -----------------------------------------------------------------------------------------------

    @Composable
    private fun Ui() {
        val sideways = LocalConfiguration.current.let { it.screenWidthDp > it.screenHeightDp }
        @Suppress("UNUSED_EXPRESSION") now // redrawn with the player's progress
        Box(Modifier.fillMaxSize()) {
            AnimatedVisibility(locked && unlockShown, modifier = Modifier.align(Alignment.TopCenter), enter = fadeIn(), exit = fadeOut()) { Unlock(Modifier) }
            AnimatedVisibility(shown && !locked, enter = fadeIn(), exit = fadeOut()) {
                Box(Modifier.fillMaxSize()) {
                    // shading so white controls read over any picture (draws only: touches go through to the video)
                    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = 0.75f), 0.22f to Color.Transparent, 0.62f to Color.Transparent, 1f to Color.Black.copy(alpha = 0.85f))))
                    TopBar(Modifier.align(Alignment.TopCenter), sideways)
                    Center(Modifier.align(Alignment.Center), big = sideways)
                    Bottom(Modifier.align(Alignment.BottomCenter), sideways)
                }
            }
            val open = panel
            if (open != null) {
                // tapping beside the menu closes it
                Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)).pointerInput(Unit) { detectTapGestures { closePanel() } })
            }
            // Speed is one row: a small card just above the buttons
            AnimatedVisibility(
                open == Panel.Speed,
                modifier = Modifier.align(Alignment.BottomCenter).windowInsetsPadding(WindowInsets.safeDrawing).padding(bottom = if (sideways) 64.dp else 86.dp),
                enter = slideInVertically { it / 3 } + fadeIn(),
                exit = slideOutVertically { it / 3 } + fadeOut(),
            ) {
                Box(Modifier.padding(horizontal = 12.dp).clip(RoundedCornerShape(16.dp)).background(Color(0xF2141414)).pointerInput(Unit) { detectTapGestures { } }) { Speed() }
            }
            AnimatedVisibility(
                open != null && open != Panel.Speed,
                modifier = Modifier.align(if (sideways) Alignment.CenterEnd else Alignment.BottomCenter),
                enter = if (sideways) slideInHorizontally { it } + fadeIn() else slideInVertically { it } + fadeIn(),
                exit = if (sideways) slideOutHorizontally { it } + fadeOut() else slideOutVertically { it } + fadeOut(),
            ) {
                val shape = if (sideways) RoundedCornerShape(topStart = 16.dp, bottomStart = 16.dp) else RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp)
                Box(
                    (if (sideways) Modifier.fillMaxHeight().width(420.dp) else Modifier.fillMaxWidth().heightIn(max = 460.dp))
                        .clip(shape).background(Color(0xF2141414)).windowInsetsPadding(WindowInsets.safeDrawing)
                        .pointerInput(Unit) { detectTapGestures { } },
                ) {
                    when (open) {
                        Panel.Tracks -> Tracks(sideways)
                        Panel.More -> More()
                        Panel.Speed, null -> {}
                    }
                }
            }
        }
    }

    @Composable
    private fun TopBar(modifier: Modifier, sideways: Boolean) {
        @Suppress("UNUSED_EXPRESSION") now // (read here, so this part redraws with the player)
        Row(modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Button(Icons.AutoMirrored.Filled.ArrowBack, "Back") { leave(false) }
            Column(Modifier.weight(1f).padding(horizontal = 6.dp)) {
                Text(title, color = Color.White, style = TextStyle(fontWeight = FontWeight.Bold, fontSize = 16.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (subtitle.isNotEmpty()) Text(subtitle, color = Color.White.copy(alpha = 0.75f), fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            // (upright, the title needs the room: the time goes down by the seek bar)
            if (showClock && sideways) Text(endsAt(), color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp, modifier = Modifier.padding(end = 4.dp))
            Button(Icons.Filled.LockOpen, "Lock the screen") { lock() }
        }
    }

    /** While locked: nothing but the lock, in the lock button's place */
    @Composable
    private fun Unlock(modifier: Modifier) {
        Row(modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 8.dp, vertical = 6.dp), horizontalArrangement = Arrangement.End) {
            Box(Modifier.size(48.dp).clip(CircleShape).background(Color(accent)).clickable { unlock() }, contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Lock, contentDescription = "Unlock the screen", tint = Color.White, modifier = Modifier.size(26.dp))
            }
        }
    }

    @Composable
    private fun Center(modifier: Modifier, big: Boolean) {
        @Suppress("UNUSED_EXPRESSION") now // (read here, so this part redraws with the player)
        val gap = if (big) 56.dp else 36.dp
        Row(modifier, verticalAlignment = Alignment.CenterVertically) {
            Button(Icons.Filled.Replay10, "Back 10 seconds", size = 52.dp) { seek(-1); poke() }
            Spacer(Modifier.width(gap))
            Box(
                Modifier.size(76.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.35f))
                    .clickable { exo.playWhenReady = !exo.playWhenReady; now = System.currentTimeMillis(); poke() },
                contentAlignment = Alignment.Center,
            ) {
                Icon(if (exo.playWhenReady) Icons.Filled.Pause else Icons.Filled.PlayArrow, contentDescription = if (exo.playWhenReady) "Pause" else "Play", tint = Color.White, modifier = Modifier.size(54.dp))
            }
            Spacer(Modifier.width(gap))
            Button(Icons.Filled.Forward10, "Forward 10 seconds", size = 52.dp) { seek(+1); poke() }
        }
    }

    @Composable
    private fun Bottom(modifier: Modifier, sideways: Boolean) {
        @Suppress("UNUSED_EXPRESSION") now // (read here, so this part redraws with the player)
        Column(modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 16.dp, vertical = 6.dp)) {
            if (showClock && !sideways) Text(endsAt(), color = Color.White.copy(alpha = 0.75f), fontSize = 12.sp, modifier = Modifier.align(Alignment.End))
            SeekBar()
            // sideways, labels beside their icons in a row; upright, under them, sharing the width
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), horizontalArrangement = if (sideways) Arrangement.spacedBy(8.dp) else Arrangement.SpaceEvenly) {
                val speed = exo.playbackParameters.speed
                Labelled(Icons.Filled.Speed, if (speed == 1f) "Speed (1x)" else "Speed (${speed}x)", stacked = !sideways) { open(Panel.Speed) }
                Labelled(Icons.Filled.Subtitles, if (sideways) "Audio & Subtitles" else "Audio & Subs", stacked = !sideways) { open(Panel.Tracks) }
                if (partyCode != null) Labelled(Icons.Filled.Groups, "Party", stacked = !sideways) { open(Panel.More) }
                if (hasNext) Labelled(Icons.Filled.SkipNext, if (sideways) "Next Episode" else "Next", stacked = !sideways) { leave(true) }
                Labelled(Icons.Filled.MoreHoriz, "More", stacked = !sideways) { open(Panel.More) }
            }
        }
    }

    /** The seek bar: tap or drag; while dragging, where it'll land is shown above the finger */
    @Composable
    private fun SeekBar() {
        @Suppress("UNUSED_EXPRESSION") now // (read here, so this part redraws with the player)
        val duration = exo.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0L
        var dragging by remember { mutableStateOf<Float?>(null) }
        val played = dragging ?: if (duration > 0) exo.currentPosition.toFloat() / duration else 0f
        val buffered = if (duration > 0) exo.bufferedPosition.toFloat() / duration else 0f
        val tint = Color(accent)
        Row(verticalAlignment = Alignment.CenterVertically) {
            BoxWithConstraints(
                Modifier.weight(1f).height(36.dp)
                    .pointerInput(duration) {
                        detectTapGestures { o -> if (duration > 0) { exo.seekTo((duration * (o.x / size.width).coerceIn(0f, 1f)).toLong()); poke() } }
                    }
                    .pointerInput(duration) {
                        detectHorizontalDragGestures(
                            onDragStart = { o -> dragging = (o.x / size.width).coerceIn(0f, 1f); handler.removeCallbacks(autoHide) },
                            onDragEnd = { dragging?.let { exo.seekTo((duration * it).toLong()) }; dragging = null; poke() },
                            onDragCancel = { dragging = null; poke() },
                        ) { change, _ -> dragging = (change.position.x / size.width).coerceIn(0f, 1f) }
                    },
                contentAlignment = Alignment.CenterStart,
            ) {
                val w = maxWidth
                Box(Modifier.fillMaxWidth().height(if (dragging != null) 6.dp else 4.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.25f)))
                Box(Modifier.fillMaxWidth(buffered.coerceIn(0f, 1f)).height(if (dragging != null) 6.dp else 4.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.45f)))
                Box(Modifier.fillMaxWidth(played.coerceIn(0f, 1f)).height(if (dragging != null) 6.dp else 4.dp).clip(CircleShape).background(tint))
                val thumb = if (dragging != null) 20.dp else 14.dp
                Box(Modifier.offset(x = w * played.coerceIn(0f, 1f) - thumb / 2).size(thumb).clip(CircleShape).background(tint))
                dragging?.let { f ->
                    Text(
                        clock((duration * f).toLong()),
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        modifier = Modifier.offset(x = (w * f - 28.dp).coerceIn(0.dp, w - 64.dp), y = (-30).dp).clip(RoundedCornerShape(6.dp)).background(Color.Black.copy(alpha = 0.7f)).padding(horizontal = 8.dp, vertical = 3.dp),
                    )
                }
            }
            Spacer(Modifier.width(12.dp))
            Text(if (duration > 0) clock(duration - (dragging?.let { (duration * it).toLong() } ?: exo.currentPosition)) else "--:--", color = Color.White, fontSize = 14.sp)
        }
    }

    // -----------------------------------------------------------------------------------------------
    // Menus

    private class Choice(val label: String, val on: Boolean, val enabled: Boolean = true, val source: String = "", val pick: () -> Unit)

    // where a subtitle came from (PlayerActivity gives each added file an id: "stream:3", "addon:7")
    private fun sourceOf(id: String?) = when {
        id == null -> IN_VIDEO
        id.contains("stream:") -> WITH_STREAM
        id.contains("addon:") -> FROM_ADDONS
        else -> IN_VIDEO
    }

    private fun tracks(type: Int): List<Choice> {
        val groups = exo.currentTracks.groups.filter { it.type == type }
        val out = mutableListOf<Choice>()
        if (type == C.TRACK_TYPE_TEXT) out += Choice("Off", groups.none { it.isSelected }) {
            exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon().clearOverridesOfType(type).setTrackTypeDisabled(type, true).build()
        }
        var number = 0
        for (group in groups) for (i in 0 until group.length) {
            val supported = group.isTrackSupported(i)
            if (!supported && type != C.TRACK_TYPE_AUDIO) continue
            number++
            val f = group.getTrackFormat(i)
            val name = f.label ?: f.language?.let { java.util.Locale.forLanguageTag(it).displayLanguage }?.takeIf { it.isNotEmpty() } ?: "Track $number"
            val extra = if (type == C.TRACK_TYPE_AUDIO) listOfNotNull(channelName(f.channelCount), audioKind(f.sampleMimeType)).joinToString(" · ") else ""
            out += Choice(listOf(name, extra).filter { it.isNotEmpty() }.joinToString(" · ") + if (!supported) " · can't play here" else "", group.isTrackSelected(i), supported,
                source = if (type == C.TRACK_TYPE_TEXT) sourceOf(f.id) else "") {
                exo.trackSelectionParameters = exo.trackSelectionParameters.buildUpon().setTrackTypeDisabled(type, false)
                    .setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, i)).build()
            }
        }
        return out
    }

    @Composable
    private fun Tracks(sideways: Boolean) {
        @Suppress("UNUSED_EXPRESSION") now
        var delay by remember { mutableLongStateOf(subtitleDelay(0)) }
        val audio = tracks(C.TRACK_TYPE_AUDIO)
        val subs = tracks(C.TRACK_TYPE_TEXT)
        val subsColumn: @Composable (Modifier) -> Unit = { m ->
            Column(m) {
                Heading("Subtitles")
                // the file's own first (they match it), then the stream's, then subtitle addons' (found by title)
                LazyColumn(Modifier.weight(1f, fill = false)) {
                    items(subs.filter { it.source == "" }) { @Suppress("UNUSED_EXPRESSION") now; ChoiceRow(it) }
                    for (source in listOf(IN_VIDEO, WITH_STREAM, FROM_ADDONS)) {
                        val here = subs.filter { it.source == source }
                        if (here.isEmpty()) continue
                        item(key = source) {
                            Text(source + if (source == FROM_ADDONS) " · may not match this video" else "",
                                color = Color.White.copy(alpha = 0.5f), fontSize = 12.sp, modifier = Modifier.padding(start = 38.dp, top = 10.dp, bottom = 2.dp))
                        }
                        items(here) { @Suppress("UNUSED_EXPRESSION") now; ChoiceRow(it) }
                    }
                }
                if (subs.any { it.on && it.label != "Off" }) {
                    Heading("Timing" + if (delay != 0L) " · %+.2f s".format(delay / 1000f) else "")
                    Row(Modifier.padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Pill("Earlier") { delay = subtitleDelay(-250) }
                        Pill("Later") { delay = subtitleDelay(+250) }
                    }
                }
            }
        }
        val audioColumn: @Composable (Modifier) -> Unit = { m ->
            Column(m) {
                Heading("Audio")
                if (audio.isEmpty()) Text("No other audio", color = Color.White.copy(alpha = 0.6f), modifier = Modifier.padding(12.dp))
                LazyColumn { items(audio) { @Suppress("UNUSED_EXPRESSION") now; ChoiceRow(it) } }
            }
        }
        if (sideways) Row(Modifier.fillMaxSize().padding(8.dp)) {
            audioColumn(Modifier.weight(1f))
            subsColumn(Modifier.weight(1f))
        } else Column(Modifier.fillMaxWidth().padding(8.dp)) {
            audioColumn(Modifier.heightIn(max = 160.dp))
            subsColumn(Modifier)
        }
    }

    @Composable
    private fun Speed() {
        @Suppress("UNUSED_EXPRESSION") now
        Column(Modifier.padding(start = 4.dp, end = 4.dp, bottom = 12.dp)) {
            Heading("Playback speed · hold the video to speed up")
            LazyRow(contentPadding = PaddingValues(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(listOf(0.5f, 0.75f, 1f, 1.25f, 1.5f, 1.75f, 2f)) { s ->
                    @Suppress("UNUSED_EXPRESSION") now
                    Pill(if (s == 1f) "1x" else "${s}x", on = exo.playbackParameters.speed == s) { exo.setPlaybackSpeed(s); now = System.currentTimeMillis() }
                }
            }
        }
    }

    @Composable
    private fun More() {
        @Suppress("UNUSED_EXPRESSION") now
        LazyColumn(Modifier.padding(8.dp)) {
            partyCode?.let { code ->
                item { Heading("Watch party · $code") }
                item { Text(if (partyPeople.isEmpty()) "Waiting for friends" else "With " + partyPeople.joinToString(", "), color = Color.White.copy(alpha = 0.75f), modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) }
                item { ChoiceRow(Choice("Leave the party", false) { leaveParty(); closePanel() }) }
            }
            item { Heading("Picture") }
            item {
                LazyRow(contentPadding = PaddingValues(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(listOf("Fit" to AspectRatioFrameLayout.RESIZE_MODE_FIT, "Fill" to AspectRatioFrameLayout.RESIZE_MODE_ZOOM, "Stretch" to AspectRatioFrameLayout.RESIZE_MODE_FILL)) { (name, mode) ->
                        @Suppress("UNUSED_EXPRESSION") now // (each choice redraws when one is picked)
                        Pill(name, on = playerView.resizeMode == mode) { playerView.resizeMode = mode; now = System.currentTimeMillis() }
                    }
                }
            }
            item { Heading("Zoom") }
            item {
                val zooms = listOfNotNull("off" to "Off", ("auto" to "Remove black bars").takeIf { zoom.canMeasure }, "1.1" to "110%", "1.25" to "125%", "1.33" to "133%")
                LazyRow(contentPadding = PaddingValues(horizontal = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(zooms) { (value, name) ->
                        @Suppress("UNUSED_EXPRESSION") now
                        Pill(name, on = zoom.mode == value) { zoom.set(value); now = System.currentTimeMillis() }
                    }
                }
            }
            item { Heading("Sound") }
            items(SoundMode.MODES) { mode ->
                @Suppress("UNUSED_EXPRESSION") now
                ChoiceRow(Choice(mode.label, sound.mode === mode) { sound.mode = mode; now = System.currentTimeMillis() }) }
            item { Heading("Stream") }
            item { Text(stats(), color = Color.White.copy(alpha = 0.8f), fontSize = 13.sp, lineHeight = 19.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp)) }
            item { ChoiceRow(Choice("Play with external player", false) { onExternal() }) }
        }
    }

    // -----------------------------------------------------------------------------------------------
    // Pieces

    @Composable
    private fun Button(icon: ImageVector, label: String, size: Dp = 44.dp, onClick: () -> Unit) {
        Box(Modifier.size(size + 4.dp).clip(CircleShape).clickable(onClick = onClick), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = label, tint = Color.White, modifier = Modifier.size(size * 0.6f))
        }
    }

    @Composable
    private fun Labelled(icon: ImageVector, label: String, stacked: Boolean = false, onClick: () -> Unit) {
        val tap = Modifier.clip(RoundedCornerShape(8.dp)).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null, onClick = onClick)
        if (stacked) Column(tap.padding(horizontal = 6.dp, vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
            Spacer(Modifier.height(3.dp))
            Text(label, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        } else Row(tap.padding(horizontal = 8.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(6.dp))
            Text(label, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
        }
    }

    @Composable
    private fun Heading(text: String) =
        Text(text, color = Color.White.copy(alpha = 0.6f), fontSize = 13.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(start = 12.dp, top = 14.dp, bottom = 6.dp))

    @Composable
    private fun ChoiceRow(c: Choice) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).clickable(enabled = c.enabled) { c.pick(); now = System.currentTimeMillis() }.padding(horizontal = 12.dp, vertical = 11.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.width(26.dp)) { if (c.on) Icon(Icons.Filled.Check, contentDescription = "Chosen", tint = Color.White, modifier = Modifier.size(20.dp)) }
            Text(c.label, color = if (!c.enabled) Color.White.copy(alpha = 0.4f) else if (c.on) Color.White else Color.White.copy(alpha = 0.8f), fontSize = 15.sp, fontWeight = if (c.on) FontWeight.Bold else FontWeight.Normal)
        }
    }

    @Composable
    private fun Pill(label: String, on: Boolean = false, onClick: () -> Unit) {
        Box(
            Modifier.height(36.dp).clip(CircleShape).background(if (on) Color.White else Color.White.copy(alpha = 0.14f)).clickable(onClick = onClick).padding(horizontal = 16.dp),
            contentAlignment = Alignment.Center,
        ) { Text(label, color = if (on) Color.Black else Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold) }
    }

    private fun endsAt(): String {
        val format = android.text.format.DateFormat.getTimeFormat(activity)
        val left = if (exo.duration > 0) ((exo.duration - exo.currentPosition) / exo.playbackParameters.speed).toLong() else 0L
        return if (left > 0) "Ends at " + format.format(System.currentTimeMillis() + left) else format.format(System.currentTimeMillis())
    }

    private fun stats(): String {
        val v = exo.videoFormat
        val a = exo.audioFormat
        fun codec(mime: String?) = mime?.substringAfter('/')?.removePrefix("x-")?.uppercase() ?: "—"
        return listOfNotNull(
            v?.let { "${it.width} × ${it.height} · ${codec(it.sampleMimeType)}" + (it.frameRate.takeIf { r -> r > 0 }?.let { r -> " · %.0f fps".format(r) } ?: "") },
            a?.let { codec(it.sampleMimeType) + (channelName(it.channelCount)?.let { c -> " · $c" } ?: "") },
            v?.bitrate?.takeIf { it > 0 }?.let { "%.1f Mbps".format(it / 1_000_000f) },
            "%.0f s buffered".format(exo.totalBufferedDuration / 1000f),
        ).joinToString("\n")
    }

    private fun audioKind(mime: String?) = when (mime) {
        MimeTypes.AUDIO_AC3 -> "Dolby Digital"
        MimeTypes.AUDIO_E_AC3, MimeTypes.AUDIO_E_AC3_JOC -> "Dolby Digital+"
        MimeTypes.AUDIO_TRUEHD -> "TrueHD"
        MimeTypes.AUDIO_DTS, MimeTypes.AUDIO_DTS_HD, MimeTypes.AUDIO_DTS_EXPRESS -> "DTS"
        else -> null
    }

    private fun channelName(count: Int) = when (count) {
        1 -> "Mono"
        2 -> "Stereo"
        6 -> "5.1"
        8 -> "7.1"
        in 3..32 -> "$count channels"
        else -> null
    }

    private companion object {
        const val IN_VIDEO = "In the video"
        const val WITH_STREAM = "With this stream"
        const val FROM_ADDONS = "From subtitle addons"
    }

    private fun clock(ms: Long): String {
        val s = ms.coerceAtLeast(0) / 1000
        return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60) else "%d:%02d".format(s / 60, s % 60)
    }
}

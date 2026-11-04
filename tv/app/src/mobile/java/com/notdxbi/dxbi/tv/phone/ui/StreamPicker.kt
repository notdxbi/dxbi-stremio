package com.notdxbi.dxbi.tv.phone.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Download
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.notdxbi.dxbi.tv.Phone
import com.notdxbi.dxbi.tv.phone.StreamChoices
import com.notdxbi.dxbi.tv.phone.StreamOption

private enum class Sort(val label: String) { Best("Best quality"), Seeds("Most seeds"), Largest("Largest first"), Smallest("Smallest first"), Addon("Addon order") }

/**
 * The streams for one film or episode, the way dx.bi's stream list shows them: dx.bi's pick at the
 * top (Just press Play's choice: what you chose last time, else the best that's ready), then every
 * stream with its quality, HDR, source, codec, languages, size and seeds, to filter and sort.
 */
@Composable
fun StreamPicker(
    choices: StreamChoices?,
    title: String?,
    subtitle: String?,
    onPlay: (StreamOption) -> Unit,
    modifier: Modifier = Modifier,
    bottom: Dp = 24.dp,
    /** The ⋮ menu: another app, a Chromecast, or a download */
    onPlayIn: (StreamOption, Phone.Target) -> Unit = { s, _ -> onPlay(s) },
    /** a tap downloads the stream rather than playing it ("Choose the source myself") */
    downloading: Boolean = false,
) {
    var quality by rememberSaveable { mutableStateOf<String?>(null) }
    var provider by rememberSaveable { mutableStateOf<String?>(null) }
    var sort by rememberSaveable { mutableStateOf(Sort.Best) }
    var instantOnly by rememberSaveable { mutableStateOf(false) }
    val all = choices?.items.orEmpty()
    val shown = remember(all, quality, provider, sort, instantOnly) {
        val kept = all.filter { (quality == null || it.quality == quality) && (provider == null || it.provider == provider) && (!instantOnly || it.instant) }
        when (sort) {
            Sort.Best -> kept.sortedWith(StreamOption.BEST)
            Sort.Seeds -> kept.sortedByDescending { it.seeds }
            Sort.Largest -> kept.sortedByDescending { it.size }
            Sort.Smallest -> kept.sortedBy { if (it.size > 0) it.size else Double.MAX_VALUE }
            Sort.Addon -> kept
        }
    }
    val searching = choices == null || !choices.settled

    LazyColumn(modifier, contentPadding = PaddingValues(bottom = bottom)) {
        if (title != null) item {
            Column(Modifier.padding(horizontal = Gutter, vertical = 4.dp)) {
                Text(title, style = MaterialTheme.typography.titleLarge, color = Dx.Text, maxLines = 1, overflow = TextOverflow.Ellipsis)
                subtitle?.let { Text(it, color = Dx.Muted, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            }
        }
        // dx.bi's pick: one tap
        choices?.picked?.let { best ->
            item(key = "pick") {
                Row(
                    Modifier.padding(Gutter, 10.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.White).clickable { onPlay(best) }.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(if (downloading) Icons.Filled.Download else Icons.Filled.PlayArrow, contentDescription = null, tint = Color.Black, modifier = Modifier.size(30.dp))
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(if (downloading) "Download the best stream" else if (choices.sameAsLastTime) "Play · same as last time" else "Play the best stream", color = Color.Black, style = MaterialTheme.typography.labelLarge)
                        Text(
                            listOf(best.label, best.provider, best.sizeText).filter { !it.isNullOrBlank() }.joinToString(" · "),
                            color = Color.Black.copy(alpha = 0.65f),
                            style = MaterialTheme.typography.bodySmall,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        if (best.filename.isNotBlank()) Text(best.filename, color = Color.Black.copy(alpha = 0.55f), style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    if (best.instant) Icon(Icons.Filled.Bolt, contentDescription = "Instant", tint = Color(0xFF2E7D32))
                }
            }
        }
        // filters, only for what this list has
        if (all.size > 1) item(key = "filters") {
            val qualities = all.map { it.quality }.distinct().sortedByDescending { q -> all.first { it.quality == q }.res }
            val providers = all.map { it.provider }.filter { it.isNotBlank() }.distinct()
            LazyRow(contentPadding = PaddingValues(horizontal = Gutter, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item { Menu(sort.label, Sort.entries.map { it to it.label }) { sort = it } }
                if (qualities.size > 1) item { Menu(quality ?: "Any quality", listOf<Pair<String?, String>>(null to "Any quality") + qualities.map { it to it }) { quality = it } }
                if (providers.size > 1) item { Menu(provider ?: "Any source", listOf<Pair<String?, String>>(null to "Any source") + providers.map { it to it }) { provider = it } }
                if (all.any { it.instant } && all.any { !it.instant }) item {
                    Chip(if (instantOnly) "Instant only ✓" else "Instant only", selected = instantOnly) { instantOnly = !instantOnly }
                }
            }
        }
        items(shown, key = { it.index }) { s -> StreamRow(s, picked = s.index == choices?.pick, onPlayIn = { target -> onPlayIn(s, target) }) { onPlay(s) } }
        if (searching) item {
            Row(Modifier.fillMaxWidth().padding(20.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(color = Dx.Accent, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                Spacer(Modifier.width(10.dp))
                Text(if (all.isEmpty()) "Finding streams…" else "More addons answering…", color = Dx.Muted)
            }
        } else if (all.isEmpty()) item {
            Text("No streams found. Your addons may not have this one yet.", color = Dx.Muted, modifier = Modifier.padding(Gutter))
        } else if (shown.isEmpty()) item {
            Text("Nothing matches those filters.", color = Dx.Muted, modifier = Modifier.padding(Gutter))
        }
    }
}

@Composable
private fun Chip(label: String, selected: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.height(34.dp).clip(CircleShape).background(if (selected) Color.White else Dx.Raised).clickable(onClick = onClick).padding(horizontal = 14.dp),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = if (selected) Color.Black else Dx.Text, style = MaterialTheme.typography.labelMedium) }
}

@Composable
private fun <T> Menu(label: String, options: List<Pair<T, String>>, onPick: (T) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Row(Modifier.height(34.dp).clip(CircleShape).background(Dx.Raised).clickable { open = true }.padding(start = 14.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(label, color = Dx.Text, style = MaterialTheme.typography.labelMedium)
            Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = Dx.Muted, modifier = Modifier.size(18.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (value, text) -> DropdownMenuItem(text = { Text(text) }, onClick = { open = false; onPick(value) }) }
        }
    }
}

@Composable
private fun StreamRow(s: StreamOption, picked: Boolean, onPlayIn: (Phone.Target) -> Unit, onPlay: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Column(
        Modifier.padding(horizontal = Gutter, vertical = 4.dp).fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Dx.Surface)
            .then(if (picked) Modifier.border(1.dp, Dx.Accent, RoundedCornerShape(10.dp)) else Modifier)
            .clickable(onClick = onPlay).padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Tag(s.quality, strong = true)
            if (s.dv) Tag("DOLBY VISION") else if (s.hdr) Tag("HDR")
            if (s.source.isNotEmpty() && s.source != "Other") Tag(s.source.uppercase(), colour = if (s.source == "CAM") Color(0xFF8B0000) else null)
            if (s.codec.isNotEmpty()) Tag(s.codec)
            Spacer(Modifier.weight(1f))
            when {
                s.instant -> Tag("INSTANT", colour = Color(0xFF2E7D32))
                s.pending -> Tag("NOT CACHED", colour = Color(0xFF8D6E00))
                s.torrent -> Tag("TORRENT")
            }
            Box {
                Icon(
                    Icons.Filled.MoreVert,
                    contentDescription = "More ways to play",
                    tint = Dx.Muted,
                    modifier = Modifier.padding(start = 4.dp).size(22.dp).clip(CircleShape).clickable { menu = true },
                )
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text("Play with external player") }, onClick = { menu = false; onPlayIn(Phone.Target.External) })
                    // (a torrent plays from the phone itself: a TV can't reach it, and it isn't a file to save)
                    if (!s.torrent) {
                        DropdownMenuItem(text = { Text("Cast to a TV") }, onClick = { menu = false; onPlayIn(Phone.Target.Cast) })
                        DropdownMenuItem(text = { Text("Download") }, onClick = { menu = false; onPlayIn(Phone.Target.Download) })
                    }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        if (s.filename.isNotBlank()) Text(s.filename, color = Dx.Text, style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
        Text(
            listOf(s.provider, s.site).filter { it.isNotBlank() }.distinct().joinToString(" · "),
            color = if (s.filename.isNotBlank()) Dx.Muted else Dx.Text,
            style = if (s.filename.isNotBlank()) MaterialTheme.typography.labelMedium else MaterialTheme.typography.titleSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        val facts = listOfNotNull(
            s.sizeText,
            s.seeds.takeIf { it >= 0 }?.let { "$it seeds" },
            s.langs.filterNot { it.startsWith("Not listed") }.takeIf { it.isNotEmpty() }?.joinToString(", "),
            s.addon.takeIf { it.isNotBlank() && it != s.provider },
        )
        if (facts.isNotEmpty()) Text(facts.joinToString(" · "), color = Dx.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (s.lesser) Text("Upscaled, high frame rate or 3D: may not look as good as it says", color = Dx.Faint, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun Tag(text: String, strong: Boolean = false, colour: Color? = null) {
    Text(
        text,
        color = if (strong) Color.Black else Color.White,
        style = MaterialTheme.typography.labelSmall,
        fontWeight = FontWeight.Black,
        modifier = Modifier.clip(RoundedCornerShape(3.dp)).background(colour ?: if (strong) Color.White else Color.White.copy(alpha = 0.16f)).padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

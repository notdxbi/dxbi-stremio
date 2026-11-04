package com.notdxbi.dxbi.tv.phone.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.notdxbi.dxbi.tv.Downloads
import com.notdxbi.dxbi.tv.phone.Stremio
import kotlinx.coroutines.launch

/** The quality choices, the same as on a computer: value, name, what it means */
val DOWNLOAD_QUALITIES = listOf(
    Triple("best", "Best quality", "The sharpest stream that's ready. Biggest files."),
    Triple("2160", "4K", "Up to 4K."),
    Triple("1080", "1080p", "Sharp on any screen. Usually 1–4 GB for a film."),
    Triple("720", "720p", "Smaller files, fine on a phone. Usually around 1 GB."),
    Triple("small", "Smallest file", "The smallest 720p or better: saves the most space."),
)

private fun Context.activity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.activity()
    else -> null
}

fun sizeText(bytes: Long): String = when {
    bytes <= 0 -> ""
    bytes >= 1_000_000_000 -> "%.1f GB".format(bytes / 1e9)
    else -> "%.0f MB".format(bytes / 1e6)
}

/**
 * Downloading from a title's page: asks which quality (unless Downloads → Settings says to always
 * use one), finds each stream through dx.bi and starts saving it. "Choose the source myself" hands
 * back to the page, which opens the stream list for [onChoose].
 */
class Downloader(private val stremio: Stremio, private val context: Context, private val launch: (suspend () -> Unit) -> Unit) {
    var asking by mutableStateOf<Ask?>(null)
    var busy by mutableStateOf<String?>(null)
    var onChoose: (String) -> Unit = {}
    var askNotifications: () -> Unit = {}

    data class Ask(val type: String, val metaId: String, val videoIds: List<String>, val title: String, val detail: String)

    fun request(type: String, metaId: String, videoIds: List<String>, title: String, detail: String) {
        val todo = videoIds.filter { v -> Downloads.find(metaId, v)?.let { it.failed } ?: true }
        if (todo.isEmpty()) { Toast.makeText(context, "Already downloaded", Toast.LENGTH_SHORT).show(); return }
        val ask = Ask(type, metaId, todo, title, detail)
        val saved = Downloads.settings.value.quality
        if (saved != "ask") start(ask, saved) else asking = ask
    }

    fun start(ask: Ask, quality: String) {
        asking = null
        if (quality == "choose") { onChoose(ask.videoIds.first()); return }
        askNotifications()
        launch {
            var added = 0
            val problems = mutableListOf<String>()
            ask.videoIds.forEachIndexed { i, v ->
                busy = if (ask.videoIds.size > 1) "Finding streams… ${i + 1} of ${ask.videoIds.size}" else "Finding the stream…"
                stremio.downloadStream(ask.type, ask.metaId, v, quality)
                    .onSuccess { if (Downloads.add(context, it.toString(), quiet = true)) added++ }
                    .onFailure { problems += it.message ?: "Couldn't download it." }
            }
            busy = null
            val message = when {
                added > 0 && problems.isEmpty() -> if (added == 1) "Downloading. See Profile → Downloads." else "Downloading $added episodes"
                added > 0 -> "Downloading $added of ${ask.videoIds.size}. ${problems.size} had no ready stream."
                else -> problems.firstOrNull() ?: "Couldn't download that."
            }
            Toast.makeText(context, message, Toast.LENGTH_LONG).show()
        }
    }
}

@Composable
fun rememberDownloader(stremio: Stremio): Downloader {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    // (Android 13 and later ask before an app shows notifications: downloads show their progress in one)
    val notifications = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    val d = remember { Downloader(stremio, context) { block -> scope.launch { block() } } }
    LaunchedEffect(Unit) { Downloads.manager(context) }
    d.askNotifications = {
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) notifications.launch(android.Manifest.permission.POST_NOTIFICATIONS)
    }
    d.asking?.let { ask -> QualityDialog(ask, canChoose = ask.videoIds.size == 1, onDismiss = { d.asking = null }) { q -> d.start(ask, q) } }
    return d
}

@Composable
private fun QualityDialog(ask: Downloader.Ask, canChoose: Boolean, onDismiss: () -> Unit, onPick: (String) -> Unit) {
    val context = LocalContext.current
    var always by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Dx.Surface,
        title = {
            Column {
                Text("Download ${ask.title}", maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (ask.detail.isNotEmpty()) Text(ask.detail, color = Dx.Muted, style = MaterialTheme.typography.bodyMedium)
            }
        },
        text = {
            LazyColumn(Modifier.heightIn(max = 460.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                items(DOWNLOAD_QUALITIES) { (value, label, note) ->
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Dx.Raised).clickable {
                        if (always) Downloads.setQuality(context, value)
                        onPick(value)
                    }.padding(12.dp)) {
                        Text(label, color = Dx.Text, style = MaterialTheme.typography.titleSmall)
                        Text(note, color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
                    }
                }
                if (canChoose) item {
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).border(1.dp, Dx.Line, RoundedCornerShape(10.dp)).clickable { onPick("choose") }.padding(12.dp)) {
                        Text("Choose the source myself", color = Dx.Text, style = MaterialTheme.typography.titleSmall)
                        Text("Opens the streams: tap the one you want to download.", color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
                    }
                }
                item {
                    Row(Modifier.fillMaxWidth().clickable { always = !always }, verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(always, { always = it }, colors = CheckboxDefaults.colors(checkedColor = Dx.Accent))
                        Text("Always use this quality", color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/**
 * An episode's (or film's) download button: ⬇, a ring filling up, ✓ once it's saved. Tapping one
 * that's started gives its choices (play it, pause, delete).
 */
@Composable
fun DownloadIcon(item: Downloads.Item?, size: Dp = 34.dp, onDownload: () -> Unit) {
    val context = LocalContext.current
    var menu by remember { mutableStateOf(false) }
    Box {
        Box(
            Modifier.size(size).clip(CircleShape)
                .background(if (item?.done == true) Dx.Accent else Color.Transparent)
                .then(if (item?.done == true) Modifier else Modifier.border(1.5.dp, if (item?.failed == true) Color(0xFFFF6B6B) else Dx.Faint, CircleShape))
                .clickable { if (item == null) onDownload() else menu = true },
            contentAlignment = Alignment.Center,
        ) {
            when {
                item == null -> Icon(Icons.Filled.Download, contentDescription = "Download", tint = Dx.Text, modifier = Modifier.size(size * 0.55f))
                item.done -> Icon(Icons.Filled.Check, contentDescription = "Downloaded", tint = Color.White, modifier = Modifier.size(size * 0.55f))
                item.failed -> Icon(Icons.Filled.ErrorOutline, contentDescription = "Didn't download", tint = Color(0xFFFF6B6B), modifier = Modifier.size(size * 0.6f))
                item.paused -> Icon(Icons.Filled.Pause, contentDescription = "Paused", tint = Dx.Text, modifier = Modifier.size(size * 0.5f))
                else -> {
                    CircularProgressIndicator(progress = { item.percent / 100f }, color = Dx.Accent, trackColor = Color.Transparent, strokeWidth = 2.5.dp, modifier = Modifier.size(size))
                    Text("${item.percent.toInt()}", color = Dx.Text, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        if (item != null) DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            if (item.done) DropdownMenuItem(text = { Text("Play downloaded") }, onClick = { menu = false; Downloads.play(context, item) })
            if (item.failed) DropdownMenuItem(text = { Text("Try again") }, onClick = { menu = false; Downloads.retry(context, item) })
            if (!item.done && !item.failed) DropdownMenuItem(text = { Text(if (item.paused) "Resume" else "Pause") }, onClick = { menu = false; if (item.paused) Downloads.resume(context, item) else Downloads.pause(context, item) })
            DropdownMenuItem(text = { Text(if (item.done) "Delete download" else if (item.failed) "Remove" else "Cancel download") }, onClick = { menu = false; Downloads.remove(context, item) })
        }
    }
}

/** What a download is doing, in words */
fun downloadStatus(d: Downloads.Item, waiting: Boolean): String = when {
    d.done -> listOf(sizeText(d.total.takeIf { it > 0 } ?: d.bytes), if (d.watched) "Watched" else "").filter { it.isNotEmpty() }.joinToString(" · ")
    d.failed -> "Didn't finish: the link may have expired, or your debrid service isn't ready yet. Try again."
    d.paused -> "Paused · ${d.percent.toInt()}%"
    waiting -> if (Downloads.settings.value.wifiOnly) "Waiting for Wi-Fi · ${d.percent.toInt()}%" else "Waiting for a connection · ${d.percent.toInt()}%"
    else -> "Downloading ${d.percent.toInt()}%" + (if (d.total > 0) " of ${sizeText(d.total)}" else if (d.bytes > 0) " · ${sizeText(d.bytes)}" else "")
}

// ---------------------------------------------------------------------------------------------------
// Downloads: films and episodes saved to the phone, and their settings

@Composable
fun DownloadsScreen(onBack: (() -> Unit)?, offline: Boolean = false) {
    val context = LocalContext.current
    LaunchedEffect(Unit) { Downloads.manager(context) }
    val items by Downloads.items.collectAsState()
    val waiting by Downloads.waiting.collectAsState()
    var tab by remember { mutableStateOf(0) }
    var removing by remember { mutableStateOf<Downloads.Item?>(null) }
    Column(Modifier.fillMaxSize().background(Dx.Background).windowInsetsPadding(WindowInsets.safeDrawing)) {
        ScreenTitle("Downloads", onBack)
        if (offline) Text("You're offline. Your downloads still play.", color = Dx.Muted, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = Gutter, vertical = 4.dp))
        Choices(listOf(if (items.isEmpty()) "Downloads" else "Downloads (${items.size})", "Settings"), tab) { tab = it }
        Spacer(Modifier.height(10.dp))
        if (tab == 1) { DownloadSettings(); return@Column }
        if (items.isEmpty()) {
            Text(
                "Nothing downloaded yet. On a film, tap Download. On a series, tap ⬇ next to an episode, or Download season. You choose the quality each time (or once, in Settings), or pick the exact stream yourself.",
                color = Dx.Muted,
                modifier = Modifier.padding(Gutter),
            )
            return@Column
        }
        val watched = items.count { it.watched && it.done }
        val used = items.sumOf { if (it.done) maxOf(it.total, it.bytes) else it.bytes }
        Row(Modifier.fillMaxWidth().padding(horizontal = Gutter), verticalAlignment = Alignment.CenterVertically) {
            Text("${sizeText(used).ifEmpty { "Nothing" }} on this phone", color = Dx.Muted, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
            if (watched > 0) TextButton(onClick = { Downloads.removeWatched(context) }) { Text("Delete watched ($watched)", color = Dx.Accent) }
        }
        val groups = items.groupBy { it.metaId.ifEmpty { it.title } }
        LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
            groups.forEach { (key, list) ->
                item(key = "h:$key") {
                    val first = list.first()
                    Row(Modifier.padding(start = Gutter, end = Gutter, top = 14.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (first.poster != null) { Art(first.poster, first.title, Modifier.width(30.dp).height(45.dp), RoundedCornerShape(4.dp)); Spacer(Modifier.width(10.dp)) }
                        Column {
                            Text(first.title, color = Dx.Text, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(if (first.type == "series" || list.size > 1 || first.season != null) "${list.size} episode${if (list.size == 1) "" else "s"}" else "Film", color = Dx.Faint, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
                items(list, key = { it.id }) { d ->
                    Row(
                        Modifier.fillMaxWidth().clickable(enabled = d.done) { Downloads.play(context, d) }.padding(horizontal = Gutter, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(Modifier.width(124.dp).height(70.dp)) {
                            Art(d.art, d.title, Modifier.fillMaxSize(), RoundedCornerShape(6.dp))
                            if (d.done) Box(Modifier.align(Alignment.Center).size(30.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.5f)).border(1.dp, Color.White, CircleShape), contentAlignment = Alignment.Center) {
                                Icon(Icons.Filled.PlayArrow, contentDescription = "Play", tint = Color.White, modifier = Modifier.size(20.dp))
                            } else LinearProgressIndicator(progress = { d.percent / 100f }, color = Dx.Accent, trackColor = Color.White.copy(alpha = 0.25f), modifier = Modifier.align(Alignment.BottomStart).fillMaxWidth().height(3.dp))
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(d.subtitle.ifEmpty { d.title }, color = Dx.Text, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            val what = listOf(d.quality, d.provider).filter { it.isNotEmpty() }.joinToString(" · ")
                            if (what.isNotEmpty()) Text(what, color = Dx.Faint, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                            Text(downloadStatus(d, waiting), color = if (d.failed) Color(0xFFFF7B7B) else Dx.Muted, style = MaterialTheme.typography.bodySmall)
                        }
                        DownloadRowMenu(d, onDelete = { removing = d })
                    }
                }
            }
        }
    }
    removing?.let { d ->
        AlertDialog(
            onDismissRequest = { removing = null },
            containerColor = Dx.Surface,
            title = { Text(if (d.done) "Delete this download?" else "Stop this download?") },
            text = { Text(listOf(d.title, d.subtitle).filter { it.isNotEmpty() }.joinToString(" · "), color = Dx.Muted) },
            confirmButton = { TextButton(onClick = { Downloads.remove(context, d); removing = null }) { Text("Delete", color = Dx.Accent) } },
            dismissButton = { TextButton(onClick = { removing = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun DownloadRowMenu(d: Downloads.Item, onDelete: () -> Unit) {
    val context = LocalContext.current
    var open by remember { mutableStateOf(false) }
    Box {
        TextButton(onClick = { open = true }) { Text("•••", color = Dx.Muted) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            if (d.done) DropdownMenuItem(text = { Text("Play") }, onClick = { open = false; Downloads.play(context, d) })
            if (d.done) DropdownMenuItem(text = { Text(if (d.watched) "Mark as not watched" else "Mark as watched") }, onClick = { open = false; Downloads.setWatched(context, d, !d.watched) })
            if (d.failed) DropdownMenuItem(text = { Text("Try again") }, onClick = { open = false; Downloads.retry(context, d) })
            if (!d.done && !d.failed) DropdownMenuItem(text = { Text(if (d.paused) "Resume" else "Pause") }, onClick = { open = false; if (d.paused) Downloads.resume(context, d) else Downloads.pause(context, d) })
            DropdownMenuItem(text = { Text("Delete", color = Dx.Accent) }, onClick = { open = false; onDelete() })
        }
    }
}

@Composable
private fun DownloadSettings() {
    val context = LocalContext.current
    val s by Downloads.settings.collectAsState()
    val places = remember { Downloads.places(context) }
    var moving by remember { mutableStateOf<Downloads.Place?>(null) }
    var progress by remember { mutableStateOf<Float?>(null) }
    LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
        item {
            SettingPick(
                "Quality", "What the Download buttons save. Ask each time lets you choose for every download, including picking the exact stream yourself.",
                listOf("ask" to "Ask each time") + DOWNLOAD_QUALITIES.map { it.first to it.second }, s.quality,
            ) { Downloads.setQuality(context, it) }
        }
        item {
            SettingPick(
                "Delete watched downloads", "A download counts as watched once you play it to the end. You can always delete any download yourself.",
                listOf("off" to "Never", "finished" to "As soon as I finish one", "day" to "A day after I finish one"), s.autoDelete,
            ) { Downloads.setAutoDelete(context, it) }
        }
        item {
            Row(Modifier.fillMaxWidth().clickable { Downloads.setWifiOnly(context, !s.wifiOnly) }.padding(horizontal = Gutter, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Download on Wi-Fi only", color = Dx.Text, style = MaterialTheme.typography.titleSmall)
                    Text("Saves your mobile data: downloads wait for Wi-Fi.", color = Dx.Faint, style = MaterialTheme.typography.bodySmall)
                }
                Switch(s.wifiOnly, { Downloads.setWifiOnly(context, it) }, colors = SwitchDefaults.colors(checkedTrackColor = Dx.Accent, checkedThumbColor = Color.White, uncheckedTrackColor = Dx.Raised))
            }
        }
        item {
            Column(Modifier.padding(horizontal = Gutter, vertical = 12.dp)) {
                Text("Where downloads go", color = Dx.Text, style = MaterialTheme.typography.titleSmall)
                Text(if (places.size > 1) "The phone, or a memory card. Moving them takes a moment and restarts dx.bi." else "On this phone (no memory card found).", color = Dx.Faint, style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                places.forEach { p ->
                    val on = p.index == s.storage
                    Row(
                        Modifier.fillMaxWidth().padding(vertical = 3.dp).clip(RoundedCornerShape(10.dp)).background(if (on) Dx.Raised else Dx.Surface)
                            .then(if (on) Modifier.border(1.dp, Dx.Accent, RoundedCornerShape(10.dp)) else Modifier)
                            .clickable(enabled = !on) { moving = p }.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(p.label, color = Dx.Text, style = MaterialTheme.typography.titleSmall)
                            if (p.free >= 0) Text("${sizeText(p.free)} free", color = Dx.Faint, style = MaterialTheme.typography.bodySmall)
                        }
                        if (on) Icon(Icons.Filled.Check, contentDescription = "Chosen", tint = Dx.Accent)
                    }
                }
            }
        }
    }
    moving?.let { p ->
        val count = Downloads.items.value.size
        AlertDialog(
            onDismissRequest = { if (progress == null) moving = null },
            containerColor = Dx.Surface,
            title = { Text("Save downloads to ${p.label.lowercase()}?") },
            text = {
                Column {
                    Text(if (count > 0) "Your $count download${if (count == 1) "" else "s"} move there too, then dx.bi restarts." else "New downloads go there. dx.bi restarts to switch.", color = Dx.Muted)
                    progress?.let { Spacer(Modifier.height(12.dp)); LinearProgressIndicator(progress = { it }, color = Dx.Accent, modifier = Modifier.fillMaxWidth()) }
                }
            },
            confirmButton = {
                TextButton(enabled = progress == null, onClick = {
                    val activity = context.activity() ?: return@TextButton
                    progress = 0f
                    Downloads.moveTo(activity, p, { f -> progress = f }) { msg ->
                        progress = null
                        moving = null
                        Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
                    }
                }) { Text(if (progress == null) "Move" else "Moving…", color = Dx.Accent) }
            },
            dismissButton = { if (progress == null) TextButton(onClick = { moving = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun SettingPick(title: String, note: String, options: List<Pair<String, String>>, value: String, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().clickable { open = true }.padding(horizontal = Gutter, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Dx.Text, style = MaterialTheme.typography.titleSmall)
            Text(note, color = Dx.Faint, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.width(12.dp))
        Box {
            Text(options.firstOrNull { it.first == value }?.second ?: value, color = Dx.Muted, style = MaterialTheme.typography.bodyMedium)
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                options.forEach { (v, label) -> DropdownMenuItem(text = { Text(label) }, onClick = { open = false; onPick(v) }) }
            }
        }
    }
}

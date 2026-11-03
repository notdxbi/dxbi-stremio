package com.notdxbi.dxbi.tv.phone.ui

import android.content.Intent
import android.net.Uri
import android.widget.Toast
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Extension
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.notdxbi.dxbi.tv.phone.Addon
import com.notdxbi.dxbi.tv.phone.HomeLayout
import com.notdxbi.dxbi.tv.phone.Stremio
import com.notdxbi.dxbi.tv.phone.Title
import com.notdxbi.dxbi.tv.phone.objects
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.Locale

/** A screen's title bar, with Back when it isn't a tab */
@Composable
fun ScreenTitle(title: String, onBack: (() -> Unit)? = null, actions: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().height(60.dp).padding(start = if (onBack == null) Gutter else 0.dp, end = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        if (onBack != null) IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Dx.Text) }
        Text(title, style = if (onBack == null) MaterialTheme.typography.headlineMedium else MaterialTheme.typography.titleLarge, color = Dx.Text, modifier = Modifier.weight(1f))
        actions()
    }
}

/** A row of pills where one is chosen */
@Composable
fun Choices(options: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    LazyRow(contentPadding = PaddingValues(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        itemsIndexed(options) { i, label ->
            Box(
                Modifier.height(34.dp).clip(CircleShape).background(if (i == selected) Color.White else Dx.Raised).clickable { onSelect(i) }.padding(horizontal = 16.dp),
                contentAlignment = Alignment.Center,
            ) { Text(label, color = if (i == selected) Color.Black else Dx.Text, style = MaterialTheme.typography.labelMedium) }
        }
    }
}

// ---------------------------------------------------------------------------------------------------
// Addons: installed, Official and Community, and adding one from a link

@Composable
fun AddonsScreen(stremio: Stremio) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var list by rememberSaveable { mutableStateOf(0) }
    var type by rememberSaveable { mutableStateOf(0) }
    var adding by remember { mutableStateOf(false) }
    var removing by remember { mutableStateOf<Addon?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    val installed by stremio.installedAddons.collectAsState()
    val remote by stremio.remoteAddons.collectAsState()

    LaunchedEffect(list) {
        if (list == 0) stremio.loadAddons() else stremio.loadRemoteAddons(if (list == 1) "official" else "community")
    }
    fun say(text: String) = Toast.makeText(context, text, Toast.LENGTH_SHORT).show()
    fun act(addon: Addon, install: Boolean) {
        busy = addon.transportUrl
        scope.launch {
            val problem = if (install) stremio.install(addon) else stremio.uninstall(addon)
            busy = null
            say(problem ?: if (install) "${addon.name} installed" else "${addon.name} removed")
            if (list != 0) stremio.loadRemoteAddons(if (list == 1) "official" else "community")
        }
    }

    val installedUrls = installed.map { it.transportUrl }.toSet()
    val shown = if (list == 0) installed else remote?.optJSONArray("items").objects().map(Addon::from).map { it.copy(installed = it.transportUrl in installedUrls) }
    val wanted = listOf(null, "movie", "series")[type]
    val addons = shown.filter { wanted == null || wanted in it.types }
    val loading = list != 0 && (remote == null || remote?.optString("state") == "Loading")

    Column(Modifier.fillMaxSize().background(Dx.Background).windowInsetsPadding(WindowInsets.safeDrawing)) {
        ScreenTitle("Addons") {
            IconButton(onClick = { adding = true }) { Icon(Icons.Filled.Add, contentDescription = "Add from a link", tint = Dx.Text) }
        }
        Choices(listOf("Installed", "Official", "Community"), list) { list = it }
        Spacer(Modifier.height(8.dp))
        Choices(listOf("All", "Films", "Series"), type) { type = it }
        Spacer(Modifier.height(8.dp))
        LazyColumn(contentPadding = PaddingValues(start = Gutter, end = Gutter, top = 4.dp, bottom = 24.dp + LocalBarSpace.current), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (loading) item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Dx.Accent) } }
            items(addons, key = { it.transportUrl }) { a ->
                AddonCard(
                    a,
                    busy = busy == a.transportUrl,
                    onConfigure = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(a.configureUrl))) },
                    onInstall = { act(a, install = true) },
                    onUninstall = { removing = a },
                )
            }
        }
    }

    if (adding) {
        var link by remember { mutableStateOf("") }
        var problem by remember { mutableStateOf<String?>(null) }
        var working by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { if (!working) adding = false },
            containerColor = Dx.Surface,
            title = { Text("Add an addon") },
            text = {
                Column {
                    Text("Paste the addon's link (it usually ends in manifest.json).", color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(link, { link = it }, singleLine = true, placeholder = { Text("https://…/manifest.json") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
                    problem?.let { Text(it, color = Dx.Accent, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp)) }
                }
            },
            confirmButton = {
                TextButton(enabled = !working && link.isNotBlank(), onClick = {
                    working = true
                    problem = null
                    scope.launch {
                        val failed = stremio.installFromLink(link)
                        working = false
                        if (failed == null) { adding = false; say("Addon installed") } else problem = failed
                    }
                }) { Text(if (working) "Installing…" else "Install") }
            },
            dismissButton = { TextButton(enabled = !working, onClick = { adding = false }) { Text("Cancel") } },
        )
    }

    removing?.let { a ->
        AlertDialog(
            onDismissRequest = { removing = null },
            containerColor = Dx.Surface,
            title = { Text("Uninstall ${a.name}?") },
            text = { Text("Its catalogs and streams will be gone from dx.bi and Stremio on all your devices.", color = Dx.Muted) },
            confirmButton = { TextButton(onClick = { removing = null; act(a, install = false) }) { Text("Uninstall", color = Dx.Accent) } },
            dismissButton = { TextButton(onClick = { removing = null }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun AddonCard(a: Addon, busy: Boolean, onConfigure: () -> Unit, onInstall: () -> Unit, onUninstall: () -> Unit) {
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Dx.Surface).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(52.dp).clip(RoundedCornerShape(10.dp)).background(Dx.Raised), contentAlignment = Alignment.Center) {
                // (the puzzle piece until the logo arrives, or when there's none; logos are any shape, so fitted whole)
                var logoShown by remember(a.logo) { mutableStateOf(false) }
                if (!logoShown) Icon(Icons.Filled.Extension, contentDescription = null, tint = Dx.Faint)
                if (a.logo != null) AsyncImage(
                    model = a.logo,
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    onSuccess = { logoShown = true },
                    modifier = Modifier.fillMaxSize().padding(4.dp),
                )
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(a.name, color = Dx.Text, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                    if (a.installed) Icon(Icons.Filled.Check, contentDescription = "Installed", tint = Dx.Accent, modifier = Modifier.padding(start = 6.dp).size(18.dp))
                }
                Text(a.types.joinToString(", ") { typeName(it) }, color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
            }
            if (a.version.isNotEmpty()) Text("v${a.version}", color = Dx.Faint, style = MaterialTheme.typography.labelMedium)
        }
        if (a.description.isNotBlank()) {
            Spacer(Modifier.height(10.dp))
            Text(a.description, color = Dx.Muted, style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
        val canRemove = a.installed && !a.protected
        if (a.configurable || canRemove || !a.installed) {
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (a.configurable) OutlineButton("Configure", Modifier.weight(1f), onClick = onConfigure)
                when {
                    busy -> Box(Modifier.weight(1f).height(42.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Dx.Accent, modifier = Modifier.size(20.dp), strokeWidth = 2.dp) }
                    canRemove -> OutlineButton("Uninstall", Modifier.weight(1f), onClick = onUninstall)
                    !a.installed && !a.configurationRequired -> OutlineButton("Install", Modifier.weight(1f), filled = true, onClick = onInstall)
                }
            }
        }
    }
}

private fun typeName(t: String) = when (t) {
    "movie" -> "Films"
    "series" -> "Series"
    "tv" -> "TV"
    "channel" -> "Channels"
    else -> t.replaceFirstChar { it.uppercase() }
}

@Composable
fun OutlineButton(label: String, modifier: Modifier = Modifier, filled: Boolean = false, onClick: () -> Unit) {
    Box(
        modifier.height(42.dp).clip(CircleShape).background(if (filled) Color.White else Color.Transparent)
            .border(1.dp, if (filled) Color.White else Dx.Line, CircleShape).clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(label, color = if (filled) Color.Black else Dx.Text, style = MaterialTheme.typography.labelLarge) }
}

// ---------------------------------------------------------------------------------------------------
// Playback & subtitles: Stremio's own settings that matter on a phone

private val LANGUAGES: List<Pair<String, String>> by lazy {
    Locale.getAvailableLocales()
        .mapNotNull { l -> runCatching { l.isO3Language }.getOrNull()?.takeIf { it.length == 3 }?.let { it to l.getDisplayLanguage(Locale.ENGLISH) } }
        .filter { it.second.isNotBlank() }
        .distinctBy { it.first }
        .sortedBy { it.second }
}

private fun languageName(code: String?) = code?.let { c -> LANGUAGES.firstOrNull { it.first == c }?.second ?: c } ?: "None"

private val COLOURS = listOf("#FFFFFFFF" to "White", "#FFFF00FF" to "Yellow", "#000000FF" to "Black", "#808080FF" to "Grey", "#00000000" to "None")

@Composable
fun PlaybackSettingsScreen(stremio: Stremio, onBack: () -> Unit) {
    val settings by stremio.profileSettings.collectAsState()
    val server by stremio.streamingServer.collectAsState()
    var editingServer by remember { mutableStateOf(false) }
    fun set(key: String, value: Any?) = stremio.updateSettings(JSONObject().put(key, value ?: JSONObject.NULL))
    fun str(key: String) = settings.takeUnless { it.isNull(key) }?.optString(key)

    Column(Modifier.fillMaxSize().background(Dx.Background).windowInsetsPadding(WindowInsets.safeDrawing)) {
        ScreenTitle("Playback & subtitles", onBack)
        LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
            item { Group("Playback") }
            item { Toggle("Play the next episode by itself", "When an episode ends, the next one starts", settings.optBoolean("bingeWatching", true)) { set("bingeWatching", it) } }
            item {
                Pick("Next episode card", "How long before the end it shows", "${settings.optLong("nextVideoNotificationDuration", 35000) / 1000} s",
                    listOf(0L, 10000L, 20000L, 35000L, 60000L).map { it to if (it == 0L) "Off" else "${it / 1000} s" }) { set("nextVideoNotificationDuration", it) }
            }
            item {
                Pick("Skip forward and back by", null, "${settings.optLong("seekTimeDuration", 10000) / 1000} s",
                    listOf(5000L, 10000L, 15000L, 30000L).map { it to "${it / 1000} s" }) { set("seekTimeDuration", it) }
            }
            item { Group("Audio") }
            item { Pick("Audio language", "Played first when a video has several", languageName(str("audioLanguage")), LANGUAGES) { set("audioLanguage", it) } }
            item { Group("Subtitles") }
            item { Pick("Subtitle language", null, languageName(str("subtitlesLanguage")), listOf<Pair<String?, String>>(null to "None") + LANGUAGES) { set("subtitlesLanguage", it) } }
            item { Pick("Second subtitle language", "When the first isn't there", languageName(str("secondarySubtitlesLanguage")), listOf<Pair<String?, String>>(null to "None") + LANGUAGES) { set("secondarySubtitlesLanguage", it) } }
            item {
                Pick("Size", null, "${settings.optInt("subtitlesSize", 100)}%", listOf(75, 100, 125, 150, 175, 200, 250).map { it to "$it%" }) { set("subtitlesSize", it) }
            }
            item { Toggle("Bold", null, settings.optBoolean("subtitlesBold")) { set("subtitlesBold", it) } }
            item { Pick("Text colour", null, COLOURS.firstOrNull { it.first.equals(str("subtitlesTextColor"), true) }?.second ?: "Custom", COLOURS.dropLast(1)) { set("subtitlesTextColor", it) } }
            item { Pick("Background", null, COLOURS.firstOrNull { it.first.equals(str("subtitlesBackgroundColor"), true) }?.second ?: "Custom", COLOURS) { set("subtitlesBackgroundColor", it) } }
            item { Pick("Outline", null, COLOURS.firstOrNull { it.first.take(7).equals(str("subtitlesOutlineColor")?.take(7), true) }?.second ?: "Custom", COLOURS) { set("subtitlesOutlineColor", it) } }
            item { Group("Streaming server") }
            item {
                val up = server?.optString("state") == "Ready"
                Line(
                    if (up) Icons.Filled.Check else Icons.Filled.Extension,
                    "Server for torrents",
                    (str("streamingServerUrl") ?: "Not set") + if (up) " · connected" else " · not answering (debrid streams don't need one)",
                ) { editingServer = true }
            }
        }
    }

    if (editingServer) {
        var url by remember { mutableStateOf(str("streamingServerUrl").orEmpty()) }
        AlertDialog(
            onDismissRequest = { editingServer = false },
            containerColor = Dx.Surface,
            title = { Text("Streaming server") },
            text = {
                Column {
                    Text("Stremio or dx.bi on a computer on your network runs one, at http://<its address>:11470/", color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(url, { url = it }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = { TextButton(onClick = { set("streamingServerUrl", url.trim()); editingServer = false }) { Text("Save") } },
            dismissButton = { TextButton(onClick = { editingServer = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun Group(title: String) =
    Text(title.uppercase(), color = Dx.Accent, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(start = Gutter, top = 22.dp, bottom = 4.dp))

@Composable
private fun Toggle(title: String, note: String?, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!on) }.padding(horizontal = Gutter, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Dx.Text, style = MaterialTheme.typography.titleSmall)
            note?.let { Text(it, color = Dx.Faint, style = MaterialTheme.typography.bodySmall) }
        }
        Switch(on, onChange, colors = SwitchDefaults.colors(checkedTrackColor = Dx.Accent, checkedThumbColor = Color.White, uncheckedTrackColor = Dx.Raised))
    }
}

@Composable
private fun <T> Pick(title: String, note: String?, shown: String, options: List<Pair<T, String>>, onPick: (T) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().clickable { open = true }.padding(horizontal = Gutter, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, color = Dx.Text, style = MaterialTheme.typography.titleSmall)
            note?.let { Text(it, color = Dx.Faint, style = MaterialTheme.typography.bodySmall) }
        }
        Box {
            Text(shown, color = Dx.Muted, style = MaterialTheme.typography.bodyMedium)
            DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = if (options.size > 8) Modifier.height(420.dp) else Modifier) {
                options.forEach { (value, label) -> DropdownMenuItem(text = { Text(label) }, onClick = { open = false; onPick(value) }) }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------------
// Customise Home: Home's rows, moved and hidden (dx.bi keeps it the same on every device)

@Composable
fun CustomiseHomeScreen(stremio: Stremio, onBack: () -> Unit) {
    val all by stremio.allRows.collectAsState()
    val saved by stremio.layout.collectAsState()
    var layout by remember { mutableStateOf(saved) }
    // every catalog, in Home's order (hidden ones too, so they can come back)
    val rows = remember(all, layout) {
        val unique = all.distinctBy { it.key }
        val place = layout.order.withIndex().associate { (i, k) -> k to i }
        unique.sortedBy { place[it.key] ?: (layout.order.size + it.index) }
    }
    fun save(next: HomeLayout) {
        layout = next
        stremio.saveLayout(next)
    }
    fun move(from: Int, to: Int) {
        if (to !in rows.indices) return
        val keys = rows.map { it.key }.toMutableList()
        keys.add(to, keys.removeAt(from))
        save(layout.copy(order = keys))
    }

    Column(Modifier.fillMaxSize().background(Dx.Background).windowInsetsPadding(WindowInsets.safeDrawing)) {
        ScreenTitle("Customise Home", onBack) {
            TextButton(onClick = { save(HomeLayout.NONE) }) { Text("Reset", color = Dx.Muted) }
        }
        Text("Move rows up and down, or hide them. Continue Watching and My List always come first.", color = Dx.Faint, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = Gutter))
        Spacer(Modifier.height(8.dp))
        LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
            itemsIndexed(rows, key = { _, r -> r.key }) { i, r ->
                val hidden = r.key in layout.hidden
                Row(Modifier.fillMaxWidth().padding(start = Gutter, end = 4.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(layout.names[r.key] ?: r.name, color = if (hidden) Dx.Faint else Dx.Text, style = MaterialTheme.typography.titleSmall)
                        Text("${typeName(r.type)} · ${r.addon}", color = Dx.Faint, style = MaterialTheme.typography.bodySmall)
                    }
                    IconButton(onClick = { move(i, i - 1) }, enabled = i > 0) { Icon(Icons.Filled.KeyboardArrowUp, contentDescription = "Up", tint = if (i > 0) Dx.Muted else Dx.Line) }
                    IconButton(onClick = { move(i, i + 1) }, enabled = i < rows.size - 1) { Icon(Icons.Filled.KeyboardArrowDown, contentDescription = "Down", tint = if (i < rows.size - 1) Dx.Muted else Dx.Line) }
                    IconButton(onClick = { save(layout.copy(hidden = if (hidden) layout.hidden - r.key else layout.hidden + r.key)) }) {
                        Icon(if (hidden) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, contentDescription = if (hidden) "Show" else "Hide", tint = if (hidden) Dx.Faint else Dx.Text)
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------------
// Library: everything added or watched

@Composable
fun LibraryScreen(stremio: Stremio, onBack: () -> Unit, onOpen: (Title) -> Unit) {
    var type by rememberSaveable { mutableStateOf(0) }
    val items by stremio.library.collectAsState()
    LaunchedEffect(type) { stremio.loadLibrary(listOf(null, "movie", "series")[type]) }
    Column(Modifier.fillMaxSize().background(Dx.Background).windowInsetsPadding(WindowInsets.safeDrawing)) {
        ScreenTitle("Library", onBack)
        Choices(listOf("All", "Films", "Series"), type) { type = it }
        Spacer(Modifier.height(10.dp))
        if (items.isEmpty()) Text("Nothing here yet. Add titles with My List on a title's page.", color = Dx.Muted, modifier = Modifier.padding(Gutter))
        else PosterGrid(items, loading = false, onEnd = { stremio.libraryMore() }, onOpen = onOpen)
    }
}


// ---------------------------------------------------------------------------------------------------
// Downloads: films and episodes saved to the phone

@Composable
fun DownloadsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    LaunchedEffect(Unit) { com.notdxbi.dxbi.tv.Downloads.manager(context) }
    val items by com.notdxbi.dxbi.tv.Downloads.items.collectAsState()
    var removing by remember { mutableStateOf<com.notdxbi.dxbi.tv.Downloads.Item?>(null) }
    Column(Modifier.fillMaxSize().background(Dx.Background).windowInsetsPadding(WindowInsets.safeDrawing)) {
        ScreenTitle("Downloads", onBack)
        if (items.isEmpty()) {
            Text(
                "Nothing downloaded yet. In a title's streams, tap ⋮ on a stream, then Download. Debrid and direct streams can be saved; torrents can't.",
                color = Dx.Muted,
                modifier = Modifier.padding(Gutter),
            )
            return@Column
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
            items(items, key = { it.id }) { d ->
                Row(
                    Modifier.fillMaxWidth().clickable(enabled = d.done || d.percent > 5f) { com.notdxbi.dxbi.tv.Downloads.play(context, d) }.padding(horizontal = Gutter, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.width(132.dp).height(74.dp)) {
                        Art(d.art, d.title, Modifier.fillMaxSize(), RoundedCornerShape(6.dp))
                        if (!d.done) ProgressLine(d.percent / 100f, Modifier.align(Alignment.BottomStart).fillMaxWidth())
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(Modifier.weight(1f)) {
                        Text(d.title, color = Dx.Text, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        if (d.subtitle.isNotEmpty()) Text(d.subtitle, color = Dx.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val size = if (d.bytes > 0) "%.1f GB".format(d.bytes / 1e9) else ""
                        Text(
                            when {
                                d.done -> "Saved · $size"
                                d.failed -> "Didn't finish: the link may have expired. Download it again."
                                else -> "Downloading ${d.percent.toInt()}%" + if (size.isNotEmpty()) " · $size" else ""
                            },
                            color = if (d.failed) Dx.Accent else Dx.Faint,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    IconButton(onClick = { removing = d }) { Icon(Icons.Filled.Close, contentDescription = "Remove", tint = Dx.Muted) }
                }
            }
        }
    }
    removing?.let { d ->
        AlertDialog(
            onDismissRequest = { removing = null },
            containerColor = Dx.Surface,
            title = { Text(if (d.done) "Remove this download?" else "Stop this download?") },
            text = { Text(listOf(d.title, d.subtitle).filter { it.isNotEmpty() }.joinToString(" · "), color = Dx.Muted) },
            confirmButton = { TextButton(onClick = { com.notdxbi.dxbi.tv.Downloads.remove(context, d); removing = null }) { Text("Remove", color = Dx.Accent) } },
            dismissButton = { TextButton(onClick = { removing = null }) { Text("Cancel") } },
        )
    }
}

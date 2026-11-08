package com.notdxbi.dxbi.tv.phone.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material.icons.filled.SkipNext
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.notdxbi.dxbi.tv.phone.Setting
import com.notdxbi.dxbi.tv.phone.Stremio
import kotlinx.coroutines.launch

/** Settings for how Stremio's page looks (TV and computer), which the phone's own screens don't use */
private val WEB_ONLY = setOf(
    "liteMode", "builtInTheme", "previews", "ratings", "animeTitles", "wideContinue", "librarySort", "trailers",
    "whoIsWatching", "addonTools", "posterAccent", "crispPosters", "streamTools", "streamRows", "splash", "introSound",
    "profileSync", "uiSounds", "focusColour", "videoRowsOnly", "newEpisodes", "accent",
    // hover cards and dimmed watched titles are the big screen's (the phone has neither)
    "trailerDelay", "watchedTitles",
)

/** Each section's icon on the first page */
private fun sectionIcon(group: String): androidx.compose.ui.graphics.vector.ImageVector = when (group.lowercase()) {
    "player" -> Icons.Filled.PlayCircle
    "home" -> Icons.Filled.Home
    "browsing & library" -> Icons.Filled.VideoLibrary
    "subtitles" -> Icons.Filled.Subtitles
    "episodes & skipping" -> Icons.Filled.SkipNext
    "watch party" -> Icons.Filled.Groups
    "intro & sounds" -> Icons.AutoMirrored.Filled.VolumeUp
    else -> Icons.Filled.Tune
}

/**
 * dx.bi settings: the same list the TV shows, in sections like a phone's own Settings. The first page
 * lists the sections; each opens on its own short page (one long list of every option took a lot of
 * scrolling to find anything).
 */
@Composable
fun SettingsScreen(stremio: Stremio, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var list by remember { mutableStateOf<List<Setting>?>(null) }
    var editing by remember { mutableStateOf<Setting?>(null) }
    var section by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { list = stremio.settings().filter { it.key !in WEB_ONLY } }
    androidx.activity.compose.BackHandler(enabled = section != null) { section = null }

    fun save(s: Setting, value: Any?) {
        // shown at once, saved behind
        list = list?.map { if (it.key == s.key) it.copy(value = value) else it }
        scope.launch { stremio.saveSetting(s.key, value) }
    }

    // the phone's own option (where videos play) leads the Player section
    val other by stremio.playInOtherApp.collectAsState()
    val playIn = Setting("playIn", "select", "Play videos in", "dx.bi's player, or another app on this phone (VLC, mpv, MX Player…).",
        "Player", listOf(false to "dx.bi's player", true to "External player (ask which)"), other)

    Column(Modifier.fillMaxSize().background(Dx.Background).windowInsetsPadding(WindowInsets.safeDrawing)) {
        Row(Modifier.fillMaxWidth().height(56.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { if (section != null) section = null else onBack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Dx.Text) }
            Text(section ?: "dx.bi settings", style = MaterialTheme.typography.titleLarge, color = Dx.Text)
        }
        val items = list
        if (items == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Dx.Accent) }
            return@Column
        }
        val groups = (listOf("Player") + items.map { it.group.ifEmpty { "More" } }).distinct()
        fun inGroup(g: String) = (if (g == "Player") listOf(playIn) else emptyList()) + items.filter { it.group.ifEmpty { "More" } == g }
        val open = section
        if (open == null) {
            LazyColumn(contentPadding = PaddingValues(top = 4.dp, bottom = 32.dp)) {
                items(groups, key = { it }) { g ->
                    val inside = inGroup(g)
                    Row(
                        Modifier.fillMaxWidth().clickable { section = g }.padding(horizontal = Gutter, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(sectionIcon(g), contentDescription = null, tint = Dx.Text, modifier = Modifier.size(24.dp))
                        Spacer(Modifier.width(18.dp))
                        Column(Modifier.weight(1f)) {
                            Text(g, color = Dx.Text, style = MaterialTheme.typography.titleSmall)
                            Text(inside.map { it.label.removePrefix("$g: ").removePrefix("Reviews: ").replaceFirstChar { c -> c.uppercase() } }.distinct().take(3).joinToString(", "), color = Dx.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Dx.Faint)
                    }
                }
            }
        } else {
            LazyColumn(contentPadding = PaddingValues(top = 4.dp, bottom = 32.dp)) {
                items(inGroup(open), key = { it.key }) { s ->
                    if (s.key == "playIn") SettingRow(s, onToggle = {}, onPick = { stremio.setPlayInOtherApp(it == true) }, onEdit = {})
                    else SettingRow(s, onToggle = { save(s, it) }, onPick = { save(s, it) }, onEdit = { editing = s })
                }
            }
        }
    }

    editing?.let { s ->
        var text by remember(s.key) { mutableStateOf((s.value as? String).orEmpty()) }
        AlertDialog(
            onDismissRequest = { editing = null },
            title = { Text(s.label) },
            text = {
                Column {
                    if (s.description.isNotEmpty()) Text(s.description, color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(text, { text = it }, singleLine = true, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = { TextButton(onClick = { save(s, text.trim()); editing = null }) { Text("Save") } },
            dismissButton = { TextButton(onClick = { editing = null }) { Text("Cancel") } },
            containerColor = Dx.Surface,
        )
    }
}

@Composable
private fun SettingRow(s: Setting, onToggle: (Boolean) -> Unit, onPick: (Any?) -> Unit, onEdit: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    // (long explanations stay two lines; a press on them shows all of it)
    var whole by remember(s.key) { mutableStateOf(false) }
    Row(
        Modifier.fillMaxWidth().clickable {
            when (s.type) {
                "toggle" -> onToggle(s.value != true)
                "select" -> menu = true
                else -> onEdit()
            }
        }.padding(horizontal = Gutter, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(s.label, color = Dx.Text, style = MaterialTheme.typography.titleSmall)
            if (s.description.isNotEmpty()) Text(
                s.description, color = Dx.Muted, style = MaterialTheme.typography.bodySmall,
                maxLines = if (whole) Int.MAX_VALUE else 2, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp).clickable { whole = !whole },
            )
        }
        Spacer(Modifier.width(14.dp))
        when (s.type) {
            "toggle" -> Switch(
                checked = s.value == true,
                onCheckedChange = onToggle,
                colors = SwitchDefaults.colors(checkedTrackColor = Dx.Accent, checkedThumbColor = Color.White, uncheckedTrackColor = Dx.Raised),
            )
            "select" -> Box {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(s.options.firstOrNull { it.first == s.value }?.second ?: s.value?.toString().orEmpty(), color = Dx.Muted, style = MaterialTheme.typography.bodyMedium,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 150.dp))
                    Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = Dx.Faint, modifier = Modifier.size(18.dp))
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    s.options.forEach { (value, label) -> DropdownMenuItem(text = { Text(label) }, onClick = { menu = false; onPick(value) }) }
                }
            }
            else -> Text(if ((s.value as? String).isNullOrEmpty()) "Not set" else "Set", color = Dx.Muted, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

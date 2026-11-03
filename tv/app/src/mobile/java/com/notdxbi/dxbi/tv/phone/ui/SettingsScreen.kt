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
import androidx.compose.foundation.lazy.itemsIndexed
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
)

/** dx.bi settings: the same list the TV shows, as a phone settings screen */
@Composable
fun SettingsScreen(stremio: Stremio, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    var list by remember { mutableStateOf<List<Setting>?>(null) }
    var editing by remember { mutableStateOf<Setting?>(null) }
    LaunchedEffect(Unit) { list = stremio.settings().filter { it.key !in WEB_ONLY } }

    fun save(s: Setting, value: Any?) {
        // shown at once, saved behind
        list = list?.map { if (it.key == s.key) it.copy(value = value) else it }
        scope.launch { stremio.saveSetting(s.key, value) }
    }

    Column(Modifier.fillMaxSize().background(Dx.Background).windowInsetsPadding(WindowInsets.safeDrawing)) {
        Row(Modifier.fillMaxWidth().height(56.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Dx.Text) }
            Text("dx.bi settings", style = MaterialTheme.typography.titleLarge, color = Dx.Text)
        }
        val items = list
        if (items == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Dx.Accent) }
            return@Column
        }
        LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
            // the phone's own: where videos play
            item(key = "playIn") {
                val other by stremio.playInOtherApp.collectAsState()
                Text("PLAYER", color = Dx.Accent, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(start = Gutter, top = 22.dp, bottom = 4.dp))
                SettingRow(
                    Setting("playIn", "select", "Play videos in", "dx.bi's player, or an external player on this phone (VLC, mpv, MX Player…). The player's More menu and each stream's ⋮ menu play with an external player any time.",
                        "", listOf(false to "dx.bi's player", true to "External player (ask which)"), other),
                    onToggle = {}, onPick = { stremio.setPlayInOtherApp(it == true) }, onEdit = {},
                )
            }
            itemsIndexed(items, key = { _, s -> s.key }) { i, s ->
                if (s.group.isNotEmpty() && s.group != items.getOrNull(i - 1)?.group) {
                    Text(s.group.uppercase(), color = Dx.Accent, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(start = Gutter, top = 22.dp, bottom = 4.dp))
                }
                SettingRow(s, onToggle = { save(s, it) }, onPick = { save(s, it) }, onEdit = { editing = s })
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
            if (s.description.isNotEmpty()) Text(s.description, color = Dx.Faint, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.width(12.dp))
        when (s.type) {
            "toggle" -> Switch(
                checked = s.value == true,
                onCheckedChange = onToggle,
                colors = SwitchDefaults.colors(checkedTrackColor = Dx.Accent, checkedThumbColor = Color.White, uncheckedTrackColor = Dx.Raised),
            )
            "select" -> Box {
                Text(s.options.firstOrNull { it.first == s.value }?.second ?: s.value?.toString().orEmpty(), color = Dx.Muted, style = MaterialTheme.typography.bodyMedium)
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    s.options.forEach { (value, label) -> DropdownMenuItem(text = { Text(label) }, onClick = { menu = false; onPick(value) }) }
                }
            }
            else -> Text(if ((s.value as? String).isNullOrEmpty()) "Not set" else "Set", color = Dx.Muted, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

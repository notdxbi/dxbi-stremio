package com.notdxbi.dxbi.tv.phone.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.notdxbi.dxbi.tv.phone.Stremio
import com.notdxbi.dxbi.tv.phone.objects
import com.notdxbi.dxbi.tv.phone.text
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * Watch party, as a sheet: start one or join with a code, then the code to send friends, what's on,
 * who's watching and a chat. When the host plays something, everyone's player opens it in sync.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PartySheet(stremio: Stremio, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<JSONObject?>(null) }
    var busy by remember { mutableStateOf(false) }
    var problem by remember { mutableStateOf<String?>(null) }
    // kept current while the sheet is open (people join, the host plays, chat arrives)
    LaunchedEffect(Unit) {
        while (true) {
            stremio.party()?.let { state = it }
            delay(1500)
        }
    }
    val s = state
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Dx.Surface) {
        Column(
            Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = Gutter)
                .windowInsetsPadding(WindowInsets.navigationBars).padding(bottom = 20.dp),
        ) {
            Text("Watch party", style = MaterialTheme.typography.headlineMedium, color = Dx.Text)
            Text("Watch in sync with friends", color = Dx.Muted, style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(18.dp))
            when {
                s == null -> Box(Modifier.fillMaxWidth().padding(30.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Dx.Accent) }
                !s.optBoolean("active") -> Lobby(s, busy, problem,
                    onStart = { name ->
                        busy = true
                        problem = null
                        scope.launch { problem = stremio.startParty(name); busy = false; state = stremio.party() }
                    },
                    onJoin = { code, name ->
                        busy = true
                        problem = null
                        scope.launch { problem = stremio.joinParty(code, name); busy = false; state = stremio.party() }
                    })
                else -> InParty(s, context, stremio)
            }
        }
    }
}

@Composable
private fun androidx.compose.foundation.layout.ColumnScope.Lobby(s: JSONObject, busy: Boolean, problem: String?, onStart: (String) -> Unit, onJoin: (String, String) -> Unit) {
    var name by remember { mutableStateOf(s.optString("name")) }
    var code by remember { mutableStateOf("") }
    OutlinedTextField(name, { name = it.take(24) }, label = { Text("Your name") }, placeholder = { Text("What should friends see?") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    Spacer(Modifier.height(14.dp))
    OutlineButton(if (busy) "Starting…" else "Start a party", Modifier.fillMaxWidth(), filled = true) { if (!busy && name.isNotBlank()) onStart(name.trim()) }
    Text("or join one", color = Dx.Faint, style = MaterialTheme.typography.bodySmall, modifier = Modifier.align(Alignment.CenterHorizontally).padding(vertical = 14.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(code, { code = it.take(14) }, placeholder = { Text("Party code") }, singleLine = true, modifier = Modifier.weight(1f))
        Spacer(Modifier.width(10.dp))
        OutlineButton("Join", Modifier.width(96.dp)) { if (!busy && name.isNotBlank() && code.isNotBlank()) onJoin(code.trim(), name.trim()) }
    }
    s.text("lastCode")?.let { last ->
        Spacer(Modifier.height(10.dp))
        OutlineButton("Rejoin last party · $last", Modifier.fillMaxWidth()) { if (!busy && name.isNotBlank()) onJoin(last, name.trim()) }
    }
    if (name.isBlank()) Text("Pick a name first, so friends know who joined.", color = Dx.Faint, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 10.dp))
    problem?.let { Text(it, color = Dx.Accent, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 10.dp)) }
    Spacer(Modifier.height(16.dp))
    Row(verticalAlignment = Alignment.Top) {
        Icon(Icons.Filled.Lock, contentDescription = null, tint = Dx.Faint, modifier = Modifier.size(16.dp))
        Spacer(Modifier.width(8.dp))
        Text("End-to-end encrypted with the party code. Everyone streams from their own addons and debrid account: links and keys are never shared.",
            color = Dx.Faint, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun InParty(s: JSONObject, context: Context, stremio: Stremio) {
    val code = s.optString("code")
    val status = when {
        s.optBoolean("connecting") -> "Connecting…"
        s.optBoolean("connected") -> "Connected · ${s.optJSONArray("members")?.length() ?: 0} watching"
        else -> "Reconnecting…"
    }
    Text(status, color = if (s.optBoolean("connected")) Color(0xFF46D369) else Dx.Muted, style = MaterialTheme.typography.labelMedium)
    Spacer(Modifier.height(10.dp))
    Text("PARTY CODE · SEND IT TO FRIENDS", color = Dx.Faint, style = MaterialTheme.typography.labelSmall)
    Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(code, color = Dx.Text, fontWeight = FontWeight.Black, fontSize = 26.sp, letterSpacing = 2.sp, modifier = Modifier.weight(1f))
        OutlineButton("Copy", Modifier.width(80.dp)) {
            (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Party code", code))
            Toast.makeText(context, "Code copied", Toast.LENGTH_SHORT).show()
        }
        Spacer(Modifier.width(8.dp))
        OutlineButton("Share", Modifier.width(84.dp)) {
            context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "Join my dx.bi watch party: $code"), null))
        }
    }
    Spacer(Modifier.height(16.dp))
    val media = s.optJSONObject("media")
    if (media != null) {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Dx.Raised).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("NOW WATCHING", color = Dx.Faint, style = MaterialTheme.typography.labelSmall)
                Text(media.optString("title"), color = Dx.Text, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(if (media.optBoolean("playing")) "Playing" else "Paused", color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
            }
            if (!media.optBoolean("here")) OutlineButton(if (s.optBoolean("isHost")) "Resume" else "Join", Modifier.width(92.dp), filled = true) { stremio.rejoinParty() }
        }
    } else {
        Text(if (s.optBoolean("isHost")) "Play anything: everyone in the party opens it with you." else "Waiting for the host to play something…", color = Dx.Muted, style = MaterialTheme.typography.bodyMedium)
    }
    Spacer(Modifier.height(16.dp))
    Text("PEOPLE", color = Dx.Faint, style = MaterialTheme.typography.labelSmall)
    s.optJSONArray("members").objects().forEach { m ->
        Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(34.dp).clip(CircleShape).background(Dx.Raised), contentAlignment = Alignment.Center) {
                Text(m.optString("name").take(1).uppercase(), color = Dx.Text, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.width(10.dp))
            Column {
                Text(m.optString("name") + (if (m.optBoolean("self")) " (you)" else "") + (if (m.optBoolean("host")) " · host" else ""), color = Dx.Text, style = MaterialTheme.typography.titleSmall)
                Text(m.optString("line"), color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
    Spacer(Modifier.height(12.dp))
    Text("CHAT", color = Dx.Faint, style = MaterialTheme.typography.labelSmall)
    val chat = s.optJSONArray("chat").objects()
    LazyColumn(Modifier.fillMaxWidth().heightIn(max = 180.dp).padding(vertical = 6.dp)) {
        items(chat) { m ->
            Text(
                "${m.optString("name")}: ${m.optString("text")}",
                color = if (m.optBoolean("mine")) Dx.Text else Dx.Muted,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(vertical = 2.dp),
            )
        }
    }
    var say by remember { mutableStateOf("") }
    Row(verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(say, { say = it.take(300) }, placeholder = { Text("Say something…") }, singleLine = true, modifier = Modifier.weight(1f))
        IconButton(onClick = { if (say.isNotBlank()) { stremio.sayInParty(say.trim()); say = "" } }) {
            Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send", tint = Dx.Text)
        }
    }
    Spacer(Modifier.height(14.dp))
    OutlineButton("Leave party", Modifier.fillMaxWidth()) { stremio.leaveParty() }
}

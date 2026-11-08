package com.notdxbi.dxbi.tv.phone.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Subtitles
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.notdxbi.dxbi.tv.phone.Airing
import com.notdxbi.dxbi.tv.phone.Load
import com.notdxbi.dxbi.tv.phone.Stremio
import com.notdxbi.dxbi.tv.phone.Title
import kotlinx.coroutines.launch

// ---------------------------------------------------------------------------------------------------
// Profile: the account, its lists, and settings

@Composable
fun ProfileScreen(
    stremio: Stremio,
    onOpen: (Title) -> Unit,
    onLibrary: () -> Unit,
    onDownloads: () -> Unit,
    onCustomiseHome: () -> Unit,
    onSettings: () -> Unit,
    onStremioSettings: () -> Unit,
    onStats: () -> Unit,
) {
    val account by stremio.account.collectAsState()
    val myList by stremio.myList.collectAsState()
    val continueWatching by stremio.continueWatching.collectAsState()
    var reporting by rememberSaveable { mutableStateOf(false) }
    if (reporting) ReportDialog(stremio) { reporting = false }
    LazyColumn(
        Modifier.fillMaxSize().background(Dx.Background).windowInsetsPadding(WindowInsets.safeDrawing),
        contentPadding = PaddingValues(bottom = 24.dp + LocalBarSpace.current),
    ) {
        item {
            Column(Modifier.fillMaxWidth().padding(top = 24.dp, bottom = 18.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.size(76.dp).clip(CircleShape).background(Dx.Raised), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.Person, contentDescription = null, tint = Dx.Muted, modifier = Modifier.size(46.dp))
                }
                Spacer(Modifier.height(12.dp))
                Text(account?.email ?: "Not signed in", style = MaterialTheme.typography.titleMedium, color = Dx.Text)
            }
        }
        if (continueWatching.isNotEmpty()) item {
            PosterRow("Continue Watching", continueWatching.map { it.title }, onOpen = onOpen)
        }
        // (an empty My List was a heading over a blank gap: it shows once something's in it)
        val listed = myList.flatMap { it.items }
        if (listed.isNotEmpty()) item { PosterRow(myList.firstOrNull()?.name ?: "My List", listed, onMore = onLibrary, onOpen = onOpen) }
        item {
            Column(Modifier.padding(top = 6.dp)) {
                Line(Icons.Filled.VideoLibrary, "Library", "Everything you've added or watched", onClick = onLibrary)
                Line(Icons.Filled.Download, "Downloads", "Films and episodes saved to watch offline", onClick = onDownloads)
                Line(Icons.Filled.BarChart, "Your stats", "How long you've watched, what and when", onClick = onStats)
                Line(Icons.Filled.Tune, "Customise Home", "Order and hide Home's rows", onClick = onCustomiseHome)
                Line(Icons.Filled.Settings, "dx.bi settings", "Rows, reviews, skipping, watch party and more", onClick = onSettings)
                Line(Icons.Filled.Subtitles, "Playback & subtitles", "Languages, subtitles, next episode, streaming server", onClick = onStremioSettings)
                Line(Icons.Filled.BugReport, "Report a problem", "Tell dx.bi's developer what went wrong") { reporting = true }
                // (signing out of a guest session goes back to the sign-in screen)
                if (account?.signedIn == true) Line(Icons.AutoMirrored.Filled.ExitToApp, "Sign out", account?.email) { stremio.signOut() }
                else Line(Icons.AutoMirrored.Filled.ExitToApp, "Sign in", "Your library, progress and addons on every device") { stremio.signOut() }
            }
        }
    }
}

/** Report a problem: what went wrong, sent with dx.bi's own report (as on the desktop and TV) */
@Composable
private fun ReportDialog(stremio: Stremio, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    var text by rememberSaveable { mutableStateOf("") }
    var sending by remember { mutableStateOf(false) }
    var code by remember { mutableStateOf<String?>(null) }
    var problem by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = { if (!sending) onClose() },
        title = { Text(if (code != null) "Report sent" else "Report a problem") },
        text = {
            Column {
                if (code != null) {
                    Text("Thanks! Your report code is $code.\nPost it in dx.bi's Discord (#bug-reports) so it can be matched to you.", color = Dx.Text)
                } else {
                    Text("What went wrong, and what were you doing? dx.bi adds its version, this phone's model, your settings, addon names and recent errors. No passwords, keys or stream links are sent.", color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(value = text, onValueChange = { text = it }, minLines = 4, maxLines = 8, modifier = Modifier.fillMaxWidth())
                    problem?.let { Text(it, color = Dx.Accent, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 8.dp)) }
                }
            }
        },
        confirmButton = {
            if (code != null) TextButton(onClick = onClose) { Text("OK") }
            else TextButton(enabled = !sending, onClick = {
                sending = true
                problem = null
                scope.launch {
                    stremio.report(text).onSuccess { code = it }.onFailure { problem = it.message ?: "Couldn't send the report. Try again in a moment." }
                    sending = false
                }
            }) { Text(if (sending) "Sending…" else "Send report") }
        },
        dismissButton = { if (code == null) TextButton(enabled = !sending, onClick = onClose) { Text("Cancel") } },
    )
}

@Composable
fun Line(icon: ImageVector, title: String, note: String?, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = Gutter, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, tint = Dx.Muted)
        Spacer(Modifier.width(16.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = Dx.Text, style = MaterialTheme.typography.titleSmall)
            note?.let { Text(it, color = Dx.Faint, style = MaterialTheme.typography.bodySmall) }
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = null, tint = Dx.Faint)
    }
}

// ---------------------------------------------------------------------------------------------------
// Signing in (with a Stremio account)

@Composable
fun SignInScreen(stremio: Stremio) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var email by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var busy by rememberSaveable { mutableStateOf(false) }
    var problem by rememberSaveable { mutableStateOf<String?>(null) }
    val field = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = Dx.Text, unfocusedBorderColor = Dx.Line, focusedContainerColor = Dx.Raised, unfocusedContainerColor = Dx.Raised,
        focusedLabelColor = Dx.Muted, unfocusedLabelColor = Dx.Faint, cursorColor = Dx.Accent,
    )
    Column(
        Modifier.fillMaxSize().background(Dx.Background).windowInsetsPadding(WindowInsets.safeDrawing).imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Logo(52.sp)
        Spacer(Modifier.height(28.dp))
        Text("Sign in", style = MaterialTheme.typography.headlineMedium, color = Dx.Text)
        Text("With your Stremio account: your addons, library and progress come with it.", color = Dx.Muted, style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(20.dp))
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true, colors = field,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true, colors = field,
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
        problem?.let { Text(it, color = Dx.Accent, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 10.dp)) }
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = {
                busy = true
                problem = null
                scope.launch {
                    problem = stremio.signIn(email.trim(), password)
                    busy = false
                }
            },
            enabled = !busy && email.isNotBlank() && password.isNotEmpty(),
            colors = ButtonDefaults.buttonColors(containerColor = Dx.Accent),
            shape = RoundedCornerShape(6.dp),
            modifier = Modifier.fillMaxWidth().height(50.dp),
        ) {
            if (busy) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            else Text("Sign In", style = MaterialTheme.typography.labelLarge)
        }
        Spacer(Modifier.height(16.dp))
        TextButton(onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.stremio.com/register"))) }) {
            Text("New to Stremio? Create a free account", color = Dx.Muted)
        }
        TextButton(onClick = { stremio.continueAsGuest() }) {
            Text("Continue without an account", color = Dx.Faint)
        }
    }
}

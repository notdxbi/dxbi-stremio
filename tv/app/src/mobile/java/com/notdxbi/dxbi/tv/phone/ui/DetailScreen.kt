package com.notdxbi.dxbi.tv.phone.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Theaters
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import kotlinx.coroutines.delay
import com.notdxbi.dxbi.tv.phone.StreamOption
import com.notdxbi.dxbi.tv.phone.StreamChoices
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.asPaddingValues
import com.notdxbi.dxbi.tv.Phone
import com.notdxbi.dxbi.tv.phone.Details
import com.notdxbi.dxbi.tv.phone.Load
import com.notdxbi.dxbi.tv.phone.Review
import com.notdxbi.dxbi.tv.phone.Reviews
import com.notdxbi.dxbi.tv.phone.Score
import com.notdxbi.dxbi.tv.phone.Stremio
import com.notdxbi.dxbi.tv.phone.Title
import com.notdxbi.dxbi.tv.phone.Video

/**
 * A title: art, what it is, Play, My List, reviews, and for a series its seasons and episodes.
 *
 * Play is instant: the streams for what Play would start are fetched as soon as the title's details
 * arrive. With dx.bi's Just press Play on, Play starts dx.bi's pick straight away; otherwise (or to
 * choose) the streams come up with that pick on top. Held sideways on a big enough screen, the
 * details sit on the left and the episodes (or a film's streams) on the right.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetailScreen(stremio: Stremio, type: String, id: String, preview: Title?, play: Boolean, onBack: () -> Unit, onSearch: (String) -> Unit) {
    val all by stremio.details.collectAsState()
    // what's shown is this title's (the model can still hold the last title's for a moment)
    val details = all?.takeIf { it.metaId == id }
    val title = details?.title ?: preview ?: Title(id, type, "")
    val context = LocalContext.current
    val config = LocalConfiguration.current
    val wide = config.screenWidthDp > config.screenHeightDp && config.screenWidthDp >= 600
    var sheet by rememberSaveable { mutableStateOf(false) }
    // sideways: whether the right side shows the streams (a film always does)
    var paneStreams by rememberSaveable { mutableStateOf(type != "series") }
    var season by rememberSaveable { mutableStateOf<Int?>(null) }
    var choices by remember(type, id) { mutableStateOf<StreamChoices?>(null) }
    // what Play was pressed for, while dx.bi's pick for it is worked out (Just press Play)
    var waitingFor by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(type, id) { stremio.open(type, id) }
    // scores and reviews (with the TMDB and MDBList keys from dx.bi settings), fetched alongside
    var reviews by remember(type, id) { mutableStateOf<Reviews?>(null) }
    var reviewsOpen by rememberSaveable(type, id) { mutableStateOf(false) }
    LaunchedEffect(type, id) { reviews = stremio.reviews(type, id) }

    /** What Play starts: the episode they're in the middle of, else the first one */
    fun nextVideo(d: Details): Video? {
        if (type != "series") return null
        return d.videos.firstOrNull { it.id == d.resumeVideoId } ?: d.videos.firstOrNull { (it.season ?: 0) > 0 && !it.upcoming } ?: d.videos.firstOrNull()
    }

    // The streams for that episode, fetched before Play is pressed
    LaunchedEffect(details?.state, details?.metaId) {
        if (details?.state == Load.Ready && type == "series" && details.videoId == null) nextVideo(details)?.let { stremio.open(type, id, it.id) }
    }
    // dx.bi's reading of them, again as more addons answer
    LaunchedEffect(details) { if (details?.videoId != null) choices = stremio.streams() }
    val current = choices?.takeIf { details?.videoId != null && it.videoId == details.videoId }

    // (Android 13 and later ask before an app shows notifications: downloads show their progress in one)
    val notifications = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) {}

    fun play(option: StreamOption, target: Phone.Target = Phone.Target.Player) {
        waitingFor = null
        sheet = false
        if (target == Phone.Target.Download && android.os.Build.VERSION.SDK_INT >= 33 &&
            androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) notifications.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        stremio.play(option, target)
    }

    fun start(videoId: String?) {
        val target = videoId ?: details?.videoId ?: id
        if (type == "series" && videoId != null && videoId != details?.videoId) stremio.open(type, id, videoId)
        waitingFor = target
        if (wide) paneStreams = true else sheet = true
    }

    // Just press Play: dx.bi's pick plays as soon as it's sure (the stream chosen last time at once,
    // anything else once every addon has answered, or after 6 seconds)
    LaunchedEffect(waitingFor, current) {
        val c = current ?: return@LaunchedEffect
        if (waitingFor != c.videoId || !c.justPlay) return@LaunchedEffect
        val pick = c.picked ?: return@LaunchedEffect
        if (c.sameAsLastTime || c.settled) play(pick)
    }
    LaunchedEffect(waitingFor) {
        if (waitingFor == null) return@LaunchedEffect
        delay(6000)
        val c = current
        if (c != null && c.justPlay && waitingFor == c.videoId) c.picked?.let { play(it) }
    }

    var autoPlayed by remember { mutableStateOf(false) }
    LaunchedEffect(play, details?.state) {
        if (play && !autoPlayed && details?.state == Load.Ready) {
            autoPlayed = true
            start(nextVideo(details)?.id)
        }
    }

    val episode = details?.videos?.firstOrNull { it.id == details.videoId }
    val episodeLine = episode?.let { "S${it.season} E${it.episode} · ${it.title}" }

    val info: LazyListScope.(Boolean) -> Unit = { withEpisodes ->
        item {
            // (sideways it's shorter, so Play stays on screen)
            Box(Modifier.fillMaxWidth().aspectRatio(if (wide) 16f / 7f else 16f / 10f)) {
                AsyncImage(model = title.backdrop, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = 0.55f), 0.3f to Color.Transparent, 0.65f to Color.Transparent, 1f to Dx.Background)))
                // the title's logo names it, as on the desktop (its name in large type when it has none)
                Box(Modifier.align(Alignment.BottomStart).padding(start = Gutter, end = Gutter, bottom = 8.dp).fillMaxWidth(0.62f)) {
                    TitleArt(title, Modifier.fillMaxWidth().heightIn(max = 92.dp), textSize = 28, start = true)
                }
            }
        }
        item { Header(title, details, onPlay = { start(details?.let { nextVideo(it)?.id }) }) }
        reviews?.scores?.takeIf { it.isNotEmpty() }?.let { scores -> item { ScoreBadges(scores) } }
        item {
            // (the buttons share the width: five don't fit side by side at a fixed spacing)
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 10.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                val inList = details?.title?.inLibrary == true
                val ready = details?.state == Load.Ready
                Action(if (inList) Icons.Filled.Check else Icons.Filled.Add, if (inList) "In Library" else "Library", enabled = ready) { stremio.setInList(!inList) }
                val watched = details?.title?.watched == true
                Action(if (watched) Icons.Filled.Visibility else Icons.Outlined.VisibilityOff, if (watched) "Watched" else "Mark watched", enabled = ready) { stremio.setWatched(!watched) }
                Action(if (reviewsOpen) Icons.Filled.Star else Icons.Outlined.StarBorder, "Reviews") { reviewsOpen = !reviewsOpen }
                title.trailer?.let { yt ->
                    Action(Icons.Filled.Theaters, "Trailer") {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com/watch?v=$yt")))
                    }
                }
                Action(Icons.Filled.Share, "Share") {
                    val link = if (id.startsWith("tt")) "https://www.imdb.com/title/$id" else title.name
                    context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "${title.name} $link"), null))
                }
            }
        }
        // reviews when asked for (the ★ button): what critics said, and audience reviews
        if (reviewsOpen) item {
            val r = reviews
            when {
                r == null -> Text("Gathering reviews…", color = Dx.Muted, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(Gutter, 14.dp))
                r.critics.isEmpty() && r.audience.isEmpty() && r.audienceProblem == null && r.problem == null ->
                    Text("No reviews found for this one yet." + if ("tmdb" in r.missing) " A TMDB key in dx.bi settings adds audience reviews." else "",
                        color = Dx.Muted, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(Gutter, 14.dp))
                else -> ReviewsSection(r)
            }
        }
        if (details == null || details.state == Load.Loading) item {
            Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Dx.Accent) }
        }
        if (withEpisodes && details != null && type == "series" && details.videos.isNotEmpty()) {
            val seasons = details.seasons
            val shown = season ?: nextVideo(details)?.season ?: seasons.firstOrNull()
            item { SeasonPicker(seasons, shown) { season = it } }
            items(details.videos.filter { it.season == shown }, key = { it.id }) { v ->
                Episode(v, resumeHere = v.id == details.resumeVideoId, onWatched = { watched, upTo -> stremio.setWatched(v.id, watched, upTo) }) { start(v.id) }
            }
        }
        if (details != null && details.cast.isNotEmpty()) item {
            Column(Modifier.padding(horizontal = Gutter, vertical = 16.dp)) {
                Text("Cast", style = MaterialTheme.typography.titleSmall, color = Dx.Text)
                Spacer(Modifier.height(8.dp))
                // a person's name searches for their other titles
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    details.cast.take(8).chunked(2).forEach { pair ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            pair.forEach { name -> Pill(selected = false, onClick = { onSearch(name) }) { Text(name, color = Dx.Text, style = MaterialTheme.typography.bodySmall) } }
                        }
                    }
                }
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Dx.Background)) {
        if (!wide) {
            LazyColumn(contentPadding = PaddingValues(bottom = 40.dp)) { info(true) }
        } else {
            Row(Modifier.fillMaxSize()) {
                LazyColumn(Modifier.weight(1f).fillMaxHeight(), contentPadding = PaddingValues(bottom = 32.dp)) { info(false) }
                Column(Modifier.weight(1f).fillMaxHeight().background(Dx.Surface).windowInsetsPadding(WindowInsets.safeDrawing)) {
                    if (type == "series" && !paneStreams) {
                        val seasons = details?.seasons.orEmpty()
                        val shown = season ?: details?.let { nextVideo(it)?.season } ?: seasons.firstOrNull()
                        if (details != null && details.videos.isNotEmpty()) {
                            SeasonPicker(seasons, shown) { season = it }
                            LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
                                items(details.videos.filter { it.season == shown }, key = { it.id }) { v ->
                                    Episode(v, resumeHere = v.id == details.resumeVideoId, onWatched = { watched, upTo -> stremio.setWatched(v.id, watched, upTo) }) { start(v.id) }
                                }
                            }
                        } else Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Dx.Accent) }
                    } else {
                        if (type == "series") Row(
                            Modifier.fillMaxWidth().clickable { paneStreams = false; waitingFor = null }.padding(horizontal = 8.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = Dx.Text)
                            Spacer(Modifier.width(8.dp))
                            Text("Episodes", color = Dx.Text, style = MaterialTheme.typography.labelLarge)
                        }
                        StreamPicker(current, if (type == "series") episodeLine else "Streams", null, onPlay = { play(it) }, modifier = Modifier.fillMaxSize(), onPlayIn = ::play)
                    }
                }
            }
        }

        IconButton(
            onClick = onBack,
            modifier = Modifier.windowInsetsPadding(WindowInsets.safeDrawing).padding(8.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.5f)),
        ) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White) }
        if (!wide) CastButton(Modifier.align(Alignment.TopEnd).windowInsetsPadding(WindowInsets.safeDrawing).padding(8.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.5f)))
    }

    if (sheet && !wide) {
        val state = rememberModalBottomSheetState(skipPartiallyExpanded = false)
        ModalBottomSheet(onDismissRequest = { sheet = false; waitingFor = null }, sheetState = state, containerColor = Dx.Background) {
            StreamPicker(
                current,
                title.name,
                episodeLine,
                onPlay = { play(it) },
                onPlayIn = ::play,
                modifier = Modifier.fillMaxWidth().heightIn(max = 680.dp),
                bottom = 24.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding(),
            )
        }
    }
}

@Composable
private fun Header(t: Title, d: Details?, onPlay: () -> Unit) {
    Column(Modifier.padding(horizontal = Gutter)) {
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            val bits = listOfNotNull(t.year, t.runtime?.let(::shortRuntime))
            bits.forEachIndexed { i, b ->
                if (i > 0) Spacer(Modifier.width(10.dp))
                Text(b, color = Dx.Muted, style = MaterialTheme.typography.bodyMedium)
            }
            t.imdb?.let { Spacer(Modifier.width(10.dp)); ImdbBadge(it) }
        }
        if (t.genres.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            Text(t.genres.joinToString(" · "), color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(14.dp))
        val resume = d?.resumeVideoId?.let { rid -> d.videos.firstOrNull { it.id == rid } }
        val resumeMovie = t.type != "series" && (d?.resumeMs ?: 0) > 0
        Button(
            onClick = onPlay,
            colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color.Black),
            shape = RoundedCornerShape(6.dp),
            modifier = Modifier.fillMaxWidth().height(46.dp),
        ) {
            Icon(Icons.Filled.PlayArrow, contentDescription = null)
            Spacer(Modifier.width(6.dp))
            Text(
                when {
                    resume?.season != null -> "Resume S${resume.season}:E${resume.episode}"
                    resumeMovie -> "Resume"
                    else -> "Play"
                },
                style = MaterialTheme.typography.labelLarge,
            )
        }
        if (resumeMovie && d != null && d.durationMs > 0) {
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                ProgressLine(d.resumeMs.toFloat() / d.durationMs, Modifier.weight(1f))
                Spacer(Modifier.width(10.dp))
                Text("${((d.durationMs - d.resumeMs) / 60000).coerceAtLeast(1)}m left", color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
            }
        }
        t.description?.let {
            Spacer(Modifier.height(14.dp))
            Text(it, color = Dx.Text, style = MaterialTheme.typography.bodyMedium)
        }
        if (d != null && d.directors.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text("Director: ${d.directors.joinToString(", ")}", color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
        }
    }
}

/** "107 min" as "1h 47m" */
fun shortRuntime(runtime: String): String {
    val mins = Regex("""\d+""").find(runtime)?.value?.toIntOrNull() ?: return runtime
    if (!runtime.contains("min") && runtime.contains("h")) return runtime
    return if (mins < 60) "${mins}m" else "${mins / 60}h ${if (mins % 60 > 0) "${mins % 60}m" else ""}".trim()
}

@Composable
private fun Action(icon: ImageVector, label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Column(
        Modifier.clip(RoundedCornerShape(8.dp)).clickable(enabled = enabled, onClick = onClick).padding(horizontal = 4.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, contentDescription = label, tint = if (enabled) Dx.Text else Dx.Faint, modifier = Modifier.size(26.dp))
        Spacer(Modifier.height(4.dp))
        Text(label, color = Dx.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 1)
    }
}

@Composable
private fun SeasonPicker(seasons: List<Int>, current: Int?, onPick: (Int) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(Modifier.padding(horizontal = Gutter, vertical = 12.dp)) {
        Row(
            Modifier.clip(RoundedCornerShape(6.dp)).background(Dx.Raised).clickable(enabled = seasons.size > 1) { open = true }.padding(horizontal = 14.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(seasonName(current), color = Dx.Text, style = MaterialTheme.typography.labelLarge)
            if (seasons.size > 1) Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = Dx.Text)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            seasons.forEach { s -> DropdownMenuItem(text = { Text(seasonName(s)) }, onClick = { open = false; onPick(s) }) }
        }
    }
}

private fun seasonName(s: Int?) = when (s) {
    null -> "Episodes"
    0 -> "Specials"
    else -> "Season $s"
}

/** An episode: tap to play it; hold for watched, unwatched, or watched up to here */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Episode(v: Video, resumeHere: Boolean, onWatched: (watched: Boolean, upTo: Boolean) -> Unit, onPlay: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().combinedClickable(enabled = !v.upcoming, onLongClick = { menu = true }, onClick = onPlay).padding(horizontal = Gutter, vertical = 10.dp)) {
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            DropdownMenuItem(text = { Text(if (v.watched) "Mark as unwatched" else "Mark as watched") }, onClick = { menu = false; onWatched(!v.watched, false) })
            if ((v.episode ?: 0) > 1) DropdownMenuItem(text = { Text("Mark up to here as watched") }, onClick = { menu = false; onWatched(true, true) })
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.width(132.dp).aspectRatio(16f / 9f)) {
                Art(v.thumbnail, "", Modifier.fillMaxSize(), RoundedCornerShape(4.dp))
                if (!v.upcoming) Box(Modifier.align(Alignment.Center).size(34.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.5f)).border(1.dp, Color.White, CircleShape), contentAlignment = Alignment.Center) {
                    Icon(Icons.Filled.PlayArrow, contentDescription = "Play", tint = Color.White, modifier = Modifier.size(22.dp))
                }
                val progress = v.progress ?: if (v.watched) 1f else null
                if (progress != null && progress > 0f) ProgressLine(progress, Modifier.align(Alignment.BottomStart).fillMaxWidth())
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text("${v.episode ?: ""}. ${v.title.ifEmpty { "Episode ${v.episode ?: ""}" }}", color = Dx.Text, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                val note = when {
                    v.upcoming -> v.released?.take(10)?.let { "Coming $it" } ?: "Coming soon"
                    resumeHere -> "Continue watching"
                    v.watched -> "Watched"
                    else -> v.released?.take(4)
                }
                note?.let { Text(it, color = if (resumeHere) Dx.Accent else Dx.Muted, style = MaterialTheme.typography.bodySmall) }
            }
        }
        v.overview?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = Dx.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 3, overflow = TextOverflow.Ellipsis)
        }
    }
}

// ---------------------------------------------------------------------------------------------------
// Scores and reviews (dx.bi's Reviews: MDBList or Wikidata scores, Wikipedia, TMDB audience reviews)

/** Each site's score in its own colours: Rotten Tomatoes fresh or rotten, Metacritic green, yellow or red */
private fun scoreColour(s: Score): Color {
    val n = s.value.filter { it.isDigit() || it == '.' }.toFloatOrNull() ?: 0f
    return when (s.source) {
        "tomatoes", "tomatoesaudience", "popcorn" -> if (n >= 60) Color(0xFFFA320A) else Color(0xFF6B8E23)
        "metacritic", "metacriticuser" -> if (n >= 61 || (s.source == "metacriticuser" && n >= 6.1f)) Color(0xFF00CE7A) else if (n >= 40 || (s.source == "metacriticuser" && n >= 4f)) Color(0xFFFFBD3F) else Color(0xFFFF6874)
        "letterboxd" -> Color(0xFF40BCF4)
        "trakt" -> Color(0xFFED1C24)
        "tmdb" -> Color(0xFF01B4E4)
        "imdb" -> Dx.Imdb
        else -> Dx.Raised
    }
}

@Composable
private fun ScoreBadges(scores: List<Score>) {
    val context = LocalContext.current
    LazyRow(contentPadding = PaddingValues(horizontal = Gutter, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(scores.filter { it.source != "imdb" }, key = { it.source }) { s ->
            Row(
                Modifier.clip(RoundedCornerShape(8.dp)).background(Dx.Surface).border(1.dp, Dx.Line, RoundedCornerShape(8.dp))
                    .clickable(enabled = s.url != null) { s.url?.let { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(it))) } }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(scoreColour(s)))
                Spacer(Modifier.width(7.dp))
                Column {
                    Text(s.value, color = Dx.Text, style = MaterialTheme.typography.labelLarge)
                    Text(if (s.note.isNotEmpty()) "${s.name} · ${s.note}" else s.name, color = Dx.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                }
            }
        }
    }
}

@Composable
private fun ReviewsSection(r: Reviews) {
    val context = LocalContext.current
    var reading by remember { mutableStateOf<Review?>(null) }
    var criticsOpen by remember { mutableStateOf(false) }
    Column(Modifier.padding(top = 18.dp)) {
        Text("Reviews", style = MaterialTheme.typography.titleMedium, color = Dx.Text, modifier = Modifier.padding(horizontal = Gutter))
        if (r.critics.isNotEmpty()) {
            Column(Modifier.padding(horizontal = Gutter, vertical = 10.dp).clip(RoundedCornerShape(10.dp)).background(Dx.Surface).clickable { criticsOpen = !criticsOpen }.padding(14.dp)) {
                Text("What critics said", color = Dx.Muted, style = MaterialTheme.typography.labelMedium)
                Spacer(Modifier.height(6.dp))
                Text(r.critics.joinToString("\n\n"), color = Dx.Text, style = MaterialTheme.typography.bodyMedium, maxLines = if (criticsOpen) Int.MAX_VALUE else 5, overflow = TextOverflow.Ellipsis)
                if (criticsOpen && r.criticsUrl != null) Text(
                    "Read more on Wikipedia",
                    color = Dx.Accent,
                    style = MaterialTheme.typography.labelMedium,
                    modifier = Modifier.padding(top = 8.dp).clickable { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(r.criticsUrl))) },
                )
            }
        }
        if (r.audience.isNotEmpty()) {
            Text("Audience reviews · TMDB", color = Dx.Muted, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = Gutter, top = 6.dp, bottom = 8.dp))
            LazyRow(contentPadding = PaddingValues(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(r.audience) { review ->
                    Column(Modifier.width(270.dp).heightIn(min = 150.dp).clip(RoundedCornerShape(10.dp)).background(Dx.Surface).clickable { reading = review }.padding(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(review.author, color = Dx.Text, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                            review.rating?.let { Text("${"%.0f".format(it)}/10", color = Dx.Imdb, style = MaterialTheme.typography.labelMedium) }
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(review.text, color = Dx.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 6, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
        val notes = listOfNotNull(
            r.audienceProblem?.let { "$it. Check the TMDB key in dx.bi settings." },
            r.problem?.let { "$it, so these scores come from Wikidata." },
        )
        notes.forEach { Text(it, color = Dx.Faint, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = Gutter, vertical = 4.dp)) }
        val credits = listOfNotNull(
            r.scoresFrom?.let { "Scores from $it" },
            if (r.critics.isNotEmpty()) "Summary from Wikipedia (CC BY-SA)" else null,
            if (r.audience.isNotEmpty()) "This product uses the TMDB API but is not endorsed or certified by TMDB" else null,
        )
        if (credits.isNotEmpty()) Text(credits.joinToString(" · "), color = Dx.Faint, style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = Gutter, vertical = 10.dp))
    }

    reading?.let { review ->
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { reading = null },
            containerColor = Dx.Surface,
            title = { Text(review.author + (review.rating?.let { " · ${"%.0f".format(it)}/10" } ?: "")) },
            text = { LazyColumn(Modifier.heightIn(max = 460.dp)) { item { Text(review.text, color = Dx.Text, style = MaterialTheme.typography.bodyMedium) } } },
            confirmButton = { androidx.compose.material3.TextButton(onClick = { reading = null }) { Text("Close") } },
        )
    }
}

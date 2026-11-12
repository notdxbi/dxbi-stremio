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
import androidx.compose.material.icons.filled.Download
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
import com.notdxbi.dxbi.tv.phone.AddonFiles
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
    // (a library addon's season pack, type "other": its files as seasons and episodes, read from their names)
    val details = remember(all, id, type) {
        all?.takeIf { it.metaId == id }?.let { d -> if (type == "other" && d.videos.isNotEmpty()) d.copy(videos = AddonFiles.asEpisodes(d.videos)) else d }
    }
    // what has episodes to pick from: a series, or a pack
    val episodic = type == "series" || type == "other"
    val title = details?.title ?: preview ?: Title(id, type, "")
    val context = LocalContext.current
    val config = LocalConfiguration.current
    val wide = config.screenWidthDp > config.screenHeightDp && config.screenWidthDp >= 600
    var sheet by rememberSaveable { mutableStateOf(false) }
    // sideways: whether the right side shows the streams (a film always does)
    var paneStreams by rememberSaveable { mutableStateOf(!episodic) }
    var season by rememberSaveable { mutableStateOf<Int?>(null) }
    var choices by remember(type, id) { mutableStateOf<StreamChoices?>(null) }
    // what Play was pressed for, while dx.bi's pick for it is worked out (Just press Play)
    var waitingFor by remember { mutableStateOf<String?>(null) }
    // the streams are open to pick one to download ("Choose the source myself")
    var downloadMode by remember { mutableStateOf(false) }
    val downloader = rememberDownloader(stremio)
    val saved by com.notdxbi.dxbi.tv.Downloads.items.collectAsState()
    fun savedOf(videoId: String) = saved.firstOrNull { it.metaId == id && it.videoId == videoId }

    LaunchedEffect(type, id) { stremio.open(type, id) }
    // scores and reviews (with the TMDB and MDBList keys from dx.bi settings), fetched alongside
    var reviews by remember(type, id) { mutableStateOf<Reviews?>(null) }
    var reviewsOpen by rememberSaveable(type, id) { mutableStateOf(false) }
    LaunchedEffect(type, id) { reviews = stremio.reviews(type, id) }

    /** What Play starts: the episode they're in the middle of, else the first one */
    fun nextVideo(d: Details): Video? {
        if (!episodic) return null
        // (the one picked first: the page moves it on to the next episode after one is finished)
        return d.videos.firstOrNull { it.id == d.videoId } ?: d.videos.firstOrNull { it.id == d.resumeVideoId } ?: d.videos.firstOrNull { (it.season ?: 0) > 0 && !it.upcoming } ?: d.videos.firstOrNull()
    }

    // The streams for that episode, fetched before Play is pressed
    LaunchedEffect(details?.state, details?.metaId) {
        if (details?.state == Load.Ready && episodic && details.videoId == null) nextVideo(details)?.let { stremio.open(type, id, it.id) }
    }
    // dx.bi's reading of them, again as more addons answer
    LaunchedEffect(details) { if (details?.videoId != null) choices = stremio.streams() }
    // the episode picked shows in its season (back from the player, the page picks the next one
    // when the last was finished: dxbi-engine.js afterPlaying)
    LaunchedEffect(details?.videoId) {
        val d = details ?: return@LaunchedEffect
        d.videos.firstOrNull { it.id == d.videoId }?.season?.let { season = it }
    }
    val current = choices?.takeIf { details?.videoId != null && it.videoId == details.videoId }

    // (Android 13 and later ask before an app shows notifications: downloads show their progress in one)
    val notifications = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) {}

    fun play(option: StreamOption, target0: Phone.Target = Phone.Target.Player) {
        val target = if (downloadMode && target0 == Phone.Target.Player) Phone.Target.Download else target0
        downloadMode = false
        waitingFor = null
        sheet = false
        if (target == Phone.Target.Download && android.os.Build.VERSION.SDK_INT >= 33 &&
            androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) notifications.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        stremio.play(option, target)
    }

    fun start(videoId: String?) {
        val target = videoId ?: details?.videoId ?: id
        if (episodic && videoId != null && videoId != details?.videoId) stremio.open(type, id, videoId)
        downloadMode = false
        waitingFor = target
        if (wide) paneStreams = true else sheet = true
    }

    // the stream list for one episode (or the film), where a tap downloads instead of playing
    downloader.onChoose = { videoId ->
        if (episodic && videoId != details?.videoId) stremio.open(type, id, videoId)
        waitingFor = null
        downloadMode = true
        if (wide) paneStreams = true else sheet = true
    }
    fun downloadVideos(videoIds: List<String>, detail: String) = downloader.request(type, id, videoIds, title.name, detail)

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
    val episodeLine = episode?.let { if (it.episode == null) it.title else "S${it.season} E${it.episode} · ${it.title}" }

    val info: LazyListScope.(Boolean) -> Unit = { withEpisodes ->
        item {
            // (sideways it's shorter, so Play stays on screen)
            Box(Modifier.fillMaxWidth().aspectRatio(if (wide) 16f / 7f else 16f / 9f)) {
                AsyncImage(model = title.backdrop, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color.Black.copy(alpha = 0.55f), 0.3f to Color.Transparent, 0.65f to Color.Transparent, 1f to Dx.Background)))
                // the title's logo names it, as on the desktop (its name in large type when it has none)
                Box(Modifier.align(Alignment.BottomStart).padding(start = Gutter, end = Gutter, bottom = 8.dp).fillMaxWidth(0.62f)) {
                    TitleArt(title, Modifier.fillMaxWidth().heightIn(max = 92.dp), textSize = 28, start = true)
                }
            }
        }
        item {
            Header(title, details, onSearch, onPlay = { start(details?.let { nextVideo(it)?.id }) }) {
                if (!episodic) FilmDownload(savedOf(id), downloader.busy) { downloadVideos(listOf(id), "Film") }
            }
        }
        reviews?.scores?.takeIf { it.isNotEmpty() }?.let { scores -> item { ScoreBadges(scores) } }
        item {
            // (the buttons share the width: five don't fit side by side at a fixed spacing)
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
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
        if (withEpisodes && details != null && episodic && details.videos.isNotEmpty()) {
            val seasons = details.seasons
            val shown = season ?: nextVideo(details)?.season ?: seasons.firstOrNull()
            item { SeasonBar(seasons, shown, details.videos, ::savedOf, downloader.busy, { season = it }) { ids -> downloadVideos(ids, "${seasonName(shown)} · ${ids.size} episode${if (ids.size == 1) "" else "s"}") } }
            items(details.videos.filter { it.season == shown }, key = { it.id }) { v ->
                Episode(v, resumeHere = v.id == nextVideo(details)?.id, inProgress = v.id == details.resumeVideoId && details.resumeMs > 0, onWatched = { watched, upTo -> stremio.setWatched(v.id, watched, upTo) },
                    download = { if (!v.upcoming) DownloadIcon(savedOf(v.id)) { downloadVideos(listOf(v.id), "S${v.season} E${v.episode} · ${v.title}") } }) { start(v.id) }
            }
        }
    }

    // upright: once the picture has scrolled away, a solid bar with the title takes the back and
    // cast buttons (they floated over the episodes before)
    val listState = androidx.compose.foundation.lazy.rememberLazyListState()
    val pastHeader by remember { androidx.compose.runtime.derivedStateOf { listState.firstVisibleItemIndex > 0 } }
    val barAlpha by androidx.compose.animation.core.animateFloatAsState(if (pastHeader && !wide) 1f else 0f, label = "bar")

    Box(Modifier.fillMaxSize().background(Dx.Background)) {
        if (!wide) {
            LazyColumn(state = listState, contentPadding = PaddingValues(bottom = 40.dp)) { info(true) }
        } else {
            Row(Modifier.fillMaxSize()) {
                LazyColumn(Modifier.weight(1f).fillMaxHeight(), contentPadding = PaddingValues(bottom = 32.dp)) { info(false) }
                Column(Modifier.weight(1f).fillMaxHeight().background(Dx.Surface).windowInsetsPadding(WindowInsets.safeDrawing)) {
                    if (episodic && !paneStreams) {
                        val seasons = details?.seasons.orEmpty()
                        val shown = season ?: details?.let { nextVideo(it)?.season } ?: seasons.firstOrNull()
                        if (details != null && details.videos.isNotEmpty()) {
                            SeasonBar(seasons, shown, details.videos, ::savedOf, downloader.busy, { season = it }) { ids -> downloadVideos(ids, "${seasonName(shown)} · ${ids.size} episode${if (ids.size == 1) "" else "s"}") }
                            LazyColumn(contentPadding = PaddingValues(bottom = 32.dp)) {
                                items(details.videos.filter { it.season == shown }, key = { it.id }) { v ->
                                    Episode(v, resumeHere = v.id == nextVideo(details)?.id, inProgress = v.id == details.resumeVideoId && details.resumeMs > 0, onWatched = { watched, upTo -> stremio.setWatched(v.id, watched, upTo) },
                                        download = { if (!v.upcoming) DownloadIcon(savedOf(v.id)) { downloadVideos(listOf(v.id), "S${v.season} E${v.episode} · ${v.title}") } }) { start(v.id) }
                                }
                            }
                        } else Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Dx.Accent) }
                    } else {
                        if (episodic) Row(
                            Modifier.fillMaxWidth().clickable { paneStreams = false; waitingFor = null }.padding(horizontal = 8.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = Dx.Text)
                            Spacer(Modifier.width(8.dp))
                            Text("Episodes", color = Dx.Text, style = MaterialTheme.typography.labelLarge)
                        }
                        StreamPicker(current, if (episodic) episodeLine else "Streams", if (downloadMode) "Tap a stream to download it" else null, onPlay = { play(it) }, modifier = Modifier.fillMaxSize(), onPlayIn = ::play, downloading = downloadMode)
                    }
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().background(Dx.Background.copy(alpha = barAlpha)).windowInsetsPadding(WindowInsets.safeDrawing).padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = onBack,
                modifier = Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.5f * (1f - barAlpha))),
            ) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Color.White) }
            Text(
                title.name, color = Dx.Text.copy(alpha = barAlpha), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(horizontal = 8.dp),
            )
            if (!wide) CastButton(Modifier.clip(CircleShape).background(Color.Black.copy(alpha = 0.5f * (1f - barAlpha))))
        }
    }

    if (sheet && !wide) {
        val state = rememberModalBottomSheetState(skipPartiallyExpanded = false)
        ModalBottomSheet(onDismissRequest = { sheet = false; waitingFor = null; downloadMode = false }, sheetState = state, containerColor = Dx.Background) {
            StreamPicker(
                current,
                if (downloadMode) "Download: tap a stream" else title.name,
                if (downloadMode) listOfNotNull(title.name, episodeLine).joinToString(" · ") else episodeLine,
                onPlay = { play(it) },
                onPlayIn = ::play,
                downloading = downloadMode,
                modifier = Modifier.fillMaxWidth().heightIn(max = 680.dp),
                bottom = 24.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding(),
            )
        }
    }
}

@Composable
private fun Header(t: Title, d: Details?, onSearch: (String) -> Unit, onPlay: () -> Unit, below: @Composable () -> Unit = {}) {
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
        below()
        if (resumeMovie && d != null && d.durationMs > 0) {
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                ProgressLine(d.resumeMs.toFloat() / d.durationMs, Modifier.weight(1f))
                Spacer(Modifier.width(10.dp))
                Text("${((d.durationMs - d.resumeMs) / 60000).coerceAtLeast(1)}m left", color = Dx.Muted, style = MaterialTheme.typography.bodySmall)
            }
        }
        // Three lines of the story (tap for the rest), then who's in it, as on Netflix: the page used
        // to run on for the whole synopsis and a cast list at the very bottom
        t.description?.let {
            var whole by rememberSaveable(t.id) { mutableStateOf(false) }
            Spacer(Modifier.height(12.dp))
            Text(
                it, color = Dx.Text, style = MaterialTheme.typography.bodyMedium,
                maxLines = if (whole) Int.MAX_VALUE else 3, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clickable { whole = !whole },
            )
        }
        if (d != null && d.cast.isNotEmpty()) {
            var everyone by rememberSaveable(t.id) { mutableStateOf(false) }
            Spacer(Modifier.height(8.dp))
            Text(
                "Starring: ${d.cast.take(3).joinToString(", ")}${if (d.cast.size > 3 && !everyone) "… more" else ""}",
                color = Dx.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clickable { everyone = !everyone },
            )
            // the whole cast: a name finds their other titles
            if (everyone) {
                Spacer(Modifier.height(8.dp))
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    d.cast.take(12).chunked(2).forEach { pair ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            pair.forEach { name -> Pill(selected = false, onClick = { onSearch(name) }) { Text(name, color = Dx.Text, style = MaterialTheme.typography.bodySmall) } }
                        }
                    }
                }
            }
        }
        if (d != null && d.directors.isNotEmpty()) {
            Spacer(Modifier.height(4.dp))
            Text("Director: ${d.directors.joinToString(", ")}", color = Dx.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** An episode's air date ("2025-07-11T00:00:00Z") as "11 Jul 2025": every episode of a season showed the same year */
fun airDate(released: String?): String? {
    val iso = released?.take(10) ?: return null
    // (SimpleDateFormat: java.time needs Android 8, and phones from Android 7 are supported)
    return runCatching {
        val date = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).parse(iso)!!
        java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.getDefault()).format(date)
    }.getOrNull() ?: released.take(4)
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

/** The season picker, with Download season beside it (the episodes out so far that aren't saved yet) */
@Composable
private fun SeasonBar(
    seasons: List<Int>, shown: Int?, videos: List<Video>, saved: (String) -> com.notdxbi.dxbi.tv.Downloads.Item?, busy: String?,
    onPick: (Int) -> Unit, onDownload: (List<String>) -> Unit,
) {
    val out = videos.filter { it.season == shown && !it.upcoming }
    val missing = out.filter { v -> saved(v.id)?.let { it.failed } ?: true }.map { it.id }
    Row(verticalAlignment = Alignment.CenterVertically) {
        SeasonPicker(seasons, shown, onPick)
        Spacer(Modifier.weight(1f))
        if (out.isNotEmpty()) Row(
            Modifier.padding(end = Gutter).clip(RoundedCornerShape(50)).border(1.dp, Dx.Line, RoundedCornerShape(50))
                .clickable(enabled = missing.isNotEmpty() && busy == null) { onDownload(missing) }.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(if (missing.isEmpty()) Icons.Filled.Check else Icons.Filled.Download, contentDescription = null, tint = Dx.Text, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(
                when {
                    busy != null -> busy
                    missing.isEmpty() -> "Season downloaded"
                    missing.size < out.size -> "Download the other ${missing.size}"
                    else -> "Download season"
                },
                color = Dx.Text, style = MaterialTheme.typography.labelMedium, maxLines = 1,
            )
        }
    }
}

/** A film's Download button, under Play: how far it's got, or ✓ once it's saved */
@Composable
private fun FilmDownload(item: com.notdxbi.dxbi.tv.Downloads.Item?, busy: String?, onDownload: () -> Unit) {
    val context = LocalContext.current
    var menu by remember { mutableStateOf(false) }
    Spacer(Modifier.height(8.dp))
    Box {
        Row(
            Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(6.dp)).background(Dx.Raised)
                .clickable(enabled = busy == null) { if (item == null) onDownload() else menu = true },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center,
        ) {
            Icon(if (item?.done == true) Icons.Filled.Check else Icons.Filled.Download, contentDescription = null, tint = Dx.Text)
            Spacer(Modifier.width(6.dp))
            Text(
                when {
                    busy != null -> busy
                    item == null -> "Download"
                    item.done -> "Downloaded"
                    item.failed -> "Download failed: tap for options"
                    item.paused -> "Paused · ${item.percent.toInt()}%"
                    else -> "Downloading ${item.percent.toInt()}%"
                },
                color = Dx.Text, style = MaterialTheme.typography.labelLarge,
            )
        }
        if (item != null) DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            if (item.done) DropdownMenuItem(text = { Text("Play downloaded") }, onClick = { menu = false; com.notdxbi.dxbi.tv.Downloads.play(context, item) })
            if (item.failed) DropdownMenuItem(text = { Text("Try again") }, onClick = { menu = false; com.notdxbi.dxbi.tv.Downloads.retry(context, item) })
            if (!item.done && !item.failed) DropdownMenuItem(text = { Text(if (item.paused) "Resume" else "Pause") }, onClick = {
                menu = false
                if (item.paused) com.notdxbi.dxbi.tv.Downloads.resume(context, item) else com.notdxbi.dxbi.tv.Downloads.pause(context, item)
            })
            DropdownMenuItem(text = { Text(if (item.done) "Delete download" else "Cancel download") }, onClick = { menu = false; com.notdxbi.dxbi.tv.Downloads.remove(context, item) })
        }
    }
}

/** An episode: tap to play it; hold for watched, unwatched, or watched up to here */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Episode(v: Video, resumeHere: Boolean, inProgress: Boolean, onWatched: (watched: Boolean, upTo: Boolean) -> Unit, download: @Composable () -> Unit = {}, onPlay: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().combinedClickable(enabled = !v.upcoming, onLongClick = { menu = true }, onClick = onPlay).padding(horizontal = Gutter, vertical = 8.dp)) {
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
                    resumeHere -> if (inProgress) "Continue watching" else "Up next"
                    v.watched -> "Watched"
                    else -> airDate(v.released)
                }
                note?.let { Text(it, color = if (resumeHere) Dx.Accent else Dx.Muted, style = MaterialTheme.typography.bodySmall) }
            }
            Spacer(Modifier.width(8.dp))
            download()
        }
        v.overview?.let {
            Spacer(Modifier.height(6.dp))
            Text(it, color = Dx.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
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

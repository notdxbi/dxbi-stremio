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
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.notdxbi.dxbi.tv.phone.Airing
import com.notdxbi.dxbi.tv.phone.Continue
import com.notdxbi.dxbi.tv.phone.Load
import com.notdxbi.dxbi.tv.phone.Stremio
import com.notdxbi.dxbi.tv.phone.Title
import kotlinx.coroutines.delay

/** What Home shows: everything, films only or series only */
enum class HomeFilter(val label: String) { All("Home"), Movies("Films"), Series("Series") }

@Composable
fun HomeScreen(
    stremio: Stremio,
    onOpen: (Title) -> Unit,
    onPlay: (Title) -> Unit,
    onResume: (Continue) -> Unit,
    onSearch: () -> Unit,
    onSeeAll: (String) -> Unit,
    onCategories: (String) -> Unit,
) {
    val rows by stremio.rows.collectAsState()
    val continueWatching by stremio.continueWatching.collectAsState()
    val billboard by stremio.billboard.collectAsState()
    val myList by stremio.myList.collectAsState()
    val forYou by stremio.forYou.collectAsState()
    val airing by stremio.airing.collectAsState()
    var filter by rememberSaveable { mutableStateOf(HomeFilter.All) }
    val list = rememberLazyListState()
    // the top bar darkens once Home scrolls under it
    val scrolled by remember { derivedStateOf { list.firstVisibleItemIndex > 0 || list.firstVisibleItemScrollOffset > 40 } }
    // the chips step aside while Home scrolls down and come back on the way up, as on Netflix: more
    // of the rows on screen
    var chips by remember { mutableStateOf(true) }
    LaunchedEffect(list) {
        var lastIndex = 0
        var lastOffset = 0
        androidx.compose.runtime.snapshotFlow { list.firstVisibleItemIndex to list.firstVisibleItemScrollOffset }.collect { (i, o) ->
            val moved = i != lastIndex || kotlin.math.abs(o - lastOffset) > 24
            if (i == 0 && o < 40) chips = true
            else if (moved) chips = i < lastIndex || (i == lastIndex && o < lastOffset)
            if (moved) { lastIndex = i; lastOffset = o }
        }
    }

    fun fits(type: String) = when (filter) {
        HomeFilter.All -> true
        HomeFilter.Movies -> type == "movie"
        HomeFilter.Series -> type == "series"
    }

    Box(Modifier.fillMaxSize().background(Dx.Background)) {
        LazyColumn(state = list, contentPadding = PaddingValues(bottom = 24.dp + LocalBarSpace.current)) {
            item { Spacer(Modifier.windowInsetsPadding(WindowInsets.safeDrawing).height(112.dp)) }

            val slides = billboard.filter { fits(it.type) }
            item(key = "billboard") {
                if (slides.isNotEmpty()) Billboard(slides, onOpen, onPlay)
                else Box(Modifier.padding(horizontal = Gutter).fillMaxWidth().aspectRatio(billboardShape()).clip(RoundedCornerShape(12.dp)).shimmer())
                Spacer(Modifier.height(20.dp))
            }

            val resume = continueWatching.filter { fits(it.title.type) }
            if (resume.isNotEmpty()) item(key = "continue") {
                ContinueRow(resume, onOpen = { onOpen(it.title) }, onResume = onResume, onRemove = { stremio.removeFromContinue(it.title.id) })
            }

            if (filter == HomeFilter.All && airing.isNotEmpty()) item(key = "airing") { AiringRow(airing) { onOpen(Title(it.id, "series", it.name)) } }

            myList.forEach { row ->
                val items = row.items.filter { fits(it.type) }
                if (items.isNotEmpty()) item(key = "list:${row.name}") { PosterRow(row.name, items, onOpen = onOpen) }
            }
            forYou?.let { row ->
                val items = row.items.filter { fits(it.type) }
                if (items.isNotEmpty()) item(key = "foryou") { PosterRow(row.name, items, onOpen = onOpen) }
            }

            val catalogs = rows.filter { fits(it.type) && it.state != Load.Err && (it.type == "movie" || it.type == "series" || it.items.isNotEmpty()) }
            if (catalogs.isEmpty()) items(3) { PosterRow("", emptyList(), loading = true, onOpen = {}) }
            items(catalogs, key = { "row:${it.key}:${it.index}" }) { row ->
                if (row.state == Load.Ready && row.items.isEmpty()) return@items
                PosterRow(
                    title = if (filter == HomeFilter.All) row.name + typeSuffix(row.type, catalogs.count { it.name == row.name } > 1) else row.name,
                    items = row.items,
                    loading = row.state != Load.Ready,
                    onMore = row.discover?.let { link -> { onSeeAll(link) } },
                    onOpen = onOpen,
                )
            }
        }

        var party by rememberSaveable { mutableStateOf(false) }
        if (party) PartySheet(stremio) { party = false }
        TopBar(scrolled, chips || filter != HomeFilter.All, filter, onFilter = { filter = it }, onSearch = onSearch, onParty = { party = true }, onCategories = {
            onCategories(if (filter == HomeFilter.Series) "series" else "movie")
        })
    }
}

/** Stremio has a "Popular" row for films and one for series: say which */
private fun typeSuffix(type: String, ambiguous: Boolean) = if (!ambiguous) "" else when (type) {
    "movie" -> " Films"
    "series" -> " Series"
    else -> ""
}

@Composable
private fun TopBar(
    scrolled: Boolean,
    chips: Boolean,
    filter: HomeFilter,
    onFilter: (HomeFilter) -> Unit,
    onSearch: () -> Unit,
    onParty: () -> Unit,
    onCategories: () -> Unit,
) {
    val shade = if (scrolled) Brush.verticalGradient(listOf(Color.Black, Color.Black.copy(alpha = 0.97f)))
    else Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.85f), Color.Transparent))
    Column(Modifier.fillMaxWidth().background(shade).windowInsetsPadding(WindowInsets.safeDrawing).padding(bottom = 10.dp)) {
        Row(Modifier.fillMaxWidth().height(56.dp).padding(start = Gutter, end = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) {
                if (filter == HomeFilter.All) Logo()
                else Text(filter.label, color = Dx.Text, fontWeight = FontWeight.Black, fontSize = 24.sp, modifier = Modifier.clickable { onFilter(HomeFilter.All) })
            }
            IconButton(onClick = onParty) { Icon(Icons.Filled.Groups, contentDescription = "Watch party", tint = Dx.Text) }
            CastButton()
            IconButton(onClick = onSearch) { Icon(Icons.Filled.Search, contentDescription = "Search", tint = Dx.Text) }
        }
        androidx.compose.animation.AnimatedVisibility(
            visible = chips,
            enter = androidx.compose.animation.expandVertically() + androidx.compose.animation.fadeIn(),
            exit = androidx.compose.animation.shrinkVertically() + androidx.compose.animation.fadeOut(),
        ) {
        Row(Modifier.padding(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (filter != HomeFilter.All) {
                Pill(selected = false, onClick = { onFilter(HomeFilter.All) }) { Icon(Icons.Filled.Close, contentDescription = "All", tint = Dx.Text, modifier = Modifier.size(18.dp)) }
            }
            for (f in listOf(HomeFilter.Series, HomeFilter.Movies)) {
                if (filter == HomeFilter.All || filter == f) Pill(selected = filter == f, onClick = { onFilter(if (filter == f) HomeFilter.All else f) }) { Text(f.label, color = Dx.Text, style = MaterialTheme.typography.labelMedium) }
            }
            Pill(selected = false, onClick = onCategories) {
                Text("Categories", color = Dx.Text, style = MaterialTheme.typography.labelMedium)
                Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = Dx.Text, modifier = Modifier.size(18.dp))
            }
        }
        }
    }
}

@Composable
fun Pill(selected: Boolean, onClick: () -> Unit, content: @Composable () -> Unit) {
    Row(
        Modifier
            .height(34.dp)
            .clip(CircleShape)
            .background(if (selected) Color.White.copy(alpha = 0.18f) else Color.Transparent)
            .border(1.dp, Color.White.copy(alpha = if (selected) 0f else 0.55f), CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) { content() }
}

@Composable
private fun Billboard(slides: List<Title>, onOpen: (Title) -> Unit, onPlay: (Title) -> Unit) {
    val pager = rememberPagerState { slides.size }
    val wide = billboardShape() > 1f
    // turns by itself, like the big screen's billboard
    LaunchedEffect(slides.size) {
        while (slides.size > 1) {
            delay(8000)
            pager.animateScrollToPage((pager.currentPage + 1) % slides.size)
        }
    }
    Column {
        HorizontalPager(pager, contentPadding = PaddingValues(horizontal = Gutter), pageSpacing = 10.dp) { page ->
            val t = slides[page]
            Box(
                Modifier.fillMaxWidth().aspectRatio(billboardShape()).clip(RoundedCornerShape(12.dp)).background(Dx.Raised)
                    .border(1.dp, Color.White.copy(alpha = 0.12f), RoundedCornerShape(12.dp))
                    .clickable { onOpen(t) },
            ) {
                AsyncImage(model = t.backdrop, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                Box(Modifier.fillMaxSize().background(if (wide) Brush.horizontalGradient(0f to Color.Black.copy(alpha = 0.85f), 0.6f to Color.Transparent) else bottomScrim(0.95f)))
                Column(
                    Modifier.align(if (wide) Alignment.BottomStart else Alignment.BottomCenter).fillMaxWidth(if (wide) 0.45f else 1f).padding(16.dp),
                    horizontalAlignment = if (wide) Alignment.Start else Alignment.CenterHorizontally,
                ) {
                    TitleArt(t, Modifier.fillMaxWidth(if (wide) 1f else 0.78f).heightIn(max = 96.dp))
                    Spacer(Modifier.height(10.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        t.genres.take(3).forEachIndexed { i, g ->
                            if (i > 0) Dot()
                            Text(g, color = Dx.Text, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    Spacer(Modifier.height(14.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = { onPlay(t) },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Color.Black),
                            shape = RoundedCornerShape(6.dp),
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Filled.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text("Play", style = MaterialTheme.typography.labelLarge)
                        }
                        Button(
                            onClick = { onOpen(t) },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.White.copy(alpha = 0.22f), contentColor = Color.White),
                            shape = RoundedCornerShape(6.dp),
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Outlined.Info, contentDescription = null)
                            Spacer(Modifier.width(6.dp))
                            Text("More Info", style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
            }
        }
        if (slides.size > 1) Row(Modifier.fillMaxWidth().padding(top = 10.dp), horizontalArrangement = Arrangement.Center) {
            repeat(slides.size) { i ->
                Box(Modifier.padding(horizontal = 3.dp).size(width = if (i == pager.currentPage) 18.dp else 6.dp, height = 4.dp).clip(CircleShape)
                    .background(if (i == pager.currentPage) Dx.Text else Dx.Faint))
            }
        }
    }
}

/** A title's logo, or its name set large when it has none or it won't load ([textSize] 0: nothing instead) */
@Composable
fun TitleArt(t: Title, modifier: Modifier, textSize: Int = 30, start: Boolean = false) {
    var failed by remember(t.logo) { mutableStateOf(t.logo == null) }
    if (!failed) {
        AsyncImage(model = t.logo, contentDescription = t.name, contentScale = ContentScale.Fit, alignment = if (start) Alignment.CenterStart else Alignment.Center, onError = { failed = true }, modifier = modifier)
    } else if (textSize > 0) {
        Text(t.name, color = Dx.Text, fontWeight = FontWeight.Black, fontSize = textSize.sp, lineHeight = (textSize + 4).sp, textAlign = if (start) TextAlign.Start else TextAlign.Center, maxLines = 3, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
private fun ContinueRow(items: List<Continue>, onOpen: (Continue) -> Unit, onResume: (Continue) -> Unit, onRemove: (Continue) -> Unit) {
    Column(Modifier.padding(bottom = 16.dp)) {
        RowHeader("Continue Watching")
        LazyRow(contentPadding = PaddingValues(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(items, key = { it.title.id }) { c ->
                var menu by remember { mutableStateOf(false) }
                Column(Modifier.width(PosterWidth).clip(RoundedCornerShape(6.dp)).background(Dx.Surface)) {
                    Box(Modifier.fillMaxWidth().aspectRatio(2f / 3f).clickable { onResume(c) }) {
                        Art(c.title.art, c.title.name, Modifier.fillMaxSize(), RoundedCornerShape(0.dp))
                        // a play button over the art, as Netflix does
                        Box(Modifier.align(Alignment.Center).size(44.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.55f)).border(1.5.dp, Color.White, CircleShape), contentAlignment = Alignment.Center) {
                            Icon(Icons.Filled.PlayArrow, contentDescription = "Resume", tint = Color.White, modifier = Modifier.size(28.dp))
                        }
                        if (c.newEpisodes > 0) Text(
                            "NEW",
                            color = Color.White,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.align(Alignment.TopStart).padding(6.dp).clip(RoundedCornerShape(3.dp)).background(Dx.Accent).padding(horizontal = 5.dp, vertical = 2.dp),
                        )
                    }
                    ProgressLine(c.progress, Modifier.fillMaxWidth())
                    Row(Modifier.fillMaxWidth().height(36.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { onOpen(c) }, modifier = Modifier.weight(1f)) { Icon(Icons.Filled.Info, contentDescription = "Details", tint = Dx.Muted, modifier = Modifier.size(20.dp)) }
                        Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                            IconButton(onClick = { menu = true }) { Text("⋮", color = Dx.Muted, fontSize = 20.sp, fontWeight = FontWeight.Bold) }
                            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                DropdownMenuItem(text = { Text("Details") }, onClick = { menu = false; onOpen(c) })
                                DropdownMenuItem(text = { Text("Remove from row") }, onClick = { menu = false; onRemove(c) })
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AiringRow(items: List<Airing>, onOpen: (Airing) -> Unit) {
    Column(Modifier.padding(bottom = 16.dp)) {
        RowHeader("Airing This Week")
        LazyRow(contentPadding = PaddingValues(horizontal = Gutter), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(items, key = { it.id }) { a ->
                Column(Modifier.width(240.dp).clickable { onOpen(a) }) {
                    Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f)) {
                        Art(a.still ?: a.background, a.name, Modifier.fillMaxSize())
                        Box(Modifier.fillMaxSize().clip(RoundedCornerShape(6.dp)).background(bottomScrim()))
                        if (a.out) Text(
                            "NEW EPISODE",
                            color = Color.White,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(6.dp).clip(RoundedCornerShape(3.dp)).background(Dx.Accent).padding(horizontal = 5.dp, vertical = 2.dp),
                        )
                        Text(a.name, color = Color.White, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.align(Alignment.BottomStart).padding(8.dp))
                    }
                    Spacer(Modifier.height(6.dp))
                    Text("S${a.season} · E${a.episode}${if (a.title.isNotEmpty()) " · ${a.title}" else ""}", color = Dx.Text, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${a.whenText} · ${a.countdown}", color = Dx.Muted, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                }
            }
        }
    }
}

/** The billboard's shape: a tall card upright, a wide cinema shape on a phone held sideways */
@Composable
private fun billboardShape(): Float {
    val config = androidx.compose.ui.platform.LocalConfiguration.current
    return if (config.screenWidthDp > config.screenHeightDp) 3.2f else 0.78f
}

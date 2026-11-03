package com.notdxbi.dxbi.tv.phone.ui

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.notdxbi.dxbi.tv.phone.Load
import com.notdxbi.dxbi.tv.phone.Stremio
import com.notdxbi.dxbi.tv.phone.Title
import kotlinx.coroutines.delay

@Composable
fun SearchScreen(stremio: Stremio, initial: String, focus: Boolean, onOpen: (Title) -> Unit) {
    var query by rememberSaveable { mutableStateOf(initial) }
    val results by stremio.search.collectAsState()
    val keyboard = LocalSoftwareKeyboardController.current
    val focuser = remember { FocusRequester() }

    LaunchedEffect(Unit) { if (focus && initial.isEmpty()) runCatching { focuser.requestFocus() } }
    LaunchedEffect(query) {
        if (query.trim().length < 2) return@LaunchedEffect
        delay(350)
        stremio.search(query.trim())
    }

    Column(Modifier.fillMaxSize().background(Dx.Background).windowInsetsPadding(WindowInsets.safeDrawing)) {
        Row(
            Modifier.padding(Gutter, 10.dp).fillMaxWidth().height(46.dp).clip(RoundedCornerShape(6.dp)).background(Dx.Raised).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Search, contentDescription = null, tint = Dx.Muted)
            Spacer(Modifier.width(10.dp))
            Box(Modifier.weight(1f)) {
                if (query.isEmpty()) Text("Search films, series, people", color = Dx.Faint, style = MaterialTheme.typography.bodyLarge)
                BasicTextField(
                    value = query,
                    onValueChange = { query = it },
                    singleLine = true,
                    textStyle = MaterialTheme.typography.bodyLarge.copy(color = Dx.Text),
                    cursorBrush = SolidColor(Dx.Accent),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { keyboard?.hide() }),
                    modifier = Modifier.fillMaxWidth().focusRequester(focuser),
                )
            }
            if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Filled.Close, contentDescription = "Clear", tint = Dx.Muted) }
        }

        if (query.trim().length < 2) {
            SearchHints()
        } else {
            // the best of each row first (films, series…), rather than every film before any series
            val found = (0 until (results.maxOfOrNull { it.items.size } ?: 0))
                .flatMap { i -> results.mapNotNull { it.items.getOrNull(i) } }
                .distinctBy { "${it.type}:${it.id}" }
            val searching = results.isEmpty() || results.any { it.state == Load.Loading || it.state == Load.None }
            if (found.isEmpty() && !searching) {
                Text("Nothing found for \"$query\".", color = Dx.Muted, modifier = Modifier.padding(Gutter))
            } else {
                PosterGrid(found, loading = searching, header = "Films & Series", onOpen = onOpen)
            }
        }
    }
}

/** Nothing typed yet: what Search finds, as Stremio's desktop app says it */
@Composable
private fun SearchHints() {
    Column(Modifier.fillMaxWidth().padding(horizontal = Gutter, vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("You can search anything…", color = Dx.Muted, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(32.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            listOf(
                Icons.Filled.Movie to "Movies, series & anime",
                Icons.Filled.Person to "Actors, directors & writers",
                Icons.Filled.LiveTv to "Channels & TV from your addons",
            ).forEach { (icon, label) ->
                Column(Modifier.width(104.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(icon, contentDescription = null, tint = Dx.Muted, modifier = Modifier.size(40.dp))
                    Spacer(Modifier.height(12.dp))
                    Text(label, color = Dx.Muted, style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
                }
            }
        }
    }
}

/** Posters three to a row, with more fetched as the end comes near */
@Composable
fun PosterGrid(items: List<Title>, loading: Boolean, header: String? = null, onEnd: (() -> Unit)? = null, onOpen: (Title) -> Unit) {
    val grid = rememberLazyGridState()
    val nearEnd by remember { derivedStateOf { grid.layoutInfo.visibleItemsInfo.lastOrNull()?.index?.let { it >= grid.layoutInfo.totalItemsCount - 6 } == true } }
    LaunchedEffect(nearEnd, items.size) { if (nearEnd && onEnd != null && items.isNotEmpty()) onEnd() }
    LazyVerticalGrid(
        state = grid,
        columns = GridCells.Adaptive(104.dp),
        contentPadding = PaddingValues(Gutter, 4.dp, Gutter, 24.dp + LocalBarSpace.current),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        header?.let { item(span = { GridItemSpan(maxLineSpan) }) { Text(it, style = MaterialTheme.typography.titleMedium, color = Dx.Text, modifier = Modifier.padding(vertical = 6.dp)) } }
        items(items, key = { "${it.type}:${it.id}" }) { t ->
            Art(t.art, t.name, Modifier.fillMaxWidth().aspectRatio(2f / 3f).clickable { onOpen(t) })
        }
        if (loading) item(span = { GridItemSpan(maxLineSpan) }) {
            Box(Modifier.fillMaxWidth().padding(20.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Dx.Accent, modifier = Modifier.size(24.dp), strokeWidth = 2.dp) }
        }
    }
}

/**
 * Discover, as in Stremio: any addon's catalog, by type and genre. Also what a Home row's See All
 * and Categories open (then with Back, and [title] for the row).
 */
@Composable
fun DiscoverScreen(stremio: Stremio, title: String, onBack: (() -> Unit)?, onOpen: (Title) -> Unit) {
    val discover by stremio.discover.collectAsState()
    val d = discover
    Column(Modifier.fillMaxSize().background(Dx.Background).windowInsetsPadding(WindowInsets.safeDrawing)) {
        ScreenTitle(title, onBack)
        if (d != null) LazyRow(contentPadding = PaddingValues(horizontal = Gutter, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            val types = d.types.filter { it.link != null }
            if (types.size > 1) item {
                PickMenu(types.firstOrNull { it.selected }?.name?.let(::typeLabel) ?: "Type", types.map { typeLabel(it.name) to it.link!! }) { stremio.discover(it) }
            }
            val catalogs = d.catalogs.filter { it.link != null }
            if (catalogs.size > 1) item {
                PickMenu(catalogs.firstOrNull { it.selected }?.name ?: "Catalog", catalogs.map { it.name to it.link!! }) { stremio.discover(it) }
            }
            if (d.genres.isNotEmpty()) item {
                PickMenu(d.genre ?: "All genres", listOf("All genres" to "") + d.genres.map { it to it }) { stremio.discoverGenre(it.ifEmpty { null }) }
            }
        }
        Spacer(Modifier.height(6.dp))
        PosterGrid(
            d?.items.orEmpty(),
            loading = d == null || d.state == Load.Loading,
            onEnd = { if (d?.nextPage == true && d.state == Load.Ready) stremio.discoverMore() },
            onOpen = onOpen,
        )
    }
}

private fun typeLabel(type: String) = when (type) {
    "movie" -> "Films"
    "series" -> "Series"
    "tv" -> "TV"
    "channel" -> "Channels"
    else -> type.replaceFirstChar { it.uppercase() }
}

/** A pill that opens a list to pick from */
@Composable
private fun PickMenu(label: String, options: List<Pair<String, String>>, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Pill(selected = true, onClick = { open = true }) {
            Text(label, color = Dx.Text, style = MaterialTheme.typography.labelMedium, maxLines = 1)
            Icon(Icons.Filled.KeyboardArrowDown, contentDescription = null, tint = Dx.Text, modifier = Modifier.size(18.dp))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }, modifier = if (options.size > 8) Modifier.height(420.dp) else Modifier) {
            options.forEach { (text, value) -> DropdownMenuItem(text = { Text(text) }, onClick = { open = false; onPick(value) }) }
        }
    }
}

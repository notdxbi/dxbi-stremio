package com.notdxbi.dxbi.tv.phone

import android.net.Uri
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Extension
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.outlined.Extension
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Explore
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.notdxbi.dxbi.tv.phone.ui.AddonsScreen
import com.notdxbi.dxbi.tv.phone.ui.CustomiseHomeScreen
import com.notdxbi.dxbi.tv.phone.ui.DetailScreen
import com.notdxbi.dxbi.tv.phone.ui.DiscoverScreen
import com.notdxbi.dxbi.tv.phone.ui.Dx
import com.notdxbi.dxbi.tv.phone.ui.DxTheme
import com.notdxbi.dxbi.tv.phone.ui.HomeScreen
import com.notdxbi.dxbi.tv.phone.ui.LibraryScreen
import com.notdxbi.dxbi.tv.phone.ui.LocalBarSpace
import com.notdxbi.dxbi.tv.phone.ui.Logo
import com.notdxbi.dxbi.tv.phone.ui.PlaybackSettingsScreen
import com.notdxbi.dxbi.tv.phone.ui.ProfileScreen
import com.notdxbi.dxbi.tv.phone.ui.SearchScreen
import com.notdxbi.dxbi.tv.phone.ui.SettingsScreen
import com.notdxbi.dxbi.tv.phone.ui.SignInScreen
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.HazeStyle
import dev.chrisbanes.haze.HazeTint
import dev.chrisbanes.haze.haze
import dev.chrisbanes.haze.hazeChild

private enum class Tab(val route: String, val label: String, val on: ImageVector, val off: ImageVector) {
    Home("home", "Home", Icons.Filled.Home, Icons.Outlined.Home),
    Discover("discover", "Discover", Icons.Filled.Explore, Icons.Outlined.Explore),
    Search("search", "Search", Icons.Filled.Search, Icons.Outlined.Search),
    Addons("addons", "Addons", Icons.Filled.Extension, Icons.Outlined.Extension),
    Profile("profile", "Profile", Icons.Filled.Person, Icons.Outlined.Person),
}

/** How much of the screen's bottom the tab bar covers (screens leave this much room) */
private val BarSpace = 96.dp

private const val CINEMETA = "https://v3-cinemeta.strem.io/manifest.json"

/**
 * dx.bi on a phone: native screens over Stremio's page, which keeps doing Stremio's work underneath
 * ([Engine]). Every screen is native: the page itself is never shown.
 */
@Composable
fun PhoneApp(engine: Engine) {
    val context = LocalContext.current
    // (Stremio's state is read and turned into screens' data off the main thread, so scrolling never waits for it)
    val scope = rememberCoroutineScope { kotlinx.coroutines.Dispatchers.Default }
    val stremio = remember { Stremio(context.applicationContext, engine, scope) }
    DxTheme {
        val account by stremio.account.collectAsState()
        val ready by stremio.ready.collectAsState()
        val guest by stremio.guest.collectAsState()
        val a = account
        when {
            a == null && !ready -> Starting()
            a != null && !a.signedIn && !guest -> SignInScreen(stremio)
            else -> Screens(stremio)
        }
    }
}

@Composable
private fun Starting() {
    Box(Modifier.fillMaxSize().background(Dx.Background), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Logo(64.sp)
            Spacer(Modifier.height(24.dp))
            CircularProgressIndicator(color = Dx.Accent, modifier = Modifier.size(28.dp), strokeWidth = 2.dp)
        }
    }
}

/** Titles handed from one screen to the next, so details can show the art while it loads */
private val previews = mutableMapOf<String, Title>()

private fun NavHostController.openTitle(t: Title, play: Boolean = false) {
    previews["${t.type}:${t.id}"] = t
    navigate("title/${Uri.encode(t.type)}/${Uri.encode(t.id)}?play=$play")
}

private fun NavHostController.switchTo(tab: Tab, route: String = tab.route) {
    navigate(route) {
        popUpTo(graph.findStartDestination().id) { saveState = true }
        launchSingleTop = true
        restoreState = route == tab.route
    }
}

@Composable
private fun Screens(stremio: Stremio) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route.orEmpty()
    val tab = Tab.entries.firstOrNull { route.substringBefore('?') == it.route }
    val haze = remember { HazeState() }
    val config = LocalConfiguration.current
    // on its side, the tabs go down the left: the screen's height is too precious for a bar
    val sideways = config.screenWidthDp > config.screenHeightDp

    Row(Modifier.fillMaxSize().background(Dx.Background)) {
    if (tab != null && sideways) TabRail(tab) { nav.switchTo(it) }
    Box(Modifier.weight(1f).fillMaxHeight()) {
        CompositionLocalProvider(LocalBarSpace provides if (tab != null && !sideways) BarSpace else 0.dp) {
            NavHost(
                nav,
                startDestination = Tab.Home.route,
                modifier = Modifier.fillMaxSize().haze(haze),
                // tabs cross-fade; a title slides in over where it was opened from, and back out
                enterTransition = {
                    if (targetState.destination.route.orEmpty().startsWith("title/")) slideInHorizontally(tween(260)) { it / 5 } + fadeIn(tween(260))
                    else fadeIn(tween(200))
                },
                exitTransition = { fadeOut(tween(140)) },
                popEnterTransition = { fadeIn(tween(200)) },
                popExitTransition = {
                    if (initialState.destination.route.orEmpty().startsWith("title/")) slideOutHorizontally(tween(220)) { it / 5 } + fadeOut(tween(220))
                    else fadeOut(tween(140))
                },
            ) {
                composable(Tab.Home.route) {
                    HomeScreen(
                        stremio,
                        onOpen = { nav.openTitle(it) },
                        onPlay = { nav.openTitle(it, play = true) },
                        onResume = { nav.openTitle(it.title, play = true) },
                        onSearch = { nav.switchTo(Tab.Search, "search?focus=true") },
                        onSeeAll = { link -> nav.navigate("browse?link=${Uri.encode(link)}") },
                        onCategories = { type -> nav.navigate("browse?type=$type") },
                    )
                }
                composable(Tab.Discover.route) {
                    // Popular films to start with (the model is there, empty, before anything is chosen)
                    LaunchedEffect(Unit) { if (stremio.discover.value?.request == null) stremio.discover(CINEMETA, "movie", "top") }
                    DiscoverScreen(stremio, "Discover", onBack = null, onOpen = { nav.openTitle(it) })
                }
                composable(
                    "search?q={q}&focus={focus}",
                    arguments = listOf(navArgument("q") { defaultValue = "" }, navArgument("focus") { type = NavType.BoolType; defaultValue = false }),
                ) { e ->
                    SearchScreen(
                        stremio,
                        initial = e.arguments?.getString("q").orEmpty(),
                        focus = e.arguments?.getBoolean("focus") == true,
                        onOpen = { nav.openTitle(it) },
                    )
                }
                composable(Tab.Addons.route) { AddonsScreen(stremio) }
                composable(Tab.Profile.route) {
                    ProfileScreen(
                        stremio,
                        onOpen = { nav.openTitle(it) },
                        onLibrary = { nav.navigate("library") },
                        onDownloads = { nav.navigate("downloads") },
                        onCustomiseHome = { nav.navigate("customise") },
                        onSettings = { nav.navigate("settings") },
                        onStremioSettings = { nav.navigate("playback") },
                        onStats = { nav.navigate("stats") },
                    )
                }
                composable(
                    "title/{type}/{id}?play={play}",
                    arguments = listOf(navArgument("type") {}, navArgument("id") {}, navArgument("play") { type = NavType.BoolType; defaultValue = false }),
                ) { e ->
                    val type = e.arguments?.getString("type").orEmpty()
                    val id = e.arguments?.getString("id").orEmpty()
                    DetailScreen(
                        stremio,
                        type = type,
                        id = id,
                        preview = previews["$type:$id"],
                        play = e.arguments?.getBoolean("play") == true,
                        onBack = { nav.popBackStack() },
                        onSearch = { name -> nav.navigate("search?q=${Uri.encode(name)}") },
                    )
                }
                // (not "discover?…": that would also match the Discover tab's own "discover")
                composable(
                    "browse?link={link}&type={type}",
                    arguments = listOf(navArgument("link") { defaultValue = "" }, navArgument("type") { defaultValue = "" }),
                ) { e ->
                    val link = e.arguments?.getString("link").orEmpty()
                    val type = e.arguments?.getString("type").orEmpty()
                    val rows by stremio.rows.collectAsState()
                    LaunchedEffect(link, type) {
                        if (link.isNotEmpty()) stremio.discover(link)
                        else stremio.discover(CINEMETA, type.ifEmpty { "movie" }, "top")
                    }
                    val title = rows.firstOrNull { it.discover == link }?.name
                        ?: if (type == "series") "Series" else if (type.isNotEmpty()) "Films" else "Browse"
                    DiscoverScreen(stremio, title, onBack = { nav.popBackStack() }, onOpen = { nav.openTitle(it) })
                }
                composable("downloads") { com.notdxbi.dxbi.tv.phone.ui.DownloadsScreen(onBack = { nav.popBackStack() }) }
                composable("library") { LibraryScreen(stremio, onBack = { nav.popBackStack() }, onOpen = { nav.openTitle(it) }) }
                composable("customise") { CustomiseHomeScreen(stremio, onBack = { nav.popBackStack() }) }
                composable("settings") { SettingsScreen(stremio, onBack = { nav.popBackStack() }) }
                composable("playback") { PlaybackSettingsScreen(stremio, onBack = { nav.popBackStack() }) }
                composable("stats") { com.notdxbi.dxbi.tv.phone.ui.StatsScreen(stremio, onBack = { nav.popBackStack() }) }
            }
        }

        if (tab != null && !sideways) TabBar(tab, haze, Modifier.align(Alignment.BottomCenter)) { nav.switchTo(it) }
    }
    }
}

/**
 * The tab bar, the way Stremio's phone app has it: a frosted panel over the screen, outline icons, and
 * the chosen tab's icon filled in the accent colour. It runs edge to edge into the bottom of the
 * screen, rounded only at the top: a display's own rounded corners would cut into a floating bar's.
 */
@Composable
private fun TabBar(current: Tab, haze: HazeState, modifier: Modifier, onSelect: (Tab) -> Unit) {
    val shape = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp)
    Row(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .hazeChild(haze, style = HazeStyle(backgroundColor = Dx.Background, tint = HazeTint(Color(0xB3141418)), blurRadius = 24.dp, noiseFactor = 0f))
            .border(1.dp, Color.White.copy(alpha = 0.08f), shape)
            .padding(horizontal = 6.dp)
            .windowInsetsPadding(WindowInsets.navigationBars)
            .padding(top = 8.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Tab.entries.forEach { t ->
            val on = t == current
            Column(
                Modifier.weight(1f).clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { onSelect(t) }.padding(vertical = 4.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(if (on) t.on else t.off, contentDescription = t.label, tint = if (on) Dx.Accent else Dx.Muted, modifier = Modifier.size(26.dp))
                Spacer(Modifier.height(3.dp))
                Text(
                    t.label,
                    color = if (on) Dx.Text else Dx.Muted,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = if (on) FontWeight.Bold else FontWeight.Medium,
                    maxLines = 1,
                )
            }
        }
    }
}

/** The tabs down the left side, for a phone on its side */
@Composable
private fun TabRail(current: Tab, onSelect: (Tab) -> Unit) {
    Column(
        Modifier.fillMaxHeight().width(84.dp).background(Dx.Surface).windowInsetsPadding(WindowInsets.safeDrawing),
        verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Tab.entries.forEach { t ->
            val on = t == current
            Column(
                Modifier.fillMaxWidth().clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { onSelect(t) }.padding(vertical = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(if (on) t.on else t.off, contentDescription = t.label, tint = if (on) Dx.Accent else Dx.Muted, modifier = Modifier.size(26.dp))
                Spacer(Modifier.height(3.dp))
                Text(t.label, color = if (on) Dx.Text else Dx.Muted, style = MaterialTheme.typography.labelSmall, fontWeight = if (on) FontWeight.Bold else FontWeight.Medium, maxLines = 1)
            }
        }
    }
}

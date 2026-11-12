package com.notdxbi.dxbi.tv.phone

import android.content.Context
import com.notdxbi.dxbi.tv.Cast
import com.notdxbi.dxbi.tv.Phone
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject

/**
 * Stremio as the phone app's screens see it: what to show (kept current, and remembered between
 * launches so the app opens on the last Home it showed) and what they can do. All of it through [Engine].
 */
class Stremio(context: Context, val engine: Engine, private val scope: CoroutineScope) {

    private val app = context.applicationContext

    private val cache = context.getSharedPreferences("phone-cache", Context.MODE_PRIVATE)

    // The last of each, from this launch or the one before
    private fun remembered(field: String): StateFlow<JSONObject?> {
        val saved = cache.getString(field, null)?.let { runCatching { JSONObject(it) }.getOrNull() }
        val flow = MutableStateFlow(saved)
        scope.launch {
            engine.state(field).collect { live ->
                if (live == null) return@collect
                flow.value = live
                cache.edit().putString(field, live.toString()).apply()
            }
        }
        return flow
    }

    private val ctxState = remembered("ctx")
    private val boardState = remembered("board")
    private val continueState = remembered("continue_watching_preview")

    val ready: StateFlow<Boolean> = engine.ready
    val account: StateFlow<Account?> = ctxState.map(Account::from).stateIn(scope, SharingStarted.Eagerly, Account.from(ctxState.value))
    val continueWatching: StateFlow<List<Continue>> = continueState.map { Continue.list(it).orEmpty() }.stateIn(scope, SharingStarted.Eagerly, Continue.list(continueState.value).orEmpty())

    // dx.bi's own Home pieces, asked for from the plugin and remembered the same way
    private companion object {
        /** Where the page waits, out of sight: a screen Stremio has nothing on */
        const val PARKED = "#/dxbi"
    }

    private fun saved(key: String) = cache.getString(key, null)?.let { runCatching { JSONArray(it) }.getOrNull() }
    val billboard = MutableStateFlow(saved("x.billboard").objects().map(Title::from))
    val myList = MutableStateFlow(saved("x.myList").objects().map { ListRow(it.optString("name"), it.optJSONArray("items").objects().map(Title::from)) })
    val forYou = MutableStateFlow<ListRow?>(saved("x.forYou").objects().firstOrNull()?.let { ListRow(it.optString("name"), it.optJSONArray("items").objects().map(Title::from)) })
    val airing = MutableStateFlow(saved("x.airing").objects().map(Airing::from))
    val layout = MutableStateFlow(HomeLayout.from(cache.getString("x.layout", null)?.let { runCatching { JSONObject(it) }.getOrNull() }))
    val viewers = MutableStateFlow<List<Viewer>>(emptyList())
    val viewer = MutableStateFlow<Viewer?>(null)

    /** Home's catalog rows, in the viewer's order */
    val rows: StateFlow<List<Row>> = combine(boardState, layout) { board, layout -> layout.arrange(Row.list(board).orEmpty()) }
        .stateIn(scope, SharingStarted.Eagerly, layout.value.arrange(Row.list(boardState.value).orEmpty()))

    /** Every catalog Home could show, before the viewer's order and hiding (for Customise Home) */
    val allRows: StateFlow<List<Row>> = boardState.map { Row.list(it).orEmpty() }.stateIn(scope, SharingStarted.Eagerly, Row.list(boardState.value).orEmpty())

    /** Stremio's own settings (ctx.profile.settings): languages, subtitles, streaming server… */
    val profileSettings: StateFlow<JSONObject> = ctxState.map { it?.optJSONObject("settings") ?: JSONObject() }
        .stateIn(scope, SharingStarted.Eagerly, ctxState.value?.optJSONObject("settings") ?: JSONObject())

    val installedAddons: StateFlow<List<Addon>> = engine.state("installed_addons").map { it?.optJSONArray("items").objects().map(Addon::from) }
        .map { it.orEmpty() }.stateIn(scope, SharingStarted.Eagerly, emptyList())
    val remoteAddons: StateFlow<JSONObject?> = engine.state("remote_addons")
    val library: StateFlow<List<Title>> = engine.state("library").map { it?.optJSONArray("items").objects().map(Title::from) }
        .map { it.orEmpty() }.stateIn(scope, SharingStarted.Eagerly, emptyList())
    val streamingServer: StateFlow<JSONObject?> = engine.state("streaming_server")

    val details: StateFlow<Details?> = engine.state("meta_details").map(Details::from).stateIn(scope, SharingStarted.Eagerly, null)
    val search: StateFlow<List<Row>> = engine.state("search").map { Row.list(it).orEmpty() }.stateIn(scope, SharingStarted.Eagerly, emptyList())
    val discover: StateFlow<Discover?> = engine.state("discover").map(Discover::from).stateIn(scope, SharingStarted.Eagerly, null)

    init {
        // Every time the page (re)starts: Home's rows, then dx.bi's pieces
        scope.launch {
            engine.ready.collect { up ->
                if (!up) return@collect
                // The page itself waits on an empty screen: its own Home (billboard, rows, posters) would
                // keep working away out of sight. First, so leaving its Home doesn't unload ours.
                ask("go", JSONObject().put("hash", PARKED))
                delay(400)
                loadHome()
                refreshExtras()
            }
        }
        // The library changing (watched something, added to My List, another device) changes dx.bi's rows
        scope.launch {
            var last: String? = null
            continueState.collect { now ->
                val sig = now?.toString()
                if (last != null && sig != last && engine.ready.value) refreshExtras()
                last = sig
            }
        }
    }

    private suspend fun ask(op: String, args: JSONObject = JSONObject()): Any? = try {
        engine.call(op, args)
    } catch (e: Exception) {
        android.util.Log.w("dxbi", "engine $op failed: ${e.message}")
        null
    }

    private suspend fun dx(method: String, vararg args: Any?): Any? =
        ask("dx", JSONObject().put("method", method).put("args", JSONArray(args.toList())))

    private suspend fun loadHome() {
        ask("load", JSONObject().put("field", "board").put("model", "CatalogsWithExtra").put("args", JSONObject().put("extra", JSONArray())))
        ask("loadRange", JSONObject().put("field", "board").put("start", 0).put("end", 30))
    }

    private var extrasJob: Job? = null

    fun refreshExtras() {
        extrasJob?.cancel()
        extrasJob = scope.launch {
            (dx("phone.viewers") as? JSONObject)?.let { v ->
                val list = v.optJSONArray("list").objects().map { Viewer(it.optString("id"), it.optString("name"), it.text("colour"), it.optBoolean("kids")) }
                viewers.value = list
                viewer.value = list.firstOrNull { it.id == v.optString("current") } ?: list.firstOrNull()
            }
            (dx("phone.layout") as? JSONObject)?.let {
                layout.value = HomeLayout.from(it)
                cache.edit().putString("x.layout", it.toString()).apply()
            }
            (dx("phone.myList") as? JSONArray)?.let {
                myList.value = it.objects().map { r -> ListRow(r.optString("name"), r.optJSONArray("items").objects().map(Title::from)) }
                cache.edit().putString("x.myList", it.toString()).apply()
            }
            (dx("phone.airing") as? JSONArray)?.let {
                airing.value = it.objects().map(Airing::from)
                cache.edit().putString("x.airing", it.toString()).apply()
            }
            // The billboard and Because you watched fetch from the internet: they can take a few seconds
            (dx("phone.billboard") as? JSONArray)?.let {
                if (it.length() > 0 || billboard.value.isEmpty()) {
                    billboard.value = it.objects().map(Title::from)
                    cache.edit().putString("x.billboard", it.toString()).apply()
                }
            }
            repeat(10) {
                val answer = dx("phone.forYou")
                if (answer is JSONObject) {
                    val items = answer.optJSONArray("items").objects()
                    forYou.value = if (items.isEmpty()) null else ListRow(answer.optString("name"), items.map(Title::from))
                    cache.edit().putString("x.forYou", JSONArray().put(answer).toString()).apply()
                    return@launch
                }
                delay(1500)
            }
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Details

    private fun path(resource: String, type: String, id: String) =
        JSONObject().put("resource", resource).put("type", type).put("id", id).put("extra", JSONArray())

    /** A title's details, and the streams for [videoId] (a film's streams are its own; a series' wait for an episode) */
    fun open(type: String, id: String, videoId: String? = null) {
        val streamsFor = videoId ?: if (type != "series") id else null
        val args = JSONObject()
            .put("metaPath", path("meta", type, id))
            .put("streamPath", streamsFor?.let { path("stream", type, it) } ?: JSONObject.NULL)
            .put("guessStream", streamsFor == null && type != "series")
        scope.launch { ask("load", JSONObject().put("field", "meta_details").put("model", "MetaDetails").put("args", args)) }
    }

    fun setInList(add: Boolean) = scope.launch {
        ask("library", JSONObject().put("add", add))
        refreshExtras()
    }

    fun setWatched(watched: Boolean) = scope.launch { ask("watched", JSONObject().put("value", watched)) }

    /** One video of the open title watched or not (a film: its own id); [upTo]: and the episodes before it in its season */
    fun setWatched(videoId: String, watched: Boolean, upTo: Boolean = false) = scope.launch {
        ask("videoWatched", JSONObject().put("id", videoId).put("value", watched).put("upTo", upTo))
    }

    /**
     * Report a problem, as dx.bi does everywhere: what they typed, with dx.bi's version, the phone,
     * settings, addon names and recent errors (no passwords, keys or stream links). The report's code
     * to post in dx.bi's Discord, or what went wrong
     */
    suspend fun report(description: String): Result<String> = runCatching {
        engine.call("dx", JSONObject().put("method", "report.send").put("args", JSONArray().put(description)), 30_000) as? String ?: ""
    }

    fun removeFromContinue(id: String) = scope.launch { ask("dismiss", JSONObject().put("id", id)) }

    /** The open title's streams, described by dx.bi, with Just press Play's pick */
    suspend fun streams(): StreamChoices? = (dx("phone.streams") as? JSONObject)?.let(StreamChoices::from)

    /**
     * Plays one of [streams] (dx.bi keeps the next best ready in case it won't play): in dx.bi's
     * player, another app, on a Chromecast (where Play goes anyway while one is connected) or as a download
     */
    fun play(option: StreamOption, target: Phone.Target = Phone.Target.Player) = scope.launch {
        // a torrent to download: dx.bi's torrent engine fetches it, no player (or streaming server) needed
        if (target == Phone.Target.Download && option.torrent) {
            val answer = runCatching {
                engine.call("dx", JSONObject().put("method", "phone.downloadOption").put("args", JSONArray().put(option.index)), 60_000) as? JSONObject
            }.getOrNull()
            val stream = answer?.optJSONObject("stream")
            if (stream != null) com.notdxbi.dxbi.tv.Downloads.add(app, stream.toString())
            else android.widget.Toast.makeText(app, answer?.optString("error")?.ifEmpty { null } ?: "Couldn't download that one. Try again.", android.widget.Toast.LENGTH_LONG).show()
            return@launch
        }
        Phone.nextTarget = when {
            target != Phone.Target.Player -> target
            !option.torrent && Cast.connected(app) -> Phone.Target.Cast
            playInOtherApp.value -> Phone.Target.External
            else -> target
        }
        val link = dx("phone.play", option.index) as? String ?: option.play
        ask("play", JSONObject().put("link", link))
    }

    /**
     * The stream to download for one film or episode in a quality ("best", "2160", "1080", "720",
     * "small"): dx.bi picks it from the addons (checking its link is really ready), with subtitles.
     * The details for [com.notdxbi.dxbi.tv.Downloads.add], or why there's none.
     */
    suspend fun downloadStream(type: String, metaId: String, videoId: String, quality: String): Result<JSONObject> = runCatching {
        val args = JSONObject().put("method", "phone.download").put("args", JSONArray(listOf(type, metaId, videoId, quality)))
        val answer = engine.call("dx", args, 60_000) as? JSONObject ?: error("dx.bi didn't answer. Try again.")
        answer.optJSONObject("stream") ?: error(answer.optString("error").ifEmpty { "Couldn't find a stream to download." })
    }

    /** Plays through Stremio's player route, which dxbi-tv.js hands to the native player */
    fun play(stream: Stream) = scope.launch {
        stream.play?.let { ask("play", JSONObject().put("link", it)) }
    }

    // ---------------------------------------------------------------------------------------------
    // Search and See All

    fun search(query: String) = scope.launch {
        val extra = JSONArray().put(JSONArray().put("search").put(query))
        ask("load", JSONObject().put("field", "search").put("model", "CatalogsWithExtra").put("args", JSONObject().put("extra", extra)))
        ask("loadRange", JSONObject().put("field", "search").put("start", 0).put("end", 20))
    }

    /** A Discover link (a row's See All: #/discover/<addon>/<type>/<catalog>?genre=…) */
    fun discover(link: String) {
        val m = Regex("""#/discover/([^/]+)/([^/]+)/([^/?]+)(?:\?(.*))?""").find(link) ?: return
        val (base, type, catalog, query) = m.destructured
        val extra = JSONArray()
        query.split('&').filter { it.contains('=') }.forEach { pair ->
            val (k, v) = pair.split('=', limit = 2)
            extra.put(JSONArray().put(android.net.Uri.decode(k)).put(android.net.Uri.decode(v)))
        }
        discover(android.net.Uri.decode(base), android.net.Uri.decode(type), android.net.Uri.decode(catalog), extra)
    }

    fun discover(base: String, type: String, catalog: String, extra: JSONArray = JSONArray()) = scope.launch {
        val request = JSONObject().put("base", base).put("path", JSONObject().put("resource", "catalog").put("type", type).put("id", catalog).put("extra", extra))
        ask("load", JSONObject().put("field", "discover").put("model", "CatalogWithFilters").put("args", JSONObject().put("request", request)))
    }

    /** The same catalog with another genre (null: all) */
    fun discoverGenre(genre: String?) {
        val request = discover.value?.request ?: return
        val path = request.optJSONObject("path") ?: return
        val extra = JSONArray()
        path.optJSONArray("extra")?.let { old -> (0 until old.length()).mapNotNull { old.optJSONArray(it) }.filter { it.optString(0) != "genre" }.forEach { extra.put(it) } }
        if (genre != null) extra.put(JSONArray().put("genre").put(genre))
        discover(request.optString("base"), path.optString("type"), path.optString("id"), extra)
    }

    fun discoverMore() = scope.launch {
        ask("dispatch", JSONObject().put("field", "discover").put("action", JSONObject().put("action", "CatalogWithFilters").put("args", JSONObject().put("action", "LoadNextPage"))))
    }

    // ---------------------------------------------------------------------------------------------
    // Account and viewers

    /** Signs in; null when it worked, else what went wrong */
    suspend fun signIn(email: String, password: String): String? {
        ask("signIn", JSONObject().put("email", email).put("password", password))
        val answer = withTimeoutOrNull(20_000) {
            engine.events.filter { it.first == "UserAuthenticated" || it.first == "Error" }.first()
        } ?: return "dx.bi couldn't connect. Check your connection and try again."
        if (answer.first == "UserAuthenticated") return null
        return answer.second?.optJSONObject("error")?.text("message") ?: "That email and password didn't work."
    }

    fun signOut() = scope.launch {
        guest.value = false
        cache.edit().putBoolean("guest", false).apply()
        ask("signOut")
    }

    /** dx.bi settings → Play videos in: another app (VLC, mpv…) rather than dx.bi's player */
    val playInOtherApp = MutableStateFlow(cache.getBoolean("playInOtherApp", false))

    fun setPlayInOtherApp(on: Boolean) {
        playInOtherApp.value = on
        cache.edit().putBoolean("playInOtherApp", on).apply()
    }

    /** dx.bi settings → Library in the tab bar: a Library tab beside Home, Discover… (off: it's under Profile) */
    val libraryTab = MutableStateFlow(cache.getBoolean("libraryTab", false))

    fun setLibraryTab(on: Boolean) {
        libraryTab.value = on
        cache.edit().putBoolean("libraryTab", on).apply()
    }

    /** Browsing without an account (Stremio allows it: no sync, no library on other devices) */
    val guest = MutableStateFlow(cache.getBoolean("guest", false))

    fun continueAsGuest() {
        guest.value = true
        cache.edit().putBoolean("guest", true).apply()
    }

    // ---------------------------------------------------------------------------------------------
    // Addons

    fun loadAddons() = scope.launch {
        ask("load", JSONObject().put("field", "installed_addons").put("model", "InstalledAddonsWithFilters").put("args", JSONObject().put("request", JSONObject().put("type", JSONObject.NULL))))
    }

    /** Stremio's addon lists: "official" or "community" */
    fun loadRemoteAddons(catalog: String) = scope.launch {
        val request = JSONObject().put("base", "https://v3-cinemeta.strem.io/manifest.json")
            .put("path", JSONObject().put("resource", "addon_catalog").put("type", "all").put("id", catalog).put("extra", JSONArray()))
        ask("load", JSONObject().put("field", "remote_addons").put("model", "CatalogWithFilters").put("args", JSONObject().put("request", request)))
    }

    /** Each returns null when it worked, else what went wrong */
    suspend fun install(addon: Addon): String? = attempt("addonInstall", JSONObject().put("transportUrl", addon.transportUrl)) { loadHome() }
    suspend fun uninstall(addon: Addon): String? = attempt("addonUninstall", JSONObject().put("transportUrl", addon.transportUrl)) { loadHome() }
    suspend fun installFromLink(url: String): String? = attempt("addonFromUrl", JSONObject().put("url", url)) { loadHome() }

    private suspend fun attempt(op: String, args: JSONObject, after: suspend () -> Unit): String? = try {
        engine.call(op, args)
        after()
        null
    } catch (e: Exception) {
        e.message ?: "That didn't work"
    }

    // ---------------------------------------------------------------------------------------------
    // Library (My List's See All)

    fun loadLibrary(type: String?) = scope.launch {
        val request = JSONObject().put("type", type ?: JSONObject.NULL).put("sort", "lastwatched")
        ask("load", JSONObject().put("field", "library").put("model", "LibraryWithFilters").put("args", JSONObject().put("request", request)))
    }

    fun libraryMore() = scope.launch {
        ask("dispatch", JSONObject().put("field", "library").put("action", JSONObject().put("action", "LibraryWithFilters").put("args", JSONObject().put("action", "LoadNextPage"))))
    }

    // ---------------------------------------------------------------------------------------------
    // Stremio's settings, Customise Home, reviews

    fun updateSettings(changes: JSONObject) = scope.launch { ask("updateSettings", JSONObject().put("changes", changes)) }

    fun saveLayout(layout: HomeLayout) = scope.launch {
        val data = JSONObject()
            .put("order", JSONArray(layout.order))
            .put("hidden", JSONArray(layout.hidden.toList()))
            .put("names", JSONObject(layout.names))
        this@Stremio.layout.value = layout
        dx("homeLayout.save", data)
        refreshExtras()
    }

    /** A title's scores and reviews (dx.bi's Reviews: MDBList, Wikidata, Wikipedia, TMDB with the keys set) */
    suspend fun reviews(type: String, id: String): Reviews? =
        (engine.runCatching { call("dx", JSONObject().put("method", "phone.reviews").put("args", JSONArray().put(type).put(id)), 40_000) }.getOrNull() as? JSONObject)?.let(Reviews::from)

    // ---------------------------------------------------------------------------------------------
    // Watch party (dx.bi's own: end-to-end encrypted, everyone streams from their own addons)

    suspend fun party(): JSONObject? = dx("phone.party.state") as? JSONObject

    /** Each returns null when it worked, else what went wrong */
    suspend fun startParty(name: String): String? = attempt("dx", JSONObject().put("method", "phone.party.start").put("args", JSONArray().put(name))) {}
    suspend fun joinParty(code: String, name: String): String? = attempt("dx", JSONObject().put("method", "phone.party.join").put("args", JSONArray().put(code).put(name))) {}
    fun rejoinParty() = scope.launch { dx("phone.party.rejoin") }
    fun leaveParty() = scope.launch { dx("phone.party.leave") }
    fun sayInParty(text: String) = scope.launch { dx("phone.party.say", text) }

    /** dx.bi settings, as the TV lists them */
    suspend fun settings(): List<Setting> = (ask("settings") as? JSONArray).objects().map(Setting::from)

    /** Your stats (dx.bi's Watch stats), or null when they're switched off */
    suspend fun stats(): JSONObject? = dx("phone.stats") as? JSONObject

    suspend fun saveSetting(key: String, value: Any?) {
        ask("saveSetting", JSONObject().put("key", key).put("value", value ?: JSONObject.NULL))
        refreshExtras()
    }

    fun chooseViewer(id: String) = scope.launch {
        dx("viewers.select", id)
        refreshExtras()
    }
}

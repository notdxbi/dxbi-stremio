import Foundation
import Observation
import UIKit

/**
 * Stremio as the app's screens see it: what to show (kept current, and remembered between launches
 * so the app opens on the last Home it showed) and what they can do. All of it through [Page].
 */
@MainActor
@Observable
final class Stremio {

    /** Where the app's next stream goes: dx.bi's player, another app (Infuse, VLC…), or Downloads */
    enum Target { case player, otherApp, download }

    @ObservationIgnored let page = Page()
    @ObservationIgnored private let cache = UserDefaults.standard

    var ready = false
    var account: Account?
    var continueWatching: [Continue] = []
    var rows: [Row] = []
    var allRows: [Row] = []
    var billboard: [Title] = []
    var myList: [ListRow] = []
    var forYou: ListRow?
    var airing: [Airing] = []
    var layout = HomeLayout()
    var viewers: [Viewer] = []
    var viewer: Viewer?

    var details: Details?
    var search: [Row] = []
    var discover: Discover?
    var library: [Title] = []
    var installedAddons: [Addon] = []
    var remoteAddons: [Addon] = []
    var remoteAddonsLoading = false
    var streamingServer: JSON?
    var profileSettings: JSON = [:]

    /** Browsing without an account (Stremio allows it: no sync) */
    var guest: Bool { didSet { cache.set(guest, forKey: "guest") } }
    /** Settings → Play videos in another app */
    var otherApp: String? { didSet { cache.set(otherApp, forKey: "otherApp") } }

    /** A short message over the screens (the page's toasts, errors) */
    var message: String?
    /** What the player is showing (the page's play payload), while it's open */
    var playback: Playback?

    @ObservationIgnored private var board: JSON?
    @ObservationIgnored private var nextTarget = Target.player
    @ObservationIgnored private var extrasTask: Task<Void, Never>?
    @ObservationIgnored private var lastContinue: String?

    /** Where the page waits, out of sight: a screen Stremio has nothing on */
    private static let parked = "#/dxbi"

    init() {
        guest = cache.bool(forKey: "guest")
        otherApp = cache.string(forKey: "otherApp")
        // the last of each, from the launch before
        apply("ctx", remembered("ctx"))
        apply("board", remembered("board"))
        apply("continue_watching_preview", remembered("continue_watching_preview"))
        billboard = (savedList("x.billboard") ?? []).map(Title.init)
        myList = (savedList("x.myList") ?? []).map(ListRow.init)
        forYou = savedList("x.forYou")?.first.map(ListRow.init).flatMap { $0.items.isEmpty ? nil : $0 }
        airing = (savedList("x.airing") ?? []).map(Airing.init)
        layout = HomeLayout(cache.string(forKey: "x.layout").flatMap { Json.decode($0) as? JSON })
        rows = layout.arrange(Row.list(board))

        page.onState = { [weak self] field, data in self?.apply(field, data, save: true) }
        page.onReady = { [weak self] in self?.started() }
        page.onGone = { [weak self] in self?.ready = false }
        page.onToast = { [weak self] text in self?.show(text) }
        page.onPlay = { [weak self] json in self?.handOver(json) }
        page.onControl = { [weak self] c in self?.playback?.control(c) }
        Downloads.shared.stremio = self
        for field in ["ctx", "board", "continue_watching_preview", "meta_details", "search", "discover", "library", "installed_addons", "remote_addons", "streaming_server"] {
            page.watch(field)
        }
    }

    func show(_ text: String) {
        message = text
        let shown = text
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(4))
            if message == shown { message = nil }
        }
    }

    // MARK: - State from the page

    private func remembered(_ field: String) -> JSON? {
        cache.string(forKey: "state.\(field)").flatMap { Json.decode($0) as? JSON }
    }

    private func savedList(_ key: String) -> [JSON]? {
        cache.string(forKey: key).flatMap { Json.decode($0) as? [Any] }?.compactMap { $0 as? JSON }
    }

    private func apply(_ field: String, _ data: JSON?, save: Bool = false) {
        guard let data else { return }
        if save, ["ctx", "board", "continue_watching_preview"].contains(field) {
            cache.set(Json.encode(data), forKey: "state.\(field)")
        }
        switch field {
        case "ctx":
            account = Account(data)
            profileSettings = data.object("settings") ?? [:]
        case "board":
            board = data
            allRows = Row.list(data)
            rows = layout.arrange(allRows)
        case "continue_watching_preview":
            continueWatching = Continue.list(data)
            // the library changing (watched something, added to the list, another device) changes dx.bi's rows
            let sig = Json.encode(data)
            if lastContinue != nil, sig != lastContinue, ready { refreshExtras() }
            lastContinue = sig
        case "meta_details": details = Details(data)
        case "search": search = Row.list(data)
        case "discover": discover = Discover(data)
        case "library": library = data.objects("items").map(Title.init)
        case "installed_addons": installedAddons = data.objects("items").map(Addon.init)
        case "remote_addons":
            remoteAddons = data.objects("items").map(Addon.init)
            remoteAddonsLoading = Load(data) == .loading
        case "streaming_server": streamingServer = data
        default: break
        }
    }

    private func started() {
        ready = true
        Task {
            // The page itself waits on an empty screen: its own Home would keep working away out of sight
            await ask("go", ["hash": Self.parked])
            try? await Task.sleep(for: .milliseconds(400))
            await loadHome()
            refreshExtras()
        }
    }

    @discardableResult
    private func ask(_ op: String, _ args: JSON = [:], timeout: Double = 20) async -> Any? {
        do {
            return try await page.call(op, args, timeout: timeout)
        } catch {
            print("[dx.bi] \(op) failed: \(error.localizedDescription)")
            return nil
        }
    }

    @discardableResult
    private func dx(_ method: String, _ args: Any...) async -> Any? {
        await ask("dx", ["method": method, "args": args])
    }

    private func loadHome() async {
        await ask("load", ["field": "board", "model": "CatalogsWithExtra", "args": ["extra": [Any]()]])
        await ask("loadRange", ["field": "board", "start": 0, "end": 30])
    }

    func refreshExtras() {
        extrasTask?.cancel()
        extrasTask = Task {
            if let v = await dx("phone.viewers") as? JSON {
                viewers = v.objects("list").map { Viewer(id: $0.string("id"), name: $0.string("name")) }
                viewer = viewers.first { $0.id == v.string("current") } ?? viewers.first
            }
            if let l = await dx("phone.layout") as? JSON {
                layout = HomeLayout(l)
                rows = layout.arrange(allRows)
                cache.set(Json.encode(l), forKey: "x.layout")
            }
            if let list = await dx("phone.myList") as? [Any] {
                myList = list.compactMap { $0 as? JSON }.map(ListRow.init)
                cache.set(Json.encode(list), forKey: "x.myList")
            }
            if let list = await dx("phone.airing") as? [Any] {
                airing = list.compactMap { $0 as? JSON }.map(Airing.init)
                cache.set(Json.encode(list), forKey: "x.airing")
            }
            // the billboard and Because you watched fetch from the internet: they can take a few seconds
            if let list = await dx("phone.billboard") as? [Any], !list.isEmpty || billboard.isEmpty {
                billboard = list.compactMap { $0 as? JSON }.map(Title.init)
                cache.set(Json.encode(list), forKey: "x.billboard")
            }
            for _ in 0..<10 {
                if Task.isCancelled { return }
                if let answer = await dx("phone.forYou") as? JSON {
                    let row = ListRow(answer)
                    forYou = row.items.isEmpty ? nil : row
                    cache.set(Json.encode([answer]), forKey: "x.forYou")
                    return
                }
                try? await Task.sleep(for: .seconds(1.5))
            }
        }
    }

    // MARK: - Details

    private func path(_ resource: String, _ type: String, _ id: String) -> JSON {
        ["resource": resource, "type": type, "id": id, "extra": [Any]()]
    }

    /** A title's details, and the streams for [videoId] (a film's streams are its own; a series' wait for an episode) */
    func open(_ type: String, _ id: String, videoId: String? = nil) {
        let streamsFor = videoId ?? (type != "series" ? id : nil)
        let args: JSON = [
            "metaPath": path("meta", type, id),
            "streamPath": streamsFor.map { path("stream", type, $0) } ?? NSNull(),
            "guessStream": streamsFor == nil && type != "series",
        ]
        Task { await ask("load", ["field": "meta_details", "model": "MetaDetails", "args": args]) }
    }

    func setInLibrary(_ add: Bool) {
        Task {
            await ask("library", ["add": add])
            refreshExtras()
        }
    }

    /** Adds a title that isn't open (Home's +): Stremio wants the whole title, so it's opened first */
    func setInLibrary(_ title: Title, _ add: Bool) {
        open(title.type, title.id)
        Task {
            for _ in 0..<40 where !(details?.metaId == title.id && details?.state == .ready) {
                try? await Task.sleep(for: .milliseconds(150))
            }
            guard details?.metaId == title.id else { return show("Couldn't reach Stremio. Try again.") }
            await ask("library", ["add": add])
            if let i = billboard.firstIndex(where: { $0.id == title.id }) { billboard[i].inLibrary = add }
            refreshExtras()
        }
    }

    func setWatched(_ watched: Bool) { Task { await ask("watched", ["value": watched]) } }

    func removeFromContinue(_ id: String) { Task { await ask("dismiss", ["id": id]) } }

    /** The open title's streams, described by dx.bi, with Just press Play's pick */
    func streams() async -> StreamChoices? {
        (await dx("phone.streams") as? JSON).map(StreamChoices.init)
    }

    /** Plays one of [streams] (dx.bi keeps the next best ready in case it won't play) */
    func play(_ option: StreamOption, in target: Target = .player) {
        nextTarget = target == .player && otherApp != nil ? .otherApp : target
        Task {
            let link = await dx("phone.play", option.index) as? String ?? option.play
            await ask("play", ["link": link])
        }
    }

    /** Continue Watching: Stremio's own player link for where they left off */
    func play(link: String) {
        nextTarget = otherApp != nil ? .otherApp : .player
        Task { await ask("play", ["link": link]) }
    }

    func reviews(_ type: String, _ id: String) async -> Reviews? {
        (await ask("dx", ["method": "phone.reviews", "args": [type, id]], timeout: 40) as? JSON).map(Reviews.init)
    }

    // MARK: - Search, Discover, Library

    func search(_ query: String) {
        Task {
            await ask("load", ["field": "search", "model": "CatalogsWithExtra", "args": ["extra": [["search", query]]]])
            await ask("loadRange", ["field": "search", "start": 0, "end": 20])
        }
    }

    /** A Discover link (a row's See All: #/discover/<addon>/<type>/<catalog>?genre=…) */
    func discover(link: String) {
        guard let m = link.wholeMatch(of: /#\/discover\/([^\/]+)\/([^\/]+)\/([^\/?]+)(?:\?(.*))?/) else { return }
        let decode = { (s: Substring) in String(s).removingPercentEncoding ?? String(s) }
        var extra: [[String]] = []
        for pair in (m.output.4 ?? "").split(separator: "&") where pair.contains("=") {
            let kv = pair.split(separator: "=", maxSplits: 1)
            extra.append([decode(kv[0]), decode(kv[1])])
        }
        discover(base: decode(m.output.1), type: decode(m.output.2), catalog: decode(m.output.3), extra: extra)
    }

    func discover(base: String, type: String, catalog: String, extra: [[String]] = []) {
        let request: JSON = ["base": base, "path": ["resource": "catalog", "type": type, "id": catalog, "extra": extra] as JSON]
        Task { await ask("load", ["field": "discover", "model": "CatalogWithFilters", "args": ["request": request]]) }
    }

    /** The same catalog with another genre (nil: all) */
    func discoverGenre(_ genre: String?) {
        guard let request = discover?.request, let path = request.object("path") else { return }
        var extra = ((path["extra"] as? [Any]) ?? []).compactMap { $0 as? [String] }.filter { $0.first != "genre" }
        if let genre { extra.append(["genre", genre]) }
        discover(base: request.string("base"), type: path.string("type"), catalog: path.string("id"), extra: extra)
    }

    func discoverMore() {
        Task { await ask("dispatch", ["field": "discover", "action": ["action": "CatalogWithFilters", "args": ["action": "LoadNextPage"]] as JSON]) }
    }

    /** Discover opened for the first time: Stremio's first catalog (Popular movies) */
    func discoverStart() {
        guard discover?.request == nil else { return }
        if let link = allRows.first(where: { $0.type == "movie" })?.discover ?? allRows.first?.discover { discover(link: link) }
    }

    func loadLibrary(_ type: String? = nil) {
        Task { await ask("load", ["field": "library", "model": "LibraryWithFilters", "args": ["request": ["type": type ?? NSNull(), "sort": "lastwatched"] as JSON]]) }
    }

    func libraryMore() {
        Task { await ask("dispatch", ["field": "library", "action": ["action": "LibraryWithFilters", "args": ["action": "LoadNextPage"]] as JSON]) }
    }

    // MARK: - Account

    /** Signs in; nil when it worked, else what went wrong */
    func signIn(email: String, password: String) async -> String? {
        let answer: (String, JSON?)? = await withCheckedContinuation { continuation in
            var done = false
            let finish: ((String, JSON?)?) -> Void = { value in
                guard !done else { return }
                done = true
                self.page.onEvent = nil
                continuation.resume(returning: value)
            }
            page.onEvent = { event, args in
                if event == "UserAuthenticated" || event == "Error" { finish((event, args)) }
            }
            Task {
                await ask("signIn", ["email": email, "password": password])
                try? await Task.sleep(for: .seconds(20))
                finish(nil)
            }
        }
        guard let answer else { return "Stremio didn't answer. Check your connection and try again." }
        if answer.0 == "UserAuthenticated" { return nil }
        return answer.1?.object("error")?.text("message") ?? "That email and password didn't work."
    }

    func signOut() {
        guest = false
        Task { await ask("signOut") }
    }

    // MARK: - Addons

    func loadAddons() {
        Task { await ask("load", ["field": "installed_addons", "model": "InstalledAddonsWithFilters", "args": ["request": ["type": NSNull()] as JSON]]) }
    }

    /** Stremio's addon lists: "official" or "community" */
    func loadRemoteAddons(_ catalog: String) {
        let request: JSON = ["base": "https://v3-cinemeta.strem.io/manifest.json", "path": ["resource": "addon_catalog", "type": "all", "id": catalog, "extra": [Any]()] as JSON]
        remoteAddonsLoading = true
        Task { await ask("load", ["field": "remote_addons", "model": "CatalogWithFilters", "args": ["request": request]]) }
    }

    /** Each returns nil when it worked, else what went wrong */
    func install(_ addon: Addon) async -> String? { await attempt("addonInstall", ["transportUrl": addon.transportUrl]) }
    func uninstall(_ addon: Addon) async -> String? { await attempt("addonUninstall", ["transportUrl": addon.transportUrl]) }
    func install(link: String) async -> String? { await attempt("addonFromUrl", ["url": link]) }

    private func attempt(_ op: String, _ args: JSON) async -> String? {
        do {
            _ = try await page.call(op, args)
            await loadHome()
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    // MARK: - Settings

    func updateSettings(_ changes: JSON) { Task { await ask("updateSettings", ["changes": changes]) } }

    func settings() async -> [Setting] {
        ((await ask("settings")) as? [Any] ?? []).compactMap { $0 as? JSON }.map(Setting.init)
    }

    func saveSetting(_ key: String, json: String) async {
        await ask("saveSetting", ["key": key, "value": Json.decode(json) ?? NSNull()])
        refreshExtras()
    }

    func saveLayout(_ layout: HomeLayout) {
        self.layout = layout
        rows = layout.arrange(allRows)
        let data: JSON = ["order": layout.order, "hidden": Array(layout.hidden), "names": layout.names]
        Task {
            await dx("homeLayout.save", data)
            refreshExtras()
        }
    }

    func chooseViewer(_ id: String) {
        Task {
            await dx("viewers.select", id)
            refreshExtras()
        }
    }

    // MARK: - Watch party (dx.bi's own: end-to-end encrypted, everyone streams from their own addons)

    func party() async -> JSON? { await dx("phone.party.state") as? JSON }

    func startParty(name: String) async -> String? {
        await attempt("dx", ["method": "phone.party.start", "args": [name]])
    }

    func joinParty(code: String, name: String) async -> String? {
        await attempt("dx", ["method": "phone.party.join", "args": [code, name]])
    }

    func leaveParty() { Task { await dx("phone.party.leave") } }
    func sayInParty(_ text: String) { Task { await dx("phone.party.say", text) } }

    // MARK: - Playback: the page hands a stream over (dxbi-tv.js startHandoff), the player reports back

    private func handOver(_ json: String) {
        guard let payload = Json.decode(json) as? JSON else { return }
        let target = nextTarget
        nextTarget = .player
        page.js("window.__dxbiIos.active = \(Json.quote(json))")
        if target == .download {
            Downloads.shared.add(payload)
            // nothing plays: the page goes back to where it was
            closed(position: 0, duration: 0, ended: false, error: nil)
            return
        }
        if target == .otherApp {
            if let app = OtherApp.find(otherApp), let url = app.link(payload) {
                UIApplication.shared.open(url)
                watchedElsewhere(payload)
                closed(position: 0, duration: 0, ended: false, error: nil)
                return
            }
            show("No external player found: install Infuse, VLC, Outplayer or SenPlayer. Playing it here.")
        }
        let playback = Playback(payload: payload, stremio: self)
        self.playback = playback
        // (from here, not from a screen watching for it: the screens under the player don't update
        // while it covers them, so it never closed)
        PlayerHost.show(playback, stremio: self)
    }

    /** The player's external player button: carries on in another app */
    func playExternally(_ playback: Playback) {
        if playback.payload.text("offline") != nil { return playback.show("Downloads play here only") }
        guard let app = OtherApp.find(otherApp), let url = app.link(playback.payload) else {
            show("No external player found: install Infuse, VLC, Outplayer or SenPlayer.")
            return
        }
        watchedElsewhere(playback.payload)
        playback.finish(ended: false)
        UIApplication.shared.open(url)
    }

    /**
     * Played in another app: it keeps no watch progress here, so the episode (or film) counts as
     * watched once it's opened there
     */
    private func watchedElsewhere(_ payload: JSON) {
        guard payload.text("offline") == nil, let video = payload.text("videoId") else { return }
        setWatched(video: video, true)
    }

    /** The cast with their photos (TMDB, with a key in dx.bi settings), or nil */
    func cast(_ type: String, _ imdb: String, names: [JSON]) async -> [JSON]? {
        (await ask("dx", ["method": "phone.cast", "args": [type, imdb, names]], timeout: 25) as? [Any])?.compactMap { $0 as? JSON }
    }

    /** Search for this (a name tapped on a title's page): the Search tab opens with it */
    var pendingSearch: String?

    func searchFor(_ text: String) { pendingSearch = text }

    /**
     * Report a problem, as dx.bi does everywhere: what they typed, with dx.bi's version, the phone,
     * settings, addon names and recent errors (no passwords, keys or stream links). The report's code
     * to post in dx.bi's Discord, or what went wrong
     */
    func report(_ description: String) async -> Result<String, Page.Failure> {
        do {
            let code = try await page.call("dx", ["method": "report.send", "args": [description]], timeout: 30)
            return .success((code as? String) ?? "")
        } catch {
            return .failure(Page.Failure(message: error.localizedDescription))
        }
    }

    /** A download, from the phone */
    func play(download item: Downloads.Item) {
        guard let payload = Downloads.shared.playback(item) else { return }
        let playback = Playback(payload: payload, stremio: self)
        self.playback = playback
        PlayerHost.show(playback, stremio: self)
    }

    /** One video of the open title watched or not (a film: its own id); [upTo]: and the episodes before it in its season */
    func setWatched(video id: String, _ watched: Bool, upTo: Bool = false) {
        Task { await ask("videoWatched", ["id": id, "value": watched, "upTo": upTo]) }
    }

    /** Your stats (dx.bi's Watch stats), or nil when they're switched off */
    func stats() async -> JSON? { await dx("phone.stats") as? JSON }

    func progress(position: Double, duration: Double, paused: Bool) {
        page.js("window.__dxbiTv && window.__dxbiTv.onProgress(\(Int(position * 1000)), \(Int(duration * 1000)), \(paused))")
    }

    func partyTick(position: Double, duration: Double, paused: Bool, buffering: Bool, rate: Double) {
        page.js("window.__dxbiTv && window.__dxbiTv.onPartyTick(\(Int(position * 1000)), \(Int(duration * 1000)), \(paused), \(buffering), \(rate))")
    }

    /** The player closed: the page records where it got to, and goes on to the next episode when asked */
    func closed(position: Double, duration: Double, ended: Bool, error: String?, next: Bool = false) {
        let active = playback?.payload
        // a download: it keeps its own place (the page didn't hand it over, so there's nothing to tell it)
        if let id = active?.text("offline") {
            Downloads.shared.leftAt(id, ms: position * 1000, ended: ended)
            playback = nil
            PlayerHost.hide()
            return
        }
        let close: JSON = [
            "timeMs": Int(position * 1000),
            "durationMs": Int(duration * 1000),
            "ended": ended,
            "next": next,
            "error": error ?? NSNull(),
            "hash": active?.string("hash") ?? "",
            "videoId": active?.string("videoId") ?? "",
        ]
        page.js("window.__dxbiIos.active = ''; window.__dxbiIos.pendingClose = \(Json.quote(Json.encode(close))); window.__dxbiTv && window.__dxbiTv.playerClosed && window.__dxbiTv.playerClosed()")
        playback = nil
        PlayerHost.hide()
    }
}

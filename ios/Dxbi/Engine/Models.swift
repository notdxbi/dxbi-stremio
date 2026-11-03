import Foundation

// What the screens show, read from the JSON dxbi-engine.js sends (see its views). The same shapes
// as the Android app's Models.kt.

struct Title: Identifiable, Hashable {
    var id: String
    var type: String
    var name: String
    var poster: String?
    var background: String?
    var logo: String?
    var wide = false
    var year: String?
    var runtime: String?
    var imdb: String?
    var genres: [String] = []
    var description: String?
    var inLibrary = false
    var watched = false
    var trailer: String?

    /** Art for a card: the poster, or for titles without one the backdrop */
    var art: URL? { URL(string: poster ?? background ?? (id.hasPrefix("tt") ? "https://images.metahub.space/poster/medium/\(id)/img" : "")) }
    var backdrop: URL? { URL(string: background ?? (id.hasPrefix("tt") ? "https://images.metahub.space/background/large/\(id)/img" : poster ?? "")) }
    var logoURL: URL? { URL(string: logo ?? (id.hasPrefix("tt") ? "https://images.metahub.space/logo/medium/\(id)/img" : "")) }
    var ref: TitleRef { TitleRef(type: type, id: id, name: name) }

    init(id: String, type: String, name: String) {
        self.id = id
        self.type = type
        self.name = name
    }

    init(_ o: JSON) {
        id = o.string("id")
        type = o.string("type")
        name = o.string("name").unescaped
        poster = o.text("poster")
        background = o.text("background")
        logo = o.text("logo")
        wide = o.string("shape") == "landscape"
        year = o.text("year")
        runtime = o.text("runtime")
        imdb = o.text("imdb")
        genres = o.strings("genres")
        description = o.text("description")?.unescaped
        inLibrary = o.bool("inLibrary")
        watched = o.bool("watched")
        trailer = o.text("trailer")
    }
}

/** A title to open (what navigation carries) */
struct TitleRef: Hashable {
    var type: String
    var id: String
    var name: String = ""
    /** Start playing as soon as it's open (Play on Home) */
    var play = false
}

enum Load {
    case none, loading, ready, failed
    init(_ o: JSON, _ key: String = "state") {
        switch o.string(key) {
        case "Ready": self = .ready
        case "Loading": self = .loading
        case "Err": self = .failed
        default: self = .none
        }
    }
}

struct Row: Identifiable {
    var index: Int
    var key: String
    var name: String
    var type: String
    var addon: String
    var discover: String?
    var state: Load
    var items: [Title]
    var id: String { key }

    init(_ o: JSON) {
        index = o.int("index")
        key = o.string("key")
        name = o.string("name")
        type = o.string("type")
        addon = o.string("addon")
        discover = o.text("discover")
        state = Load(o)
        items = o.objects("items").map(Title.init)
    }

    static func list(_ state: JSON?) -> [Row] { state?.objects("catalogs").map(Row.init) ?? [] }

    /** "Popular · Movies": Stremio names rows by catalog and type */
    var heading: String {
        let kind = type == "movie" ? "Movies" : type == "series" ? "Series" : type.capitalized
        return name.localizedCaseInsensitiveContains(kind) || kind.isEmpty ? name : "\(name) \(kind)"
    }
}

struct Continue: Identifiable {
    var title: Title
    var progress: Double
    var videoId: String?
    var newEpisodes: Int
    var id: String { title.id }

    static func list(_ state: JSON?) -> [Continue] {
        state?.objects("items").map { o in
            Continue(title: Title(o), progress: min(max(o.double("progress") / 100, 0), 1), videoId: o.text("videoId"), newEpisodes: o.int("notifications"))
        } ?? []
    }
}

struct Video: Identifiable, Hashable {
    var id: String
    var title: String
    var season: Int?
    var episode: Int?
    var thumbnail: String?
    var released: String?
    var overview: String?
    var watched: Bool
    var progress: Double?
    var upcoming: Bool

    init(_ o: JSON) {
        id = o.string("id")
        title = o.string("title")
        season = o.isNull("season") ? nil : o.int("season")
        episode = o.isNull("episode") ? nil : o.int("episode")
        thumbnail = o.text("thumbnail")
        released = o.text("released")
        overview = o.text("overview")
        watched = o.bool("watched")
        progress = o.isNull("progress") ? nil : o.double("progress") / 100
        upcoming = o.bool("upcoming")
    }

    var releaseDate: Date? {
        guard let released else { return nil }
        return ISO8601DateFormatter.withFraction.date(from: released) ?? ISO8601DateFormatter().date(from: released)
    }
}

extension ISO8601DateFormatter {
    static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

/** A stream as dx.bi's stream list reads it (api.phone.streams: describeStream in the plugin) */
struct StreamOption: Identifiable, Hashable {
    var index: Int
    var play: String
    var addon: String
    var filename: String
    var label: String
    var torrent: Bool
    var provider: String
    var site: String
    var codec: String
    var instant: Bool
    var pending: Bool
    var lesser: Bool
    var res: Int
    var hdr: Bool
    var dv: Bool
    var size: Double
    var seeds: Int
    var source: String
    var langs: [String]
    var id: Int { index }

    init(_ i: Int, _ o: JSON) {
        index = i
        play = o.string("play")
        addon = o.string("addon")
        filename = o.string("filename")
        label = o.string("label")
        torrent = o.bool("torrent")
        provider = o.string("provider")
        site = o.string("site")
        codec = o.string("codec")
        instant = o.bool("instant")
        pending = o.bool("pending")
        lesser = o.bool("lesser")
        res = o.int("res")
        hdr = o.bool("hdr")
        dv = o.bool("dv")
        size = o.double("size")
        seeds = o.int("seeds", -1)
        source = o.string("source")
        langs = o.strings("langs")
    }

    var quality: String {
        switch res {
        case 2160: "4K"
        case 1440: "1440p"
        case 1080: "1080p"
        case 720: "720p"
        case 0: "?"
        default: "SD"
        }
    }

    var sizeText: String? {
        guard size > 0 else { return nil }
        return size >= 1e9 ? String(format: "%.1f GB", size / 1e9) : String(format: "%.0f MB", size / 1e6)
    }

    /** The picture's quality, as the desktop's Best quality sort scores it: resolution, then Dolby Vision or HDR, then the source */
    var score: Int {
        res * 10 + (dv ? 3 : hdr ? 2 : 0) + (["Remux": 4, "BluRay": 3, "WEB": 2, "HDTV": 1, "CAM": -10][source] ?? 0)
    }

    /** Best quality first; of the same quality, ready to play, then most seeds, then largest */
    static func best(_ a: StreamOption, _ b: StreamOption) -> Bool {
        if a.score != b.score { return a.score > b.score }
        if a.instant != b.instant { return a.instant }
        if a.seeds != b.seeds { return a.seeds > b.seeds }
        return a.size > b.size
    }
}

struct StreamChoices {
    var justPlay: Bool
    var settled: Bool
    var videoId: String?
    var pick: Int
    var sameAsLastTime: Bool
    var items: [StreamOption]
    var picked: StreamOption? { items.indices.contains(pick) ? items[pick] : nil }

    init(_ o: JSON) {
        justPlay = o.bool("justPlay")
        settled = o.bool("settled")
        videoId = o.text("videoId")
        pick = o.int("pick", -1)
        sameAsLastTime = o.string("how") == "same"
        items = o.objects("items").enumerated().map { StreamOption($0.offset, $0.element) }
    }
}

struct Details {
    var state: Load
    var metaId: String?
    var videoId: String?
    var title: Title?
    var cast: [String]
    var directors: [String]
    var videos: [Video]
    var resumeVideoId: String?
    var resumeMs: Double
    var durationMs: Double
    /** Changes as addons answer with streams (the stream list is asked for again) */
    var streamsKey: String

    init(_ o: JSON) {
        let meta = o.object("meta")
        let selected = o.object("selected")
        let resume = o.object("resume")
        state = Load(o)
        metaId = selected?.object("metaPath")?.text("id")
        videoId = selected?.object("streamPath")?.text("id")
        title = meta.map(Title.init)
        cast = (meta?.strings("cast") ?? []).map(\.unescaped)
        directors = (meta?.strings("directors") ?? []).map(\.unescaped)
        videos = meta?.objects("videos").map(Video.init) ?? []
        resumeVideoId = resume?.text("videoId")
        resumeMs = resume?.double("timeOffset") ?? 0
        durationMs = resume?.double("duration") ?? 0
        streamsKey = (selected?.object("streamPath")?.string("id") ?? "") + o.objects("streams").map { "\($0.string("state")):\($0.objects("items").count)" }.joined(separator: ",")
    }

    /** Seasons in order, specials (season 0) last */
    var seasons: [Int] {
        Array(Set(videos.compactMap(\.season))).sorted { a, b in a == 0 ? false : b == 0 ? true : a < b }
    }
}

/** Something Discover can switch to: a type or a catalog, with the link that loads it */
struct Pickable: Identifiable, Hashable {
    var name: String
    var selected: Bool
    var link: String?
    var id: String { (link ?? "") + name }
}

struct Discover {
    var request: JSON?
    var types: [Pickable]
    var catalogs: [Pickable]
    var genres: [String]
    var state: Load
    var items: [Title]
    var nextPage: Bool

    init(_ o: JSON) {
        request = o.object("request")
        types = o.objects("types").map { Pickable(name: $0.string("type"), selected: $0.bool("selected"), link: $0.text("link")) }
        catalogs = o.objects("catalogs").map { c in
            let addon = c.string("addon")
            let name = !addon.isEmpty && addon != "Cinemeta" ? "\(c.string("name")) · \(addon)" : c.string("name")
            return Pickable(name: name, selected: c.bool("selected"), link: c.text("link"))
        }
        genres = o.strings("genres")
        state = Load(o)
        items = o.objects("items").map(Title.init)
        nextPage = o.bool("nextPage")
    }

    var genre: String? {
        guard let extra = request?.object("path")?["extra"] as? [Any] else { return nil }
        for case let pair as [Any] in extra where pair.first as? String == "genre" { return pair.last as? String }
        return nil
    }
}

struct Account {
    var signedIn: Bool
    var email: String?
    var avatar: String?

    init?(_ o: JSON?) {
        guard let o else { return nil }
        signedIn = o.bool("signedIn")
        email = o.object("user")?.text("email")
        avatar = o.object("user")?.text("avatar")
    }
}

/** dx.bi's own Home rows (window.__dxbi.phone) */
struct ListRow {
    var name: String
    var items: [Title]
    init(_ o: JSON) {
        name = o.string("name")
        items = o.objects("items").map(Title.init)
    }
}

struct Airing: Identifiable {
    var id: String
    var name: String
    var background: String?
    var still: String?
    var season: Int
    var episode: Int
    var title: String
    var more: Int
    var whenText: String
    var countdown: String
    var out: Bool

    init(_ o: JSON) {
        id = o.string("id")
        name = o.string("name")
        background = o.text("background")
        still = o.text("still")
        season = o.int("season")
        episode = o.int("episode")
        title = o.string("title")
        more = o.int("more")
        whenText = o.string("when")
        countdown = o.string("countdown")
        out = o.bool("out")
    }
}

struct Addon: Identifiable {
    var transportUrl: String
    var addonId: String
    var name: String
    var version: String
    var description: String
    var logo: String?
    var types: [String]
    var official: Bool
    var isProtected: Bool
    var configurable: Bool
    var installed: Bool
    var id: String { transportUrl }

    init(_ o: JSON) {
        transportUrl = o.string("transportUrl")
        addonId = o.string("id")
        name = o.string("name")
        version = o.string("version")
        description = o.string("description")
        logo = o.text("logo")
        types = o.strings("types")
        official = o.bool("official")
        isProtected = o.bool("protected")
        configurable = o.bool("configurable")
        installed = o.bool("installed")
    }

    /** Where the addon lets you set it up (its own web page) */
    var configureURL: URL? { URL(string: transportUrl.replacingOccurrences(of: "manifest.json", with: "configure")) }
}

struct Score: Identifiable {
    var source: String
    var name: String
    var note: String
    var value: String
    var votes: Int
    var url: String?
    var id: String { source + name }
}

struct Review: Identifiable {
    var author: String
    var rating: Double?
    var date: String
    var text: String
    var url: String?
    var id: String { author + date + String(text.prefix(20)) }
}

struct Reviews {
    var scores: [Score]
    var critics: [String]
    var audience: [Review]
    var audienceTotal: Int
    var audienceUrl: String?
    var audienceProblem: String?
    var problem: String?

    init(_ o: JSON) {
        scores = o.objects("scores").map { Score(source: $0.string("source"), name: $0.string("name"), note: $0.string("note"), value: $0.string("value"), votes: $0.int("votes"), url: $0.text("url")) }
        critics = o.object("critics")?.strings("text") ?? []
        let audience = o.object("audience")
        self.audience = audience?.objects("reviews").map {
            Review(author: $0.string("author"), rating: $0.isNull("rating") ? nil : $0.double("rating"), date: $0.string("when"), text: $0.string("text"), url: $0.text("url"))
        } ?? []
        audienceTotal = audience?.int("total") ?? 0
        audienceUrl = audience?.text("url")
        audienceProblem = audience?.text("error")
        problem = o.text("mdbError")
    }
}

/** One of dx.bi's settings, as the TV lists them */
struct Setting: Identifiable {
    struct Option: Hashable {
        var value: String
        var label: String
    }
    var key: String
    var type: String
    var label: String
    var description: String
    var group: String
    var options: [Option]
    /** The value as JSON text (so any kind can be compared and saved back) */
    var value: String
    var id: String { key }

    init(_ o: JSON) {
        key = o.string("key")
        type = o.string("type")
        label = o.string("label")
        description = o.string("description")
        group = o.string("group")
        options = o.objects("options").map { Option(value: Json.encode($0["value"] ?? NSNull()), label: $0.string("label")) }
        value = Json.encode(o["value"] ?? NSNull())
    }

    var isOn: Bool { value == "true" }
    var textValue: String { (Json.decode(value) as? String) ?? (value == "null" ? "" : value) }
}

struct Viewer: Identifiable, Hashable {
    var id: String
    var name: String
}

struct HomeLayout {
    var order: [String] = []
    var hidden: Set<String> = []
    var names: [String: String] = [:]

    init() {}
    init(_ o: JSON?) {
        guard let o else { return }
        order = o.strings("order")
        hidden = Set(o.strings("hidden"))
        names = (o["names"] as? [String: Any])?.compactMapValues { $0 as? String } ?? [:]
    }

    /** Home's rows as the viewer arranged them: their order first, anything new after, hidden ones left out */
    func arrange(_ rows: [Row]) -> [Row] {
        let visible = rows.filter { !hidden.contains($0.key) }.map { r -> Row in
            var r = r
            if let n = names[r.key] { r.name = n }
            return r
        }
        guard !order.isEmpty else { return visible }
        let place = Dictionary(order.enumerated().map { ($1, $0) }, uniquingKeysWith: { a, _ in a })
        return visible.sorted { (place[$0.key] ?? order.count + $0.index) < (place[$1.key] ?? order.count + $1.index) }
    }
}

extension String {
    /** HTML's escapes some addons leave in names and descriptions (Jim O&apos;Heir) */
    var unescaped: String {
        guard contains("&") else { return self }
        return replacingOccurrences(of: "&apos;", with: "'").replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&quot;", with: "\"").replacingOccurrences(of: "&amp;", with: "&")
    }
}

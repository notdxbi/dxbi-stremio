import Foundation
import UIKit
import WebKit

/**
 * Stremio's web app, running out of sight: it does Stremio's work (account, addons, library, finding
 * streams, watch progress) with dx.bi's plugin, and the app's screens show it. The same page and the
 * same scripts as the Android apps (dxbi-tv.js, dxbi-engine.js, dxbi.plugin.js).
 *
 * Android gives the page a `DxbiTV` object it can call and get answers from straight away; a
 * WKWebView can only post messages. So the page gets a stand-in `DxbiTV` (below) that answers from
 * what the app wrote into the page (settings, the plugin, the player's state) and posts the rest.
 *
 * To the page: `window.__dxbiEngine.handle({id, op, args})`, run by [send].
 * From it: `{type: "reply", id, ok, data | error}`, `{type: "state", field, data}` for each watched
 * model as it changes, `{type: "event", event, args}` and `{type: "ready"}`.
 */
@MainActor
final class Page: NSObject {

    static let origin = "https://web.stremio.com"
    static let home = URL(string: "https://web.stremio.com/")!

    struct Failure: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    let webView: WKWebView
    private var ids = 0
    private var pending: [Int: CheckedContinuation<Any?, Error>] = [:]
    private var watched: [String] = []

    /** Stremio's core is up (it starts again with the page) */
    var onReady: (() -> Void)?
    var onGone: (() -> Void)?
    var onState: ((String, JSON?) -> Void)?
    var onEvent: ((String, JSON?) -> Void)?
    /** dxbi-tv.js handing a stream to the player (the play payload), and the watch party steering it */
    var onPlay: ((String) -> Void)?
    var onControl: ((JSON) -> Void)?
    var onToast: ((String) -> Void)?
    var onServersFound: (() -> Void)?

    private let settings = UserDefaults.standard

    override init() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        // Nothing in the page plays by itself (its own player, sounds): it would take over the lock
        // screen's Now Playing and play sound nobody asked for. The app's player does the playing
        config.mediaTypesRequiringUserActionForPlayback = .all
        config.websiteDataStore = .default()
        webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 400, height: 800), configuration: config)
        super.init()
        let controller = config.userContentController
        controller.add(WeakHandler(self), name: "dxbi")
        controller.addUserScript(WKUserScript(source: startScript(), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        // Stremio's web app is made for a computer's browser. dxbi-tv/ tells dx.bi it runs in the app,
        // as on Android (no intro, the app's own player…)
        webView.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15 dxbi-tv/\(Self.version) dxbi-ios"
        #if DEBUG
        webView.isInspectable = true
        #endif
        webView.load(URLRequest(url: Self.home))
        // the clock changes (daylight saving, travelling) while the app is away
        NotificationCenter.default.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.js("window.__dxbiIos && (window.__dxbiIos.utcOffset = \(Self.utcOffset))") }
        }
    }

    static var utcOffset: Int { TimeZone.current.secondsFromGMT() / 60 }

    /** The phone's model identifier (iPhone17,1) */
    static var model: String {
        var info = utsname()
        uname(&info)
        return withUnsafeBytes(of: &info.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
    }

    static var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0" }

    // MARK: - What the page is given before it starts

    private func resource(_ name: String) -> String {
        guard let url = Bundle.main.url(forResource: name, withExtension: nil), let text = try? String(contentsOf: url, encoding: .utf8) else { return "" }
        return text
    }

    private var savedSettings: JSON {
        (settings.string(forKey: "plugin-settings")).flatMap { Json.decode($0) as? JSON } ?? [:]
    }

    private func startScript() -> String {
        let device: JSON = [
            "app": Self.version,
            // (reports show this: the model, e.g. iPhone17,1, and that it's the iPhone app)
            "device": "\(Self.model) · dx.bi for iPhone",
            "ios": UIDevice.current.systemVersion,
            "phone": true,
        ]
        let shim = """
        (function () {
          if (window.DxbiTV) return;
          const post = (message) => { try { window.webkit.messageHandlers.dxbi.postMessage(message); } catch (_) {} };
          const ios = (window.__dxbiIos = { settings: \(Json.encode(savedSettings)), plugin: \(Json.quote(resource("dxbi.plugin.js"))), active: "", pendingClose: "", utcOffset: \(Self.utcOffset) });
          window.DxbiTV = {
            pluginSource: () => ios.plugin,
            getSettings: (t, plugin) => JSON.stringify(ios.settings[plugin] || {}),
            saveSetting: (t, plugin, key, valueJson) => {
              const all = (ios.settings[plugin] = ios.settings[plugin] || {});
              try { all[key] = JSON.parse(valueJson); } catch (_) { all[key] = valueJson; }
              post({ op: "saveSetting", plugin, key, value: valueJson });
            },
            play: (t, json) => post({ op: "play", json }),
            activePlayback: () => ios.active || "",
            takePendingClose: () => { const c = ios.pendingClose; ios.pendingClose = ""; return c || ""; },
            control: (t, json) => post({ op: "control", json }),
            openExternal: (t, url) => post({ op: "openExternal", url }),
            toast: (t, text) => post({ op: "toast", text }),
            engine: (t, json) => post({ op: "engine", json }),
            findServers: () => post({ op: "findServers" }),
            // Whether the streaming server answers (the page itself isn't allowed to reach an http:// one)
            serverUp: (t, url) => new Promise((resolve) => {
              const id = (ios.asked = (ios.asked || 0) + 1);
              (ios.answers = ios.answers || {})[id] = resolve;
              post({ op: "serverUp", id, url });
              setTimeout(() => { if (ios.answers[id]) { delete ios.answers[id]; resolve(false); } }, 8000);
            }),
            deviceInfo: () => \(Json.quote(Json.encode(device))),
            // minutes ahead of UTC on the phone's own clock (the plugin's deviceClock: times as the phone shows them)
            utcOffset: () => ios.utcOffset,
            isPhone: () => true,
            version: () => \(Json.quote(Self.version)),
            // (no torrentUrl: an iPhone can't download torrents itself; a streaming server plays them)
          };
        })();
        """
        return [shim, resource("dxbi-tv.js"), resource("dxbi-engine.js")].joined(separator: "\n;\n")
    }

    // MARK: - Running things in the page

    func js(_ script: String) {
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    /** Asks the page for something and waits for its answer (a JSON object, array, string, number… or nil) */
    func call(_ op: String, _ args: JSON = [:], timeout: Double = 20) async throws -> Any? {
        ids += 1
        let id = ids
        return try await withCheckedThrowingContinuation { continuation in
            pending[id] = continuation
            send(op, args, id: id)
            Task { @MainActor [weak self] in
                try? await Task.sleep(for: .seconds(timeout))
                self?.pending.removeValue(forKey: id)?.resume(throwing: Failure(message: "The page didn't answer"))
            }
        }
    }

    /** Fire and forget */
    func send(_ op: String, _ args: JSON = [:], id: Int = 0) {
        let message: JSON = ["id": id, "op": op, "args": args]
        js("window.__dxbiEngine && window.__dxbiEngine.handle(\(Json.encode(message)))")
    }

    /** Keeps [field] coming as it changes (onState) */
    func watch(_ field: String) {
        guard !watched.contains(field) else { return }
        watched.append(field)
        send("watch", ["fields": watched])
    }

    private func engineMessage(_ text: String) {
        guard let message = Json.decode(text) as? JSON else { return }
        switch message.string("type") {
        case "reply":
            guard let answer = pending.removeValue(forKey: message.int("id")) else { return }
            if message.bool("ok") {
                let data = message["data"]
                answer.resume(returning: data is NSNull ? nil : data)
            } else {
                answer.resume(throwing: Failure(message: message.text("error") ?? "the page couldn't do that"))
            }
        case "state":
            onState?(message.string("field"), message.object("data"))
        case "ready":
            // a page that started again has forgotten what was watched
            if !watched.isEmpty { send("watch", ["fields": watched]) }
            onReady?()
        case "event":
            onEvent?(message.string("event"), message.object("args"))
        default:
            break
        }
    }

    private func saveSetting(plugin: String, key: String, valueJson: String) {
        var all = savedSettings
        var mine = all[plugin] as? JSON ?? [:]
        mine[key] = Json.decode(valueJson) ?? NSNull()
        all[plugin] = mine
        settings.set(Json.encode(all), forKey: "plugin-settings")
    }

    /** Stremio's streaming server at [address] answers (its settings, as Stremio asks for them) */
    nonisolated static func serverAnswers(_ address: String) async -> Bool {
        guard let base = URL(string: address.hasSuffix("/") ? address : address + "/"),
              base.scheme == "http" || base.scheme == "https" else { return false }
        var request = URLRequest(url: base.appending(path: "settings"), cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 6)
        request.httpMethod = "GET"
        guard let (_, response) = try? await URLSession.shared.data(for: request) else { return false }
        return ((response as? HTTPURLResponse)?.statusCode ?? 0) < 500
    }

    fileprivate func received(_ message: WKScriptMessage) {
        // Only Stremio's own page, not a trailer or anything else it embeds
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.host == "web.stremio.com",
              let body = message.body as? JSON else { return }
        switch body.string("op") {
        case "engine": engineMessage(body.string("json"))
        case "play": onPlay?(body.string("json"))
        case "control": if let c = Json.decode(body.string("json")) as? JSON { onControl?(c) }
        case "saveSetting": saveSetting(plugin: body.string("plugin"), key: body.string("key"), valueJson: body.string("value"))
        case "openExternal": if let url = URL(string: body.string("url")) { UIApplication.shared.open(url) }
        case "toast": onToast?(body.string("text"))
        case "serverUp":
            let id = body.int("id")
            Task { @MainActor in
                let up = await Self.serverAnswers(body.string("url"))
                js("(function (a) { const f = a && a[\(id)]; if (f) { delete a[\(id)]; f(\(up)); } })(window.__dxbiIos && window.__dxbiIos.answers)")
            }
        case "findServers":
            // (not looked for yet on iPhone: Settings → Streaming server takes an address)
            js("window.__dxbiTv && window.__dxbiTv.serversFound && window.__dxbiTv.serversFound([])")
        default: break
        }
    }
}

extension Page: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .allow }
        // Embedded trailers stay in the page
        if action.targetFrame?.isMainFrame == false || url.host == "web.stremio.com" || url.scheme == "about" { return .allow }
        if url.scheme == "stremio" { return .cancel }
        // Everything else leaves the app (sign-in pages, links in descriptions…)
        await UIApplication.shared.open(url)
        return .cancel
    }

    // The page's engine crashed, or iOS took its memory back: start it again
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        for (_, answer) in pending { answer.resume(throwing: Failure(message: "The page restarted")) }
        pending.removeAll()
        onGone?()
        webView.load(URLRequest(url: Self.home))
    }
}

/** WKUserContentController keeps its handlers: this keeps it from keeping the page */
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var page: Page?
    init(_ page: Page) { self.page = page }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        MainActor.assumeIsolated { page?.received(message) }
    }
}

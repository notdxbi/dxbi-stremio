import Foundation
import Observation
import UIKit

/**
 * Films and episodes saved to watch offline, as on Android: a stream (an addon's link, debrid ones
 * included) downloads in the background, iOS carrying on while the app is away, with up to three of
 * its subtitles alongside, and plays from the phone in dx.bi's player, picking up where it was left.
 *
 * Each lives in Application Support/Downloads/<id>/: item.json (the page's play payload, as it was
 * handed over), the video, and its subtitle files.
 */
@MainActor
@Observable
final class Downloads: NSObject {

    static let shared = Downloads()

    struct Item: Identifiable {
        enum State: String { case downloading, done, failed }
        var id: String
        var payload: JSON
        var state: State
        var written: Int64 = 0
        var expected: Int64 = 0
        /** The video's file name in its folder, once it's downloaded */
        var file: String?

        var title: String { payload.string("title") }
        var subtitle: String { payload.string("subtitle") }
        var art: URL? { URL(string: payload.text("background") ?? payload.string("poster")) }
        var progress: Double { expected > 0 ? Double(written) / Double(expected) : 0 }
    }

    private(set) var items: [Item] = []

    /** For its messages */
    @ObservationIgnored weak var stremio: Stremio?

    /** iOS finishing downloads while the app was away (AppDelegate hands it over) */
    @ObservationIgnored var backgroundDone: (() -> Void)?

    @ObservationIgnored private lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: "com.notdxbi.dxbi.downloads")
        config.sessionSendsLaunchEvents = true
        config.isDiscretionary = false
        return URLSession(configuration: config, delegate: self, delegateQueue: .main)
    }()

    nonisolated private static let folder: URL = {
        var base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Downloads", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        // (films are big, and can be downloaded again: not in the phone's backups)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? base.setResourceValues(values)
        return base
    }()

    nonisolated private static func folder(_ id: String) -> URL { folder.appendingPathComponent(id, isDirectory: true) }

    override init() {
        super.init()
        load()
        // downloads that were running when the app last closed carry on in iOS's hands
        session.getAllTasks { tasks in
            let running = Set(tasks.compactMap(\.taskDescription))
            DispatchQueue.main.async {
                for i in self.items.indices where self.items[i].state == .downloading && !running.contains(self.items[i].id) {
                    self.items[i].state = .failed
                }
            }
        }
    }

    // MARK: - Keeping them

    private func load() {
        let ids = (try? FileManager.default.contentsOfDirectory(atPath: Self.folder.path)) ?? []
        items = ids.compactMap { id in
            guard let data = try? Data(contentsOf: Self.folder(id).appendingPathComponent("item.json")),
                  let o = (try? JSONSerialization.jsonObject(with: data)) as? JSON, let payload = o.object("payload") else { return nil }
            return Item(id: id, payload: payload, state: Item.State(rawValue: o.string("state")) ?? .failed,
                        written: Int64(o.int("written")), expected: Int64(o.int("expected")), file: o.text("file"))
        }
        .sorted { $0.state != .done && $1.state == .done }
    }

    private func save(_ item: Item) {
        let o: JSON = ["payload": item.payload, "state": item.state.rawValue, "written": item.written, "expected": item.expected, "file": item.file ?? NSNull()]
        guard let data = try? JSONSerialization.data(withJSONObject: o) else { return }
        try? data.write(to: Self.folder(item.id).appendingPathComponent("item.json"))
    }

    private func update(_ id: String, persist: Bool = true, _ change: (inout Item) -> Void) {
        guard let i = items.firstIndex(where: { $0.id == id }) else { return }
        change(&items[i])
        if persist { save(items[i]) }
    }

    private func say(_ text: String) { stremio?.show(text) }

    // MARK: - Adding, removing

    /** A stream the page handed over (its play payload) */
    func add(_ payload: JSON) {
        guard let url = URL(string: payload.string("url")), url.scheme?.hasPrefix("http") == true else {
            return say("Only debrid and direct streams can be downloaded")
        }
        // (the same stream always gets the same folder)
        let key = payload.string("hash") + "|" + payload.string("videoId")
        let id = String(key.utf8.reduce(UInt64(5381)) { ($0 &* 33) &+ UInt64($1) }, radix: 36)
        if let existing = items.first(where: { $0.id == id }), existing.state != .failed {
            return say(existing.state == .done ? "Already downloaded" : "Already downloading")
        }
        try? FileManager.default.createDirectory(at: Self.folder(id), withIntermediateDirectories: true)
        let item = Item(id: id, payload: payload, state: .downloading)
        items.removeAll { $0.id == id }
        items.insert(item, at: 0)
        save(item)
        say("Downloading \(item.title)")
        Task {
            // subtitles are small: saved first (up to three, already ordered by language)
            var saved: [JSON] = []
            for (i, s) in payload.objects("subtitles").prefix(3).enumerated() {
                guard let subURL = URL(string: s.string("url")), let (data, _) = try? await URLSession.shared.data(from: subURL) else { continue }
                let name = "sub\(i).\(subURL.pathExtension.isEmpty || subURL.pathExtension.count > 4 ? "srt" : subURL.pathExtension)"
                guard (try? data.write(to: Self.folder(id).appendingPathComponent(name))) != nil else { continue }
                var local = s
                local["file"] = name
                saved.append(local)
            }
            var withSubtitles = payload
            withSubtitles["subtitles"] = saved
            update(id) { $0.payload = withSubtitles }
            var request = URLRequest(url: url)
            for (k, v) in payload.object("headers") ?? [:] {
                if let v = v as? String { request.setValue(v, forHTTPHeaderField: k) }
            }
            let task = session.downloadTask(with: request)
            task.taskDescription = id
            task.resume()
        }
    }

    func remove(_ item: Item) {
        session.getAllTasks { tasks in tasks.filter { $0.taskDescription == item.id }.forEach { $0.cancel() } }
        try? FileManager.default.removeItem(at: Self.folder(item.id))
        UserDefaults.standard.removeObject(forKey: "download.at.\(item.id)")
        items.removeAll { $0.id == item.id }
    }

    // MARK: - Playing

    /** The payload to play a download with: from the phone, where it was left, no up-next (that's online) */
    func playback(_ item: Item) -> JSON? {
        guard item.state == .done, let file = item.file else { return nil }
        var p = item.payload
        p["url"] = Self.folder(item.id).appendingPathComponent(file).path
        p["offline"] = item.id
        p["startMs"] = UserDefaults.standard.double(forKey: "download.at.\(item.id)")
        p["next"] = NSNull()
        p["skips"] = [Any]()
        p["headers"] = [String: String]()
        p["subtitles"] = item.payload.objects("subtitles").compactMap { s -> JSON? in
            guard let name = s.text("file") else { return nil }
            var local = s
            local["url"] = Self.folder(item.id).appendingPathComponent(name).path
            return local
        }
        return p
    }

    /** Where a download was left (the player says when it closes) */
    func leftAt(_ id: String, ms: Double, ended: Bool) {
        UserDefaults.standard.set(ended ? 0 : ms, forKey: "download.at.\(id)")
    }
}

extension Downloads: URLSessionDownloadDelegate {
    nonisolated func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData _: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard let id = downloadTask.taskDescription else { return }
        MainActor.assumeIsolated {
            update(id, persist: false) {
                $0.written = totalBytesWritten
                $0.expected = max(totalBytesExpectedToWrite, 0)
            }
        }
    }

    nonisolated func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let id = downloadTask.taskDescription else { return }
        // (the file has to be moved before this returns: iOS deletes it after)
        let original = downloadTask.originalRequest?.url
        let ext = [downloadTask.response?.suggestedFilename.map { URL(fileURLWithPath: $0).pathExtension }, original?.pathExtension]
            .compactMap { $0 }.first { !$0.isEmpty && $0.count <= 4 } ?? "mkv"
        let name = "video.\(ext)"
        let target = Self.folder(id).appendingPathComponent(name)
        try? FileManager.default.removeItem(at: target)
        let moved = (try? FileManager.default.moveItem(at: location, to: target)) != nil
        let ok = moved && ((downloadTask.response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? true)
        MainActor.assumeIsolated {
            update(id) {
                $0.state = ok ? .done : .failed
                $0.file = ok ? name : nil
                if ok { $0.written = max($0.written, $0.expected) }
            }
            if let item = items.first(where: { $0.id == id }) { say(ok ? "Downloaded \(item.title)" : "\(item.title) couldn't be downloaded") }
        }
    }

    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let id = task.taskDescription, let error, (error as NSError).code != NSURLErrorCancelled else { return }
        MainActor.assumeIsolated { update(id) { $0.state = .failed } }
    }

    nonisolated func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        MainActor.assumeIsolated {
            backgroundDone?()
            backgroundDone = nil
        }
    }
}

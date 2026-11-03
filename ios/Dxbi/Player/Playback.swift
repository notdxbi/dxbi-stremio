import AVFoundation
import Foundation
import MediaPlayer
import Observation
import UIKit

/**
 * One stream playing: what the page handed over (dxbi-tv.js's play payload), the player, and what
 * goes back to the page (watch progress, the watch party, how it closed).
 */
@MainActor
@Observable
final class Playback: Identifiable {

    struct Segment {
        var type: String
        var start: Double
        var end: Double
        var label: String { type == "intro" ? "Skip Intro" : type == "recap" ? "Skip Recap" : "Skip Credits" }
    }

    struct Subtitle {
        var url: String
        var label: String
        var lang: String
        /** "stream": comes with this stream; "addon": a subtitle addon's search by title (may not fit) */
        var source: String
    }

    /** How the picture fits the screen */
    enum Fit: String, CaseIterable {
        case fit = "Fit", fill = "Fill", stretch = "Stretch"
        var gravity: AVLayerVideoGravity { self == .fit ? .resizeAspect : self == .fill ? .resizeAspectFill : .resize }
    }

    let id = UUID()
    let payload: JSON
    let mpv: MPV
    @ObservationIgnored let pip: PictureInPicture
    @ObservationIgnored private weak var stremio: Stremio?

    let title: String
    let subtitle: String
    let accent: UIColor
    let segments: [Segment]
    let autoSkip: String
    let nextTitle: String?
    let nextArt: URL?
    let upNextSeconds: Int
    let subtitles: [Subtitle]

    // what the screen shows (copied from mpv as it changes)
    var position: Double = 0
    var duration: Double = 0
    var paused = false
    var buffering = true
    var speed: Double = 1
    var tracks: [MPV.Track] = []
    var fit = Fit.fit {
        didSet { mpv.gravity(fit.gravity) }
    }
    var party: (code: String, people: [String])?
    var flash: String?

    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private var lastReport: Date = .distantPast
    @ObservationIgnored private var skipped: Set<String> = []
    @ObservationIgnored private var closing = false
    @ObservationIgnored private var artwork: MPMediaItemArtwork?
    @ObservationIgnored private var tracksTask: Task<Void, Never>?

    init(payload: JSON, stremio: Stremio) {
        self.payload = payload
        self.stremio = stremio
        title = payload.string("title")
        subtitle = payload.string("subtitle")
        accent = UIColor(hex: payload.string("accent")) ?? UIColor(red: 0.9, green: 0.04, blue: 0.08, alpha: 1)
        segments = payload.objects("skips").compactMap { o in
            let type = o.string("type")
            guard ["intro", "recap", "credits"].contains(type) else { return nil }
            return Segment(type: type, start: o.double("start"), end: o.isNull("end") ? -1 : o.double("end", -1))
        }
        autoSkip = payload.text("autoSkip") ?? "off"
        let next = payload.object("next")
        nextTitle = next?.text("title")
        nextArt = next?.text("thumbnail").flatMap(URL.init(string:))
        upNextSeconds = next == nil ? 0 : Int(payload.text("upNext") ?? "10") ?? 0
        subtitles = payload.objects("subtitles").compactMap { s in
            guard let url = s.text("url") else { return nil }
            return Subtitle(url: url, label: s.text("label") ?? s.string("lang"), lang: s.string("lang"), source: s.text("source") ?? "addon")
        }
        let player = MPV()
        mpv = player
        pip = PictureInPicture(mpv: player)
        start()
    }

    private func start() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)
        UIApplication.shared.isIdleTimerDisabled = true
        UIApplication.shared.beginReceivingRemoteControlEvents()
        mpv.onChange = { [weak self] in self?.update() }
        mpv.onLoaded = { [weak self] in self?.loaded() }
        mpv.onEnd = { [weak self] ended, error in
            guard let self else { return }
            if ended { self.finish(ended: true, next: self.nextTitle != nil && self.upNextSeconds > 0) }
            else { self.finish(ended: false, error: error) }
        }
        let headers = (payload.object("headers") ?? [:]).compactMapValues { $0 as? String }
        if let size = payload.object("subtitleStyle")?.double("size"), size > 0 { mpv.subtitleScale(size / 100) }
        mpv.gravity(fit.gravity)
        mpv.load(payload.string("url"), start: payload.double("startMs") / 1000, headers: headers, audioLanguage: payload.text("audioLanguage"))
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
        remoteCommands()
        nowPlaying()
        loadArtwork()
    }

    private func loaded() {
        for s in subtitles { mpv.addSubtitle(s.url, title: s.label, lang: s.lang) }
    }

    private func update() {
        // (only what changed: each change redraws what shows it, open menus included)
        if position != mpv.position { position = mpv.position }
        if duration != mpv.duration { duration = mpv.duration }
        if paused != mpv.paused { paused = mpv.paused; nowPlaying() }
        if buffering != mpv.buffering { buffering = mpv.buffering }
        if speed != mpv.speed { speed = mpv.speed; nowPlaying() }
        if tracks != mpv.tracks { settleTracks() }
        pip.refresh()
        autoSkipIfDue()
    }

    private func tick() {
        guard !closing else { return }
        stremio?.partyTick(position: position, duration: duration, paused: paused, buffering: buffering, rate: speed)
        // Stremio's watch progress, every few seconds
        if Date().timeIntervalSince(lastReport) > 5, mpv.started {
            lastReport = Date()
            stremio?.progress(position: position, duration: duration, paused: paused)
        }
        nowPlaying()
    }

    // MARK: - Skip intro, up next

    /** The intro, recap or credits playing now */
    var segment: Segment? {
        segments.first { s in position >= s.start && position < (s.end > 0 ? s.end : duration) - 1 && !(s.type == "credits" && nextTitle != nil) }
    }

    func skip() {
        guard let s = segment else { return }
        skipped.insert("\(s.type)\(s.start)")
        if s.end > 0 { mpv.seek(to: s.end) } else { finish(ended: true, next: nextTitle != nil) }
    }

    private func autoSkipIfDue() {
        guard autoSkip != "off", let s = segment, !skipped.contains("\(s.type)\(s.start)") else { return }
        if autoSkip == "all" || (autoSkip == "intro" && s.type != "credits") { skip() }
    }

    /** The end credits of an episode with another after it: Up Next shows (from the credits, or the last seconds) */
    var upNextDue: Bool {
        guard nextTitle != nil, upNextSeconds > 0, duration > 60 else { return false }
        if let credits = segments.first(where: { $0.type == "credits" }) { return position >= credits.start }
        return duration - position <= Double(upNextSeconds) + 20
    }

    func playNext() { finish(ended: true, next: true) }

    // MARK: - Subtitles and sound

    /**
     * The first list straight away; changes after that once they stop coming. Subtitle files arrive one
     * by one for a while after the start, and each change redrew an open subtitle menu, jumping it about
     */
    private func settleTracks() {
        guard !tracks.isEmpty else { tracks = mpv.tracks; return }
        tracksTask?.cancel()
        tracksTask = Task {
            try? await Task.sleep(for: .seconds(1.5))
            if !Task.isCancelled { tracks = mpv.tracks }
        }
    }

    var audioTracks: [MPV.Track] { tracks.filter { $0.type == "audio" } }
    var subtitleTracks: [MPV.Track] { tracks.filter { $0.type == "sub" } }

    /** Where a subtitle comes from: in the video, with this stream, or a subtitle addon's guess */
    func source(of track: MPV.Track) -> String {
        guard track.external else { return "video" }
        return subtitles.first { $0.url == track.file }?.source ?? "addon"
    }

    // MARK: - From the page's watch party

    func control(_ c: JSON) {
        switch c.string("cmd") {
        case "play": mpv.play()
        case "pause": mpv.pause()
        case "seek": mpv.seek(to: c.double("ms") / 1000)
        case "rate": mpv.setSpeed(c.double("rate", 1))
        case "close": finish(ended: false)
        case "party": party = c.bool("on") ? (c.string("code"), c.strings("people")) : nil
        case "toast": show(c.string("text"))
        default: break
        }
    }

    func show(_ text: String) {
        flash = text
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2.5))
            if flash == text { flash = nil }
        }
    }

    // MARK: - Lock screen and Control Centre

    private func nowPlaying() {
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: subtitle.isEmpty ? title : subtitle,
            MPMediaItemPropertyArtist: subtitle.isEmpty ? "" : title,
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
            MPNowPlayingInfoPropertyPlaybackRate: paused ? 0 : speed,
        ]
        if let artwork { info[MPMediaItemPropertyArtwork] = artwork }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    /** The title's poster, for the lock screen and Control Centre */
    private func loadArtwork() {
        guard let url = URL(string: payload.text("poster") ?? payload.string("background")) else { return }
        Task {
            guard let (data, _) = try? await URLSession.shared.data(from: url), let image = UIImage(data: data) else { return }
            artwork = Self.artwork(image)
            nowPlaying()
        }
    }

    /** (iOS asks for the picture from its own thread: the closure mustn't belong to the main one) */
    nonisolated private static func artwork(_ image: UIImage) -> MPMediaItemArtwork {
        MPMediaItemArtwork(boundsSize: image.size) { @Sendable _ in image }
    }

    private func remoteCommands() {
        let center = MPRemoteCommandCenter.shared()
        for command in [center.playCommand, center.pauseCommand, center.togglePlayPauseCommand, center.skipForwardCommand,
                        center.skipBackwardCommand, center.changePlaybackPositionCommand] {
            command.isEnabled = true
        }
        center.playCommand.addTarget { [weak self] _ in self?.mpv.play(); return .success }
        center.pauseCommand.addTarget { [weak self] _ in self?.mpv.pause(); return .success }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in self?.mpv.toggle(); return .success }
        center.skipForwardCommand.preferredIntervals = [10]
        center.skipBackwardCommand.preferredIntervals = [10]
        center.skipForwardCommand.addTarget { [weak self] e in self?.mpv.seek(by: (e as? MPSkipIntervalCommandEvent)?.interval ?? 10); return .success }
        center.skipBackwardCommand.addTarget { [weak self] e in self?.mpv.seek(by: -((e as? MPSkipIntervalCommandEvent)?.interval ?? 10)); return .success }
        center.changePlaybackPositionCommand.addTarget { [weak self] e in
            if let e = e as? MPChangePlaybackPositionCommandEvent { self?.mpv.seek(to: e.positionTime) }
            return .success
        }
        if nextTitle != nil {
            center.nextTrackCommand.isEnabled = true
            center.nextTrackCommand.addTarget { [weak self] _ in self?.playNext(); return .success }
        }
    }

    private func clearRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()
        for command in [center.playCommand, center.pauseCommand, center.togglePlayPauseCommand, center.skipForwardCommand,
                        center.skipBackwardCommand, center.changePlaybackPositionCommand, center.nextTrackCommand] {
            command.removeTarget(nil)
        }
        center.nextTrackCommand.isEnabled = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    // MARK: - Closing

    func finish(ended: Bool, error: String? = nil, next: Bool = false) {
        guard !closing else { return }
        closing = true
        timer?.invalidate()
        let at = position, length = duration
        pip.end()
        mpv.quit()
        UIApplication.shared.isIdleTimerDisabled = false
        clearRemoteCommands()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        stremio?.closed(position: at, duration: length, ended: ended, error: error, next: next)
    }
}

extension UIColor {
    convenience init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        guard s.hasPrefix("#") else { return nil }
        s.removeFirst()
        guard s.count == 6 || s.count == 8, let v = UInt64(s, radix: 16) else { return nil }
        let rgb = s.count == 8 ? v >> 8 : v
        self.init(red: CGFloat((rgb >> 16) & 0xff) / 255, green: CGFloat((rgb >> 8) & 0xff) / 255, blue: CGFloat(rgb & 0xff) / 255, alpha: 1)
    }
}

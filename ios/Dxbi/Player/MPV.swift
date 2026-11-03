import AVFoundation
import CoreMedia
import Foundation
import MPVKit
import UIKit

/**
 * mpv (through MPVKit) playing what Apple's player can't (MKV, HEVC, Dolby and DTS sound, ASS
 * subtitles), which is most of what addons find. It draws into an AVSampleBufferDisplayLayer
 * (mpv's avfoundation output), the kind of layer picture in picture can take over.
 */
final class MPV {

    struct Track: Identifiable, Hashable {
        var id: Int
        var type: String
        var title: String
        var lang: String
        var codec: String
        var external: Bool
        var file: String
        var selected: Bool
    }

    /** What the player shows changes: always told on the main thread */
    var onChange: (() -> Void)?
    /** The file ended (true) or couldn't play (the reason) */
    var onEnd: ((Bool, String?) -> Void)?
    var onLoaded: (() -> Void)?

    private(set) var position: Double = 0
    private(set) var duration: Double = 0
    private(set) var paused = false
    private(set) var buffering = true
    private(set) var speed: Double = 1
    private(set) var tracks: [Track] = []
    private(set) var started = false

    let layer = AVSampleBufferDisplayLayer()
    /** The layer's clock: the frames mpv sends are stamped from it, and picture in picture reads it */
    private var timebase: CMTimebase?
    private var handle: OpaquePointer?
    private let queue = DispatchQueue(label: "dxbi.mpv", qos: .userInitiated)

    init() {
        layer.videoGravity = .resizeAspect
        layer.preventsDisplaySleepDuringVideoPlayback = true
        layer.backgroundColor = UIColor.black.cgColor
        if CMTimebaseCreateWithSourceClock(allocator: kCFAllocatorDefault, sourceClock: CMClockGetHostTimeClock(), timebaseOut: &timebase) == noErr, let timebase {
            CMTimebaseSetTime(timebase, time: .zero)
            CMTimebaseSetRate(timebase, rate: 0)
            layer.controlTimebase = timebase
        }
        guard let mpv = mpv_create() else { return }
        handle = mpv
        option("wid", layer)
        set("vo", "avfoundation")
        // subtitles drawn into the picture, so they show in picture in picture too
        set("avfoundation-composite-osd", "yes")
        set("hwdec", "videotoolbox")
        set("hwdec-software-fallback", "yes")
        set("video-rotate", "no")
        // (the end of a file is reported as its end, for Up Next)
        set("keep-open", "no")
        set("idle", "yes")
        set("subs-fallback", "yes")
        set("cache", "yes")
        set("demuxer-max-bytes", "150MiB")
        set("demuxer-max-back-bytes", "50MiB")
        set("network-timeout", "30")
        set("user-agent", "Mozilla/5.0 dx.bi")
        set("sub-ass-override", "scale")
        mpv_request_log_messages(mpv, "no")
        mpv_initialize(mpv)
        for (name, format) in [("time-pos", MPV_FORMAT_DOUBLE), ("duration", MPV_FORMAT_DOUBLE), ("pause", MPV_FORMAT_FLAG),
                               ("paused-for-cache", MPV_FORMAT_FLAG), ("speed", MPV_FORMAT_DOUBLE), ("track-list", MPV_FORMAT_NONE),
                               ("seeking", MPV_FORMAT_FLAG), ("core-idle", MPV_FORMAT_FLAG)] {
            mpv_observe_property(mpv, 0, name, format)
        }
        mpv_set_wakeup_callback(mpv, { context in
            guard let context else { return }
            Unmanaged<MPV>.fromOpaque(context).takeUnretainedValue().readEvents()
        }, Unmanaged.passUnretained(self).toOpaque())
    }

    deinit { quit() }

    /** Stops for good (mpv's own thread finishes in the background) */
    func quit() {
        guard let mpv = handle else { return }
        handle = nil
        mpv_set_wakeup_callback(mpv, nil, nil)
        // (after anything still on its way to it)
        control.async { mpv_terminate_destroy(mpv) }
        layer.sampleBufferRenderer.flush(removingDisplayedImage: true, completionHandler: nil)
    }

    // MARK: - Setting up

    private func set(_ name: String, _ value: String) {
        guard let handle else { return }
        mpv_set_option_string(handle, name, value)
    }

    private func option(_ name: String, _ layer: CALayer) {
        guard let handle else { return }
        var pointer = Int64(Int(bitPattern: Unmanaged.passUnretained(layer).toOpaque()))
        mpv_set_option(handle, name, MPV_FORMAT_INT64, &pointer)
    }

    // Everything asked of mpv goes through its own queue: mpv can take a moment to answer (opening a
    // stream, fetching a subtitle file), and waiting on the main thread held up the whole screen
    private let control = DispatchQueue(label: "dxbi.mpv.control", qos: .userInitiated)

    func property(_ name: String, _ value: String) {
        control.async { [weak self] in
            guard let handle = self?.handle else { return }
            mpv_set_property_string(handle, name, value)
        }
    }

    /** [wait]: false runs it in mpv's background (subtitle downloads), so nothing queues behind it */
    func command(_ args: [String], wait: Bool = true) {
        control.async { [weak self] in
            guard let handle = self?.handle else { return }
            var cargs: [UnsafePointer<CChar>?] = args.map { UnsafePointer(strdup($0)) }
            cargs.append(nil)
            defer { for p in cargs where p != nil { free(UnsafeMutablePointer(mutating: p)) } }
            if wait { mpv_command(handle, &cargs) } else { mpv_command_async(handle, 0, &cargs) }
        }
    }

    private func string(_ name: String) -> String? {
        guard let handle, let c = mpv_get_property_string(handle, name) else { return nil }
        defer { mpv_free(c) }
        return String(cString: c)
    }

    // MARK: - Playing

    func load(_ url: String, start: Double, headers: [String: String], audioLanguage: String?) {
        let fields = headers.map { "\($0.key): \($0.value)" }.joined(separator: ",")
        property("http-header-fields", fields)
        property("start", start > 0 ? String(format: "%.2f", start) : "none")
        if let audioLanguage, !audioLanguage.isEmpty { property("alang", "\(audioLanguage),eng,en") }
        command(["loadfile", url, "replace"])
    }

    /** A subtitle file, listed but not shown until it's chosen */
    func addSubtitle(_ url: String, title: String, lang: String) {
        command(["sub-add", url, "auto", title, lang], wait: false)
    }

    // (shown at once: the button doesn't wait for mpv to say so)
    func play() { paused = false; property("pause", "no"); onChange?() }
    func pause() { paused = true; property("pause", "yes"); onChange?() }
    func toggle() { paused ? play() : pause() }
    func seek(to seconds: Double) { command(["seek", String(format: "%.3f", max(0, seconds)), "absolute+exact"]) }
    func seek(by seconds: Double) { command(["seek", String(format: "%.3f", seconds), "relative+exact"]) }
    func setSpeed(_ rate: Double) { property("speed", String(format: "%.2f", rate)) }
    func select(_ type: String, _ id: Int?) { property(type == "audio" ? "aid" : "sid", id.map(String.init) ?? "no") }
    /** Fit the screen, fill it (cropping the edges) or stretch to it */
    func gravity(_ g: AVLayerVideoGravity) { layer.videoGravity = g }
    func subtitleScale(_ scale: Double) { property("sub-scale", String(format: "%.2f", scale)) }
    func subtitleDelay(_ seconds: Double) { property("sub-delay", String(format: "%.2f", seconds)) }

    /** Keeps the layer's clock with mpv's: where it is, and how fast it's going */
    private func clock() {
        guard let timebase else { return }
        CMTimebaseSetTime(timebase, time: CMTime(seconds: position, preferredTimescale: 1000))
        CMTimebaseSetRate(timebase, rate: paused ? 0 : speed)
    }

    // MARK: - Hearing back

    private func readTracks() -> [Track] {
        let count = Int(string("track-list/count") ?? "0") ?? 0
        return (0..<count).map { i in
            let p = "track-list/\(i)/"
            return Track(
                id: Int(string(p + "id") ?? "0") ?? 0,
                type: string(p + "type") ?? "",
                title: string(p + "title") ?? "",
                lang: string(p + "lang") ?? "",
                codec: string(p + "codec") ?? "",
                external: string(p + "external") == "yes",
                file: string(p + "external-filename") ?? "",
                selected: string(p + "selected") == "yes"
            )
        }
    }

    private func readEvents() {
        queue.async { [weak self] in
            guard let self else { return }
            while let handle = self.handle {
                guard let event = mpv_wait_event(handle, 0)?.pointee, event.event_id != MPV_EVENT_NONE else { break }
                switch event.event_id {
                case MPV_EVENT_PROPERTY_CHANGE:
                    guard let property = UnsafePointer<mpv_event_property>(OpaquePointer(event.data))?.pointee else { break }
                    let name = String(cString: property.name)
                    let double = property.format == MPV_FORMAT_DOUBLE ? property.data?.assumingMemoryBound(to: Double.self).pointee : nil
                    let flag = property.format == MPV_FORMAT_FLAG ? (property.data?.assumingMemoryBound(to: Int32.self).pointee ?? 0) != 0 : nil
                    let tracks = name == "track-list" ? self.readTracks() : nil
                    DispatchQueue.main.async {
                        switch name {
                        case "time-pos": if let double { self.position = double; if double > 0 { self.started = true } }
                        case "duration": if let double { self.duration = double }
                        case "pause": if let flag { self.paused = flag }
                        case "paused-for-cache": if let flag { self.buffering = flag }
                        case "seeking": if let flag, flag { self.buffering = true }
                        case "core-idle": if let flag, !flag { self.buffering = false }
                        case "speed": if let double { self.speed = double }
                        case "track-list": if let tracks { self.tracks = tracks }
                        default: break
                        }
                        self.clock()
                        self.onChange?()
                    }
                case MPV_EVENT_FILE_LOADED:
                    DispatchQueue.main.async {
                        self.buffering = false
                        self.onLoaded?()
                        self.onChange?()
                    }
                case MPV_EVENT_END_FILE:
                    guard let end = UnsafePointer<mpv_event_end_file>(OpaquePointer(event.data))?.pointee else { break }
                    let reason = end.reason
                    let error = end.error < 0 ? String(cString: mpv_error_string(end.error)) : nil
                    DispatchQueue.main.async {
                        if reason == MPV_END_FILE_REASON_EOF { self.onEnd?(true, nil) }
                        else if reason == MPV_END_FILE_REASON_ERROR { self.onEnd?(false, error ?? "it couldn't be opened") }
                    }
                case MPV_EVENT_SHUTDOWN:
                    return
                default:
                    break
                }
            }
        }
    }
}


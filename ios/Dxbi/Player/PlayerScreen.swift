import AVFoundation
import AVKit
import MediaPlayer
import SwiftUI
import UIKit

/**
 * The player: mpv's picture, glass controls over it, and the gestures (tap the middle to pause,
 * double-tap a side to skip 10 seconds, drag across to seek, up and down for brightness and volume,
 * pinch to fill, hold for 2× and slide for faster or slower).
 */
struct PlayerScreen: View {
    @Environment(Stremio.self) private var stremio
    let playback: Playback

    @State private var visible = true
    @State private var locked = false
    @State private var unlockShown = false
    @State private var hideTask: Task<Void, Never>?
    @State private var seekPreview: Double?
    @State private var heldSpeed: Double?
    @State private var level: (icon: String, value: Double, left: Bool)?
    @State private var scrubbing: Double?
    @State private var now = Date()

    private let clock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VideoSurface(mpv: playback.mpv).ignoresSafeArea()
            Gestures(handler: gestures).ignoresSafeArea()
            if playback.buffering && seekPreview == nil { ProgressView().controlSize(.large).tint(.white).allowsHitTesting(false) }
            if visible && !locked { controls.transition(.opacity) }
            overlays
        }
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
        .animation(.easeOut(duration: 0.2), value: visible)
        .onReceive(clock) { now = $0 }
        // (PlayerHost turns the screen sideways)
        .onAppear {
            poke()
            SystemVolume.prepare()
        }
    }

    /** A menu is open: the controls stay until the screen is tapped */
    private func hold() {
        visible = true
        hideTask?.cancel()
    }

    /** Shows the controls, and hides them again after a few seconds of playing */
    private func poke() {
        visible = true
        hideTask?.cancel()
        hideTask = Task {
            try? await Task.sleep(for: .seconds(4))
            if !Task.isCancelled && !playback.paused && scrubbing == nil { visible = false }
        }
    }

    // MARK: - Gestures

    private var gestures: Gestures.Handler {
        var h = Gestures.Handler()
        h.tap = { x, width in
            if locked {
                unlockShown = true
                Task { try? await Task.sleep(for: .seconds(3)); unlockShown = false }
                return
            }
            // the middle pauses; either side shows or hides the controls
            if abs(x - width / 2) < width / 6 {
                playback.mpv.toggle()
                poke()
            } else if visible {
                visible = false
            } else {
                poke()
            }
        }
        h.doubleTap = { x, width in
            guard !locked else { return }
            let forward = x > width / 2
            playback.mpv.seek(by: forward ? 10 : -10)
            playback.show(forward ? "+10 seconds" : "−10 seconds")
        }
        h.seek = { phase, dx, width in
            guard !locked, playback.duration > 0 else { return }
            switch phase {
            case .changed:
                let base = seekPreview ?? playback.position
                if seekPreview == nil { seekPreview = base }
                let target = min(max(playback.position + Double(dx / width) * min(playback.duration, 600), 0), playback.duration)
                // (just where it'll land and the seek bar: the rest of the controls stay away)
                seekPreview = target
            default:
                if let target = seekPreview { playback.mpv.seek(to: target) }
                seekPreview = nil
            }
        }
        h.slide = { phase, dy, left in
            guard !locked else { return }
            if phase != .changed {
                Task { try? await Task.sleep(for: .seconds(0.8)); level = nil }
                return
            }
            if left {
                let b = min(max(UIScreen.main.brightness - dy / 300, 0), 1)
                UIScreen.main.brightness = b
                level = ("sun.max.fill", Double(b), true)
            } else {
                // from the last value set while sliding: the phone reports its volume a moment late,
                // which undid small moves (only big swipes got through)
                let from = level.flatMap { $0.left ? nil : $0.value } ?? Double(SystemVolume.value)
                let v = min(max(from - Double(dy / 300), 0), 1)
                SystemVolume.set(Float(v))
                level = ("speaker.wave.2.fill", v, false)
            }
        }
        h.pinch = { scale in
            guard !locked else { return }
            let fit: Playback.Fit = scale > 1 ? .fill : .fit
            guard fit != playback.fit else { return }
            playback.fit = fit
            playback.show(fit == .fill ? "Fill screen" : "Fit to screen")
        }
        h.hold = { phase, dx in
            guard !locked else { return }
            switch phase {
            case .began:
                heldSpeed = playback.speed
                playback.mpv.setSpeed(2)
            case .changed:
                // slide right for faster (up to 4×), left for slower (down to 1.25×), a quarter at a time
                let steps = (dx / 36).rounded()
                playback.mpv.setSpeed(min(max(2 + Double(steps) * 0.25, 1.25), 4))
            default:
                if let held = heldSpeed { playback.mpv.setSpeed(held) }
                heldSpeed = nil
            }
        }
        return h
    }

    // MARK: - Controls

    private var controls: some View {
        ZStack {
            LinearGradient(stops: [.init(color: .black.opacity(0.6), location: 0), .init(color: .clear, location: 0.3), .init(color: .clear, location: 0.6), .init(color: .black.opacity(0.75), location: 1)], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
                .allowsHitTesting(false)
            VStack(spacing: 0) {
                topBar
                Spacer()
                centre
                Spacer()
                bottomBar
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 14)
        }
    }

    private var topBar: some View {
        HStack(alignment: .top, spacing: 14) {
            GlassCircle(icon: "xmark", label: "Close", size: 46) { playback.finish(ended: false) }
            VStack(alignment: .leading, spacing: 2) {
                Text(playback.title).font(.headline).lineLimit(1)
                if !playback.subtitle.isEmpty { Text(playback.subtitle).font(.subheadline).foregroundStyle(Dx.muted).lineLimit(1) }
            }
            .padding(.top, 4)
            Spacer()
            if let party = playback.party {
                Label("\(party.people.count)", systemImage: "person.2.fill")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .dxGlass(in: .capsule)
            }
            if playback.duration > 0 {
                Text("Ends at \(now.addingTimeInterval((playback.duration - playback.position) / max(playback.speed, 0.1)), format: .dateTime.hour().minute())")
                    .font(.footnote).foregroundStyle(Dx.muted).padding(.top, 12)
            }
            GlassCircle(icon: "lock.open.fill", label: "Lock", size: 46) {
                locked = true
                visible = false
                playback.show("Locked: tap the screen to unlock")
            }
        }
    }

    private var centre: some View {
        HStack(spacing: 56) {
            GlassCircle(icon: "gobackward.10", label: "Back 10 seconds", size: 62) { playback.mpv.seek(by: -10); poke() }
            Button {
                playback.mpv.toggle()
                poke()
            } label: {
                Image(systemName: playback.paused ? "play.fill" : "pause.fill")
                    .font(.system(size: 38, weight: .semibold))
                    .frame(width: 66, height: 66)
                    .contentTransition(.symbolEffect(.replace))
            }
            .dxGlassButton()
            .buttonBorderShape(.circle)
            .accessibilityLabel(playback.paused ? "Play" : "Pause")
            GlassCircle(icon: "goforward.10", label: "Forward 10 seconds", size: 62) { playback.mpv.seek(by: 10); poke() }
        }
    }

    private var bottomBar: some View {
        VStack(spacing: 10) {
            Scrubber(position: scrubbing ?? seekPreview ?? playback.position, duration: playback.duration, accent: Color(playback.accent), segments: playback.segments) { value, done in
                if done {
                    playback.mpv.seek(to: value)
                    scrubbing = nil
                    poke()
                } else {
                    scrubbing = value
                    hideTask?.cancel()
                }
            }
            HStack(spacing: 10) {
                Text(time(scrubbing ?? seekPreview ?? playback.position)).monospacedDigit()
                Text("/ " + time(playback.duration)).monospacedDigit().foregroundStyle(Dx.muted)
                Spacer()
                // (each menu is its own view: it redraws only when what it shows changes, not with the
                // clock every second, which made open menus jump and miss taps)
                // (opening a menu keeps the controls up until the screen is tapped: they hid, and took
                // the open menu with them)
                SpeedMenu(playback: playback, onOpen: hold)
                TracksMenu(playback: playback, onOpen: hold)
                Button { stremio.playExternally(playback) } label: { Image(systemName: "arrow.up.forward.app").frame(width: 24, height: 24) }
                    .dxGlassButton()
                    .accessibilityLabel("Play with external player")
                if playback.nextTitle != nil {
                    Button { playback.playNext() } label: { Label("Next", systemImage: "forward.end.fill").frame(height: 24) }
                        .dxGlassButton()
                }
            }
            .font(.subheadline.weight(.semibold))
        }
    }

    // MARK: - Over everything: messages, skip, up next, lock

    private var overlays: some View {
        ZStack {
            VStack {
                if let text = heldSpeed != nil ? "\(playback.speed.formatted())× ▶▶" : playback.flash {
                    Text(text)
                        .font(.footnote.weight(.semibold))
                        .padding(.horizontal, 14).padding(.vertical, 7)
                        .dxGlass(in: .capsule)
                        .padding(.top, 10)
                        .transition(.opacity)
                }
                if let preview = seekPreview {
                    Text("\(time(preview))  (\(preview >= playback.position ? "+" : "−")\(time(abs(preview - playback.position))))")
                        .font(.title3.weight(.semibold)).monospacedDigit()
                        .padding(.horizontal, 18).padding(.vertical, 10)
                        .dxGlass(in: .capsule)
                        .padding(.top, 10)
                }
                Spacer()
                // seeking by swiping with the controls away: the seek bar alone
                if let preview = seekPreview, !visible {
                    Scrubber(position: preview, duration: playback.duration, accent: Color(playback.accent), segments: playback.segments) { _, _ in }
                        .padding(.horizontal, 24)
                        .padding(.bottom, 44)
                        .transition(.opacity)
                }
            }
            .allowsHitTesting(false)
            if let level {
                HStack {
                    if !level.left { Spacer() }
                    LevelBar(icon: level.icon, value: level.value)
                    if level.left { Spacer() }
                }
                .padding(.horizontal, 44)
                .allowsHitTesting(false)
                .transition(.opacity)
            }
            VStack {
                Spacer()
                HStack {
                    Spacer()
                    if !locked, playback.upNextDue, let next = playback.nextTitle {
                        upNext(next)
                    } else if !locked, let segment = playback.segment {
                        Button { playback.skip() } label: { Text(segment.label).font(.headline).padding(.horizontal, 8).frame(height: 30) }
                            .dxGlassProminentButton()
                            .tint(.white)
                            .foregroundStyle(.black)
                    }
                }
                .padding(.bottom, visible ? 110 : 30)
                .padding(.horizontal, 30)
            }
            if locked && unlockShown {
                VStack {
                    HStack {
                        Spacer()
                        GlassCircle(icon: "lock.fill", label: "Unlock", size: 46) {
                            locked = false
                            unlockShown = false
                            poke()
                        }
                    }
                    Spacer()
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 14)
            }
        }
        .animation(.easeOut(duration: 0.2), value: playback.flash)
    }

    private func upNext(_ next: String) -> some View {
        Button { playback.playNext() } label: {
            HStack(spacing: 12) {
                Art(url: playback.nextArt).frame(width: 120, height: 68).clipShape(.rect(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 2) {
                    Text("UP NEXT").font(.caption2.weight(.bold)).foregroundStyle(Dx.muted)
                    Text(next).font(.subheadline.weight(.semibold)).lineLimit(2)
                    Label("Play", systemImage: "play.fill").font(.footnote.weight(.bold))
                }
                .frame(width: 170, alignment: .leading)
            }
            .padding(10)
            .dxGlass(interactive: true, in: .rect(cornerRadius: 18))
        }
        .buttonStyle(.plain)
    }

    private func time(_ seconds: Double) -> String {
        guard seconds.isFinite else { return "0:00" }
        let s = Int(max(seconds, 0))
        return s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
    }
}

/** The seek bar: drag anywhere on it; skip segments are marked */
private struct Scrubber: View {
    var position: Double
    var duration: Double
    var accent: Color
    var segments: [Playback.Segment]
    var onScrub: (Double, Bool) -> Void
    @State private var dragging = false

    var body: some View {
        GeometryReader { g in
            let fraction = duration > 0 ? min(max(position / duration, 0), 1) : 0
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.25)).frame(height: dragging ? 10 : 6)
                ForEach(Array(segments.enumerated()), id: \.offset) { _, s in
                    if duration > 0 {
                        let end = s.end > 0 ? s.end : duration
                        Capsule().fill(.white.opacity(0.35))
                            .frame(width: max(g.size.width * (end - s.start) / duration, 2), height: dragging ? 10 : 6)
                            .offset(x: g.size.width * s.start / duration)
                    }
                }
                Capsule().fill(accent).frame(width: g.size.width * fraction, height: dragging ? 10 : 6)
                Circle().fill(.white).frame(width: dragging ? 22 : 14).offset(x: g.size.width * fraction - (dragging ? 11 : 7))
            }
            .frame(height: 30)
            .contentShape(.rect)
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { v in
                        dragging = true
                        onScrub(min(max(v.location.x / g.size.width, 0), 1) * duration, false)
                    }
                    .onEnded { v in
                        dragging = false
                        onScrub(min(max(v.location.x / g.size.width, 0), 1) * duration, true)
                    }
            )
            .animation(.snappy(duration: 0.15), value: dragging)
        }
        .frame(height: 30)
    }
}

/** mpv's picture */
private struct VideoSurface: UIViewRepresentable {
    let mpv: MPV
    func makeUIView(context: Context) -> Surface { Surface(layer: mpv.layer) }
    func updateUIView(_ view: Surface, context: Context) {}

    final class Surface: UIView {
        let metal: CALayer
        init(layer: CALayer) {
            metal = layer
            super.init(frame: .zero)
            backgroundColor = .black
            self.layer.addSublayer(layer)
        }
        required init?(coder: NSCoder) { fatalError() }
        override func layoutSubviews() {
            super.layoutSubviews()
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            metal.frame = bounds
            CATransaction.commit()
        }
    }
}

/** The phone's volume (only Apple's volume slider can change it) */
@MainActor
enum SystemVolume {
    private static let view = MPVolumeView(frame: CGRect(x: -100, y: -100, width: 10, height: 10))
    private static var slider: UISlider? { view.subviews.compactMap { $0 as? UISlider }.first }

    static var value: Float { AVAudioSessionVolume.current }

    /** Put in place before the first swipe (its slider only appears once it's in a window) */
    static func prepare() {
        if view.superview == nil { UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first?.addSubview(view) }
    }

    static func set(_ value: Float) {
        prepare()
        guard let slider else { return }
        slider.setValue(value, animated: false)
        slider.sendActions(for: .valueChanged)
    }
}

private enum AVAudioSessionVolume {
    static var current: Float { AVAudioSession.sharedInstance().outputVolume }
}

/**
 * The player's touch gestures, in UIKit: a single tap has to wait to know it isn't a double tap, and
 * drags have to be told apart by direction, which SwiftUI's gestures don't do well together.
 */
private struct Gestures: UIViewRepresentable {
    struct Handler {
        var tap: (CGFloat, CGFloat) -> Void = { _, _ in }
        var doubleTap: (CGFloat, CGFloat) -> Void = { _, _ in }
        /** A drag across: how far, and the screen's width */
        var seek: (UIGestureRecognizer.State, CGFloat, CGFloat) -> Void = { _, _, _ in }
        /** A drag up or down: how far since last time, and whether on the left */
        var slide: (UIGestureRecognizer.State, CGFloat, Bool) -> Void = { _, _, _ in }
        var pinch: (CGFloat) -> Void = { _ in }
        /** Holding: how far the finger has slid sideways since it started */
        var hold: (UIGestureRecognizer.State, CGFloat) -> Void = { _, _ in }
    }

    var handler: Handler

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        let c = context.coordinator
        let double = UITapGestureRecognizer(target: c, action: #selector(Coordinator.double(_:)))
        double.numberOfTapsRequired = 2
        let single = UITapGestureRecognizer(target: c, action: #selector(Coordinator.single(_:)))
        single.require(toFail: double)
        let pan = UIPanGestureRecognizer(target: c, action: #selector(Coordinator.pan(_:)))
        let pinch = UIPinchGestureRecognizer(target: c, action: #selector(Coordinator.pinch(_:)))
        let hold = UILongPressGestureRecognizer(target: c, action: #selector(Coordinator.hold(_:)))
        hold.minimumPressDuration = 0.45
        pan.require(toFail: hold)
        for g in [double, single, pan, pinch, hold] as [UIGestureRecognizer] { view.addGestureRecognizer(g) }
        return view
    }

    func updateUIView(_ view: UIView, context: Context) { context.coordinator.handler = handler }

    @MainActor
    final class Coordinator: NSObject {
        var handler = Handler()
        private var axis: Int = 0 // 1 across, 2 up and down
        private var last: CGPoint = .zero
        private var holdStart: CGFloat = 0

        @objc func single(_ g: UITapGestureRecognizer) {
            guard let v = g.view else { return }
            handler.tap(g.location(in: v).x, v.bounds.width)
        }

        @objc func double(_ g: UITapGestureRecognizer) {
            guard let v = g.view else { return }
            handler.doubleTap(g.location(in: v).x, v.bounds.width)
        }

        @objc func pan(_ g: UIPanGestureRecognizer) {
            guard let v = g.view else { return }
            let t = g.translation(in: v)
            switch g.state {
            case .began:
                axis = 0
                last = .zero
            case .changed:
                if axis == 0 { axis = abs(t.x) > abs(t.y) ? 1 : 2 }
                if axis == 1 { handler.seek(.changed, t.x, v.bounds.width) }
                else { handler.slide(.changed, t.y - last.y, g.location(in: v).x < v.bounds.width / 2) }
                last = t
            default:
                if axis == 1 { handler.seek(.ended, t.x, v.bounds.width) } else if axis == 2 { handler.slide(.ended, 0, true) }
                axis = 0
            }
        }

        @objc func pinch(_ g: UIPinchGestureRecognizer) {
            if g.state == .ended { handler.pinch(g.scale) }
        }

        @objc func hold(_ g: UILongPressGestureRecognizer) {
            guard let v = g.view else { return }
            let x = g.location(in: v).x
            switch g.state {
            case .began:
                holdStart = x
                handler.hold(.began, 0)
            case .changed: handler.hold(.changed, x - holdStart)
            default: handler.hold(.ended, 0)
            }
        }
    }
}

/** Playback speed */
private struct SpeedMenu: View {
    let playback: Playback
    /** The menu opened: the controls stay up while it's open */
    var onOpen: () -> Void
    var body: some View {
        Menu {
            Picker("Speed", selection: Binding(get: { playback.speed }, set: { playback.mpv.setSpeed($0) })) {
                ForEach([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2], id: \.self) { r in Text(r == 1 ? "Normal" : "\(r.formatted())×").tag(r) }
            }
        } label: {
            Label(playback.speed == 1 ? "Speed" : "\(playback.speed.formatted())×", systemImage: "gauge.with.dots.needle.67percent").frame(height: 24)
        }
        .dxGlassButton()
        .simultaneousGesture(TapGesture().onEnded(onOpen))
        // (opening upward, iOS turned the list upside down: Off ended up at the bottom)
        .menuOrder(.fixed)
    }
}

/** Subtitles, by where they come from, and the sound tracks */
private struct TracksMenu: View {
    let playback: Playback
    var onOpen: () -> Void
    var body: some View {
        Menu {
            let subs = playback.subtitleTracks
            Section("Subtitles") {
                Button { playback.mpv.select("sub", nil) } label: { check("Off", on: !subs.contains(where: \.selected)) }
            }
            ForEach([("video", "In the Video"), ("stream", "With This Stream"), ("addon", "From Subtitle Addons · may not match")], id: \.0) { source, heading in
                let group = subs.filter { playback.source(of: $0) == source }
                if !group.isEmpty {
                    Section(heading) {
                        ForEach(group) { t in Button { playback.mpv.select("sub", t.id) } label: { check(trackName(t), on: t.selected) } }
                    }
                }
            }
            if playback.audioTracks.count > 1 {
                Section("Audio") {
                    ForEach(playback.audioTracks) { t in
                        Button { playback.mpv.select("audio", t.id) } label: { check(trackName(t) + (t.codec.isEmpty ? "" : " · \(t.codec.uppercased())"), on: t.selected) }
                    }
                }
            }
        } label: {
            Label("Subtitles", systemImage: "captions.bubble.fill").frame(height: 24)
        }
        .dxGlassButton()
        .simultaneousGesture(TapGesture().onEnded(onOpen))
        // (opening upward, iOS turned the list upside down: Off ended up at the bottom)
        .menuOrder(.fixed)
    }
}

@ViewBuilder
private func check(_ text: String, on: Bool) -> some View {
    if on { Label(text, systemImage: "checkmark") } else { Text(text) }
}

private func trackName(_ t: MPV.Track) -> String {
    let lang = Locale.current.localizedString(forLanguageCode: t.lang) ?? t.lang.uppercased()
    if t.external { return t.title.ifEmpty(lang.ifEmpty("Subtitles")) }
    return [lang, t.title].filter { !$0.isEmpty }.joined(separator: " · ").ifEmpty("Track \(t.id)")
}

/** Brightness (left) and volume (right): a tall bar on its own side */
private struct LevelBar: View {
    var icon: String
    var value: Double
    var body: some View {
        VStack(spacing: 10) {
            GeometryReader { g in
                Capsule().fill(.white.opacity(0.25))
                    .overlay(alignment: .bottom) { Capsule().fill(.white).frame(height: g.size.height * min(max(value, 0), 1)) }
            }
            .frame(width: 8, height: 150)
            Image(systemName: icon).font(.footnote.weight(.semibold))
        }
        .padding(.vertical, 16)
        .padding(.horizontal, 14)
        .dxGlass(in: .capsule)
    }
}

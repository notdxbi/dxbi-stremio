import SwiftUI

/**
 * The streams for one film or episode, as dx.bi's stream list shows them: dx.bi's pick at the top
 * (what you chose last time, else the best that's ready), then every stream with its file name,
 * quality, HDR, source, codec, languages, size and seeds, to filter and sort.
 */
struct StreamsSheet: View {
    var choices: StreamChoices?
    var heading: String
    var subheading: String?
    var onPlay: (StreamOption, Stremio.Target) -> Void

    private enum Sort: String, CaseIterable {
        case best = "Best Quality", seeds = "Most Seeds", largest = "Largest First", smallest = "Smallest First", addon = "Addon Order"
    }

    @State private var sort = Sort.best
    @State private var quality: String?
    @State private var provider: String?
    @State private var instantOnly = false

    private var all: [StreamOption] { choices?.items ?? [] }

    private var shown: [StreamOption] {
        let kept = all.filter { (quality == nil || $0.quality == quality) && (provider == nil || $0.provider == provider) && (!instantOnly || $0.instant) }
        switch sort {
        case .best: return kept.sorted(by: StreamOption.best)
        case .seeds: return kept.sorted { $0.seeds > $1.seeds }
        case .largest: return kept.sorted { $0.size > $1.size }
        case .smallest: return kept.sorted { ($0.size > 0 ? $0.size : .infinity) < ($1.size > 0 ? $1.size : .infinity) }
        case .addon: return kept
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    if let best = choices?.picked { pick(best) }
                    if all.count > 1 { filters }
                    ForEach(shown) { s in row(s, picked: s.index == choices?.pick) }
                    status
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 30)
            }
            .navigationTitle(heading)
            .navigationSubtitle(subheading ?? "")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func pick(_ best: StreamOption) -> some View {
        Button { onPlay(best, .player) } label: {
            HStack(spacing: 12) {
                Image(systemName: "play.fill").font(.title2)
                VStack(alignment: .leading, spacing: 2) {
                    Text(choices?.sameAsLastTime == true ? "Play · Same as Last Time" : "Play the Best Stream").font(.headline)
                    Text([best.label, best.provider, best.sizeText].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.footnote).opacity(0.7).lineLimit(1)
                    if !best.filename.isEmpty { Text(best.filename).font(.footnote).opacity(0.6).lineLimit(2) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if best.instant { Image(systemName: "bolt.fill").foregroundStyle(.green) }
            }
            .padding(16)
            .foregroundStyle(.black)
            .background(.white, in: .rect(cornerRadius: 20))
        }
        .buttonStyle(.plain)
        .padding(.top, 6)
    }

    private var filters: some View {
        let qualities = Array(Set(all.map(\.quality))).sorted { a, b in (all.first { $0.quality == a }?.res ?? 0) > (all.first { $0.quality == b }?.res ?? 0) }
        let providers = Array(Set(all.map(\.provider).filter { !$0.isEmpty })).sorted()
        return ScrollView(.horizontal) {
            HStack(spacing: 8) {
                Menu {
                    Picker("Sort", selection: $sort) { ForEach(Sort.allCases, id: \.self) { Text($0.rawValue).tag($0) } }
                } label: { chip(sort.rawValue) }
                if qualities.count > 1 {
                    Menu {
                        Picker("Quality", selection: $quality) {
                            Text("Any Quality").tag(String?.none)
                            ForEach(qualities, id: \.self) { Text($0).tag(String?.some($0)) }
                        }
                    } label: { chip(quality ?? "Any Quality") }
                }
                if providers.count > 1 {
                    Menu {
                        Picker("Source", selection: $provider) {
                            Text("Any Source").tag(String?.none)
                            ForEach(providers, id: \.self) { Text($0).tag(String?.some($0)) }
                        }
                    } label: { chip(provider ?? "Any Source") }
                }
                if all.contains(where: \.instant) && all.contains(where: { !$0.instant }) {
                    Button { instantOnly.toggle() } label: { chip("Instant Only", on: instantOnly, menu: false) }
                }
            }
            .padding(.vertical, 4)
        }
        .scrollIndicators(.hidden)
    }

    private func chip(_ text: String, on: Bool = false, menu: Bool = true) -> some View {
        HStack(spacing: 4) {
            Text(text)
            if menu { Image(systemName: "chevron.down").font(.caption2.weight(.bold)) }
        }
        .font(.subheadline.weight(.semibold))
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .foregroundStyle(on ? .black : .white)
        .background(on ? AnyShapeStyle(.white) : AnyShapeStyle(.clear), in: .capsule)
        .glassEffect(on ? .identity : .regular.interactive(), in: .capsule)
    }

    private func row(_ s: StreamOption, picked: Bool) -> some View {
        Button { onPlay(s, .player) } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Badge(text: s.quality, filled: true)
                    if s.dv { Badge(text: "DOLBY VISION") } else if s.hdr { Badge(text: "HDR") }
                    if !s.source.isEmpty && s.source != "Other" { Badge(text: s.source.uppercased(), colour: s.source == "CAM" ? .red : .white) }
                    if !s.codec.isEmpty { Badge(text: s.codec) }
                    Spacer(minLength: 0)
                    if s.instant { Badge(text: "INSTANT", colour: .green) }
                    else if s.pending { Badge(text: "NOT CACHED", colour: .yellow) }
                    else if s.torrent { Badge(text: "TORRENT", colour: Dx.muted) }
                }
                // the file name, always: it says what the stream really is
                if !s.filename.isEmpty {
                    Text(s.filename).font(.subheadline).lineLimit(3).multilineTextAlignment(.leading)
                }
                Text(Array(Set([s.provider, s.site])).filter { !$0.isEmpty }.sorted().joined(separator: " · "))
                    .font(s.filename.isEmpty ? .headline : .footnote.weight(.semibold))
                    .foregroundStyle(s.filename.isEmpty ? .white : Dx.muted)
                    .lineLimit(1)
                let facts = [s.sizeText, s.seeds >= 0 ? "\(s.seeds) seeds" : nil, s.langs.filter { !$0.hasPrefix("Not listed") }.joined(separator: ", ").ifEmpty("-"), s.addon != s.provider ? s.addon : nil]
                    .compactMap { $0 }.filter { !$0.isEmpty && $0 != "-" }
                if !facts.isEmpty { Text(facts.joined(separator: " · ")).font(.footnote).foregroundStyle(Dx.muted).lineLimit(2) }
                if s.lesser { Text("Upscaled, high frame rate or 3D: may not look as good as it says").font(.caption).foregroundStyle(Dx.faint) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Dx.raised.opacity(0.7), in: .rect(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(picked ? Dx.accent : .clear, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button { onPlay(s, .player) } label: { Label("Play", systemImage: "play.fill") }
            Button { onPlay(s, .otherApp) } label: { Label("Play with External Player", systemImage: "arrow.up.forward.app") }
            Button { onPlay(s, .download) } label: { Label("Download", systemImage: "arrow.down.circle") }
            if !s.filename.isEmpty { Button { UIPasteboard.general.string = s.filename } label: { Label("Copy File Name", systemImage: "doc.on.doc") } }
        }
    }

    @ViewBuilder
    private var status: some View {
        if choices == nil || choices?.settled == false {
            HStack(spacing: 10) {
                ProgressView()
                Text(all.isEmpty ? "Finding streams…" : "More addons answering…").foregroundStyle(Dx.muted)
            }
            .frame(maxWidth: .infinity)
            .padding(24)
        } else if all.isEmpty {
            ContentUnavailableView("No Streams", systemImage: "play.slash", description: Text("Your addons may not have this one yet."))
        } else if shown.isEmpty {
            Text("Nothing matches those filters.").foregroundStyle(Dx.muted).padding()
        }
    }
}

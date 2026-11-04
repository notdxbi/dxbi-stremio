import SwiftUI

/**
 * A film or show, the Apple TV way: its art at the top in the art's own colour, the logo, Play (one
 * tap: dx.bi picks the stream), then the seasons and episodes. The art stays put as the page scrolls
 * up over it, fading and blurring away.
 */
struct TitleView: View {
    @Environment(Stremio.self) private var stremio
    @Environment(\.dismiss) private var dismiss
    var ref: TitleRef

    @State private var choices: StreamChoices?
    /** Play was pressed for this video: dx.bi's pick plays as soon as it's sure */
    @State private var waitingFor: String?
    @State private var streamsOpen = false
    @State private var season: Int?
    @State private var tint = Color(white: 0.16)
    @State private var reviews: Reviews?
    @State private var reviewsOpen = false
    @State private var moreText = false
    @State private var autoPlayed = false
    /** The cast with photos (TMDB, with a key in dx.bi settings), else nil */
    @State private var cast: [JSON]?

    private var details: Details? { stremio.details?.metaId == ref.id ? stremio.details : nil }
    private var title: Title { details?.title ?? Title(id: ref.id, type: ref.type, name: ref.name) }
    private var current: StreamChoices? {
        guard let c = choices, let v = details?.videoId, c.videoId == v else { return nil }
        return c
    }

    var body: some View {
        GeometryReader { g in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header(width: g.size.width)
                    VStack(alignment: .leading, spacing: 30) {
                        if ref.type == "series" { episodes(width: g.size.width) }
                        extras
                    }
                    .padding(.vertical, 26)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.black)
                }
            }
            .scrollIndicators(.hidden)
            .ignoresSafeArea(edges: .top)
        }
        // the art's colour above, black below (what shows past either end of the page)
        .background {
            VStack(spacing: 0) {
                tint
                Color.black
            }
            .ignoresSafeArea()
        }
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if let link = shareLink { ShareLink(item: link) { Image(systemName: "square.and.arrow.up") } }
            }
        }
        .sheet(isPresented: $streamsOpen) {
            StreamsSheet(choices: current, heading: title.name, subheading: episodeLine) { option, target in
                play(option, in: target)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $reviewsOpen) { ReviewsView(title: title, reviews: reviews) }
        .task(id: ref.id) {
            if stremio.details?.metaId != ref.id { stremio.open(ref.type, ref.id) }
            reviews = await stremio.reviews(ref.type, ref.id)
        }
        .task(id: "\(ref.id)-\(details?.state == .ready)") {
            guard let d = details, d.state == .ready else { return }
            let names: [JSON] = d.directors.prefix(3).map { ["name": $0, "role": "Director"] } + d.cast.prefix(13).map { ["name": $0, "role": ""] }
            cast = await stremio.cast(ref.type, imdbId ?? "", names: names)
        }
        .task(id: title.background ?? title.poster) {
            if let c = await ArtColour.of(title.backdrop) { withAnimation(.easeOut(duration: 0.4)) { tint = c } }
        }
        // a series: the episode they're on, ready before Play is pressed
        .onChange(of: details?.state == .ready, initial: true) {
            guard let d = details, d.state == .ready, ref.type == "series" else { return }
            if season == nil { season = nextVideo(d)?.season ?? d.seasons.first }
            if d.videoId == nil, let v = nextVideo(d) { stremio.open(ref.type, ref.id, videoId: v.id) }
            if ref.play && !autoPlayed { autoPlayed = true; start(nextVideo(d)?.id) }
        }
        .onChange(of: details?.state == .ready && ref.type != "series", initial: true) { _, ready in
            if ready && ref.play && !autoPlayed { autoPlayed = true; start(nil) }
        }
        // The episode picked shows in its season (back from the player, the page picks the next one
        // when the last was finished: dxbi-engine.js afterPlaying)
        .onChange(of: details?.videoId) { _, id in
            guard let d = details, let v = d.videos.first(where: { $0.id == id }), let s = v.season else { return }
            season = s
        }
        // dx.bi's reading of the streams, again as more addons answer
        .task(id: details?.streamsKey) {
            guard details?.videoId != nil else { return }
            choices = await stremio.streams()
            justPlayIfSure()
        }
        .task(id: waitingFor) {
            guard waitingFor != nil else { return }
            try? await Task.sleep(for: .seconds(6))
            if let c = current, c.justPlay, waitingFor == c.videoId, let pick = c.picked { play(pick) }
        }
    }

    // MARK: - Playing

    /** What Play starts: the episode they're in the middle of, else the first one that's out */
    private func nextVideo(_ d: Details) -> Video? {
        guard ref.type == "series" else { return nil }
        // (the one picked first: the page moves it on to the next episode after one is finished)
        return d.videos.first { $0.id == d.videoId } ?? d.videos.first { $0.id == d.resumeVideoId } ?? d.videos.first { ($0.season ?? 0) > 0 && !$0.upcoming } ?? d.videos.first
    }

    private func start(_ videoId: String?) {
        let target = videoId ?? details?.videoId ?? ref.id
        if ref.type == "series", let videoId, videoId != details?.videoId {
            choices = nil
            stremio.open(ref.type, ref.id, videoId: videoId)
        }
        waitingFor = target
        streamsOpen = true
        justPlayIfSure()
    }

    /** Just press Play: the stream chosen last time plays at once, anything else once every addon has answered */
    private func justPlayIfSure() {
        guard let c = current, c.justPlay, waitingFor == c.videoId, let pick = c.picked else { return }
        if c.sameAsLastTime || c.settled { play(pick) }
    }

    private func play(_ option: StreamOption, in target: Stremio.Target = .player) {
        waitingFor = nil
        streamsOpen = false
        stremio.play(option, in: target)
    }

    private var playLabel: String {
        guard let d = details else { return "Play" }
        if ref.type == "series", let v = nextVideo(d), let s = v.season, let e = v.episode {
            let resuming = v.id == d.resumeVideoId && d.resumeMs > 0
            return "\(resuming ? "Resume" : "Play") S\(s), E\(e)"
        }
        return d.resumeMs > 0 && d.resumeVideoId == ref.id ? "Resume" : "Play"
    }

    private var episodeLine: String? {
        guard let d = details, let v = d.videos.first(where: { $0.id == d.videoId }), let s = v.season, let e = v.episode else { return nil }
        return "S\(s), E\(e) · \(v.title)"
    }

    /** The title's IMDb id (tt…): Stremio's own id for most titles. (Its "imdb" link is the IMDb rating.) */
    private var imdbId: String? {
        ref.id.wholeMatch(of: /tt\d+/) != nil ? ref.id : nil
    }

    private var shareLink: URL? {
        imdbId.flatMap { URL(string: "https://www.imdb.com/title/\($0)/") }
    }

    // MARK: - The top: art, logo, Play

    private func header(width: CGFloat) -> some View {
        let artHeight = width * 0.9
        return VStack(spacing: 14) {
            // the art is behind (below); this space shows it, with the logo low on it
            Color.clear
                .frame(width: width, height: artHeight)
                .overlay(alignment: .bottom) {
                    TitleLogo(title: title, maxHeight: 110, textSize: 38)
                        .frame(maxWidth: min(width * 0.75, 380))
                        .padding(.bottom, -10)
                }
            VStack(spacing: 14) {
                Text(([typeName(title.type)] + title.genres.prefix(3)).joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(Dx.muted)
                    .padding(.top, 6)
                buttons
                if let d = title.description {
                    Button { withAnimation(.snappy) { moreText.toggle() } } label: {
                        Text(d)
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.85))
                            .lineLimit(moreText ? nil : 3)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                }
                facts
                if let scores = reviews?.scores, !scores.isEmpty { scoreRow(scores) }
            }
            .padding(.horizontal, Dx.gutter)
            .padding(.bottom, 24)
        }
        .background(alignment: .top) {
            // Apple TV's: the page scrolls up over the art, which stays where it is and fades and
            // blurs as it's covered (and grows when the page is pulled down)
            Art(url: title.backdrop)
                .frame(width: width, height: artHeight)
                .clipped()
                .overlay(LinearGradient(stops: [.init(color: .black.opacity(0.3), location: 0), .init(color: .clear, location: 0.3), .init(color: tint, location: 1)], startPoint: .top, endPoint: .bottom))
                .visualEffect { content, proxy in
                    let y = proxy.frame(in: .scrollView(axis: .vertical)).minY
                    let covered = min(max(-y / (artHeight * 0.8), 0), 1)
                    return content
                        .scaleEffect(y > 0 ? 1 + y / artHeight : 1, anchor: .bottom)
                        .offset(y: y < 0 ? -y : 0)
                        .blur(radius: covered * 14)
                        .opacity(1 - covered)
                }
        }
        // the art's colour runs down to the end of the scores, where the seasons start on black
        .background(tint)
    }

    private var buttons: some View {
        let inList = title.inLibrary
        return HStack(spacing: 12) {
            PrimaryPill(label: playLabel) { start(details.flatMap(nextVideo)?.id) }
                .disabled(details?.state != .ready)
            GlassCircle(icon: inList ? "checkmark" : "plus", label: inList ? "Remove from Library" : "Add to Library") {
                stremio.setInLibrary(!inList)
                stremio.show(inList ? "Removed from your Library" : "Added to your Library")
            }
            Menu {
                Button { stremio.setWatched(!title.watched) } label: {
                    Label(title.watched ? "Mark as Unwatched" : "Mark as Watched", systemImage: title.watched ? "eye.slash" : "eye")
                }
                if let trailer = title.trailer, let url = URL(string: "https://www.youtube.com/watch?v=\(trailer)") {
                    Link(destination: url) { Label("Trailer", systemImage: "film") }
                }
                Button { reviewsOpen = true } label: { Label("Reviews", systemImage: "star") }
                if details?.videoId != nil {
                    Button { streamsOpen = true } label: { Label("Choose a Stream", systemImage: "list.bullet") }
                }
                if let pick = current?.picked {
                    Button { play(pick, in: .otherApp) } label: { Label("Play with External Player", systemImage: "arrow.up.forward.app") }
                    Button { play(pick, in: .download) } label: { Label("Download", systemImage: "arrow.down.circle") }
                }
            } label: {
                Image(systemName: "ellipsis").font(.system(size: 20, weight: .semibold)).frame(width: 36, height: 36)
            }
            .buttonStyle(.glass)
            .buttonBorderShape(.circle)
        }
        .frame(maxWidth: 400)
    }

    private var facts: some View {
        HStack(spacing: 8) {
            Text([title.year, title.runtime].compactMap { $0 }.joined(separator: " · "))
            if title.watched { Badge(text: "WATCHED") }
            Spacer(minLength: 0)
        }
        .font(.subheadline)
        .foregroundStyle(Dx.muted)
    }

    private func scoreRow(_ scores: [Score]) -> some View {
        Button { reviewsOpen = true } label: {
            ScrollView(.horizontal) {
                HStack(spacing: 14) {
                    ForEach(scores.prefix(5)) { s in
                        VStack(alignment: .leading, spacing: 1) {
                            Text(s.value).font(.headline)
                            Text(s.name).font(.caption).foregroundStyle(Dx.muted)
                        }
                    }
                    Image(systemName: "chevron.right").foregroundStyle(Dx.muted)
                }
            }
            .scrollIndicators(.hidden)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Episodes

    @ViewBuilder
    private func episodes(width: CGFloat) -> some View {
        if let d = details, !d.videos.isEmpty {
            let shown = d.videos.filter { $0.season == (season ?? d.seasons.first) }
            VStack(alignment: .leading, spacing: 14) {
                Menu {
                    Picker("Season", selection: Binding(get: { season ?? d.seasons.first ?? 1 }, set: { season = $0 })) {
                        ForEach(d.seasons, id: \.self) { s in Text(s == 0 ? "Specials" : "Season \(s)").tag(s) }
                    }
                } label: {
                    HStack(spacing: 6) {
                        let s = season ?? d.seasons.first ?? 1
                        Text(s == 0 ? "Specials" : "Season \(s)").font(.title2.bold())
                        Image(systemName: "chevron.up.chevron.down").font(.headline).foregroundStyle(Dx.muted)
                    }
                    .foregroundStyle(.white)
                }
                .padding(.horizontal, Dx.gutter)
                ScrollViewReader { proxy in
                    ScrollView(.horizontal) {
                        LazyHStack(spacing: 14) {
                            ForEach(shown) { v in episodeButton(v, width: min(width * 0.72, 340), d: d).id(v.id) }
                        }
                        .scrollTargetLayout()
                        .padding(.horizontal, Dx.gutter)
                    }
                    .scrollTargetBehavior(.viewAligned)
                    .scrollIndicators(.hidden)
                    // the episode they're on, in view (once the episodes are there, and again on its season)
                    .task(id: "\(shown.count)-\(season ?? -1)-\(d.videoId ?? "")") {
                        guard let v = nextVideo(d), shown.contains(where: { $0.id == v.id }) else { return }
                        try? await Task.sleep(for: .milliseconds(250))
                        withAnimation(.smooth) { proxy.scrollTo(v.id, anchor: .leading) }
                    }
                }
            }
        }
    }

    private func episodeButton(_ v: Video, width: CGFloat, d: Details) -> some View {
        Button { start(v.id) } label: {
            EpisodeCard(video: v, width: width, fallbackArt: title.backdrop, playing: v.id == nextVideo(d)?.id)
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button { start(v.id) } label: { Label("Play", systemImage: "play.fill") }
            Button {
                choices = nil
                stremio.open(ref.type, ref.id, videoId: v.id)
                streamsOpen = true
            } label: { Label("Choose a Stream", systemImage: "list.bullet") }
            Divider()
            if v.watched {
                Button { stremio.setWatched(video: v.id, false) } label: { Label("Mark as Unwatched", systemImage: "eye.slash") }
            } else {
                Button { stremio.setWatched(video: v.id, true) } label: { Label("Mark as Watched", systemImage: "eye") }
            }
            if (v.episode ?? 0) > 1 {
                Button { stremio.setWatched(video: v.id, true, upTo: true) } label: { Label("Mark Up to Here as Watched", systemImage: "checkmark.circle") }
            }
        }
    }

    // MARK: - Cast, crew

    @ViewBuilder
    private var extras: some View {
        if let d = details, !(d.cast.isEmpty && d.directors.isEmpty) || cast?.isEmpty == false {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(title: "Cast & Crew")
                ScrollView(.horizontal) {
                    HStack(alignment: .top, spacing: 10) {
                        if let cast, !cast.isEmpty {
                            ForEach(Array(cast.enumerated()), id: \.offset) { _, p in person(name: p.string("name"), role: p.text("role"), photo: p.text("photo")) }
                        } else if let d = details {
                            ForEach(d.directors.prefix(3), id: \.self) { person(name: $0, role: "Director", photo: nil) }
                            ForEach(d.cast.prefix(15), id: \.self) { person(name: $0, role: nil, photo: nil) }
                        }
                    }
                    .padding(.horizontal, Dx.gutter)
                }
                .scrollIndicators(.hidden)
            }
        }
    }

    /** Someone in it: tapping them searches for them, as on the desktop */
    private func person(name: String, role: String?, photo: String?) -> some View {
        Button { stremio.searchFor(name) } label: {
            VStack(spacing: 6) {
                ZStack {
                    Text(name.split(separator: " ").compactMap(\.first).prefix(2).map(String.init).joined())
                        .font(.title2.weight(.semibold))
                    if let photo, let url = URL(string: photo) {
                        AsyncImage(url: url) { phase in
                            if let image = phase.image { image.resizable().scaledToFill() }
                        }
                    }
                }
                .frame(width: 76, height: 76)
                .clipShape(.circle)
                .glassEffect(.regular, in: .circle)
                Text(name).font(.footnote).lineLimit(2).multilineTextAlignment(.center)
                if let role, !role.isEmpty { Text(role).font(.caption).foregroundStyle(Dx.muted).lineLimit(2).multilineTextAlignment(.center) }
            }
            .frame(width: 92)
        }
        .buttonStyle(.plain)
    }
}

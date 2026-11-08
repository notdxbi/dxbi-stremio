import SwiftUI

/**
 * Home, the Apple TV way: a tall billboard to swipe through (logo, what it is, Play and +), then
 * Continue Watching, dx.bi's own rows and the addons' catalogs in the viewer's order.
 */
struct HomeView: View {
    @Environment(Stremio.self) private var stremio
    @State private var account = false
    @State private var party = false
    @State private var kind: String?
    @State private var pastBillboard = false

    var body: some View {
        GeometryReader { g in
            let width = g.size.width
            let wide = width > g.size.height
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 30) {
                    if !stremio.billboard.isEmpty {
                        Billboard(titles: stremio.billboard, height: wide ? g.size.height * 0.92 : min(g.size.height * 0.74, width * 1.55))
                    } else {
                        Color.clear.frame(height: 90)
                    }
                    kinds
                    if !stremio.continueWatching.isEmpty && kind == nil {
                        Shelf(title: "Continue Watching") {
                            ForEach(stremio.continueWatching) { item in
                                ContinueTile(item: item, width: min(max(width * 0.68, 260), 360))
                            }
                        }
                    }
                    ForEach(Array(stremio.myList.enumerated()), id: \.offset) { _, row in
                        if kind == nil, !row.items.isEmpty { titleRow(row.name, row.items, see: .library) }
                    }
                    if kind == nil, let forYou = stremio.forYou { titleRow(forYou.name, forYou.items) }
                    if kind == nil, !stremio.airing.isEmpty {
                        Shelf(title: "New Episodes This Week") {
                            ForEach(stremio.airing) { item in
                                NavigationLink(value: Route.title(TitleRef(type: "series", id: item.id, name: item.name))) {
                                    AiringCard(item: item, width: min(max(width * 0.7, 260), 380))
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    let rows = stremio.rows.filter { kind == nil || $0.type == kind }
                    ForEach(Array(rows.enumerated()), id: \.element.id) { i, row in
                        if row.state == .ready && !row.items.isEmpty {
                            // Netflix's Top 10: the first row is numbered
                            titleRow(row.heading, row.items, rank: i == 0, see: row.discover.map { .browse(link: $0, name: row.heading) })
                        } else if row.state == .loading {
                            loadingRow(row.heading)
                        }
                    }
                    if stremio.rows.isEmpty && stremio.ready {
                        ContentUnavailableView("Nothing to show yet", systemImage: "puzzlepiece.extension", description: Text("Install addons to fill Home: tap your picture, then Addons."))
                    }
                }
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
            // the billboard shows through the top bar, as on Apple TV; once it's scrolled away, rows
            // fade out under the title instead of running into it
            .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y > min(g.size.height * 0.74, width * 1.55) - 140 } action: { _, past in
                pastBillboard = past
            }
            .dxScrollEdgeEffectHidden(!pastBillboard)
            .ignoresSafeArea(edges: .top)
        }
        .screenBackground()
        .navigationTitle("Home")
        .toolbarTitleDisplayMode(.inlineLarge)
        .toolbarBackgroundVisibility(.hidden, for: .navigationBar)
        .modifier(HomeToolbar(party: $party, account: $account, email: stremio.account?.email))
        .sheet(isPresented: $account) { AccountView() }
        .sheet(isPresented: $party) { PartyView() }
        .refreshable { stremio.refreshExtras() }
    }

    /** Netflix's Movies · Series chips */
    private var kinds: some View {
        let types = ["movie", "series", "anime"].filter { t in stremio.rows.contains { $0.type == t } }
        return ScrollView(.horizontal) {
            HStack(spacing: 10) {
                ForEach(types.prefix(4), id: \.self) { t in
                    let on = kind == t
                    Button {
                        withAnimation(.snappy) { kind = on ? nil : t }
                    } label: {
                        HStack(spacing: 6) {
                            Text(t == "movie" ? "Movies" : t == "series" ? "TV Shows" : typeName(t))
                            if on { Image(systemName: "xmark").font(.caption.weight(.bold)) }
                        }
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 6)
                    }
                    .dxGlassButton()
                    .tint(on ? .white : nil)
                }
            }
            .padding(.horizontal, Dx.gutter)
        }
        .scrollIndicators(.hidden)
        .opacity(types.count > 1 ? 1 : 0)
        .frame(height: types.count > 1 ? nil : 0)
    }

    private func titleRow(_ name: String, _ items: [Title], rank: Bool = false, see: Route? = nil) -> some View {
        Shelf(title: name, see: see) {
            ForEach(Array(items.prefix(rank ? 10 : 30).enumerated()), id: \.element.id) { i, title in
                NavigationLink(value: Route.title(title.ref)) {
                    PosterCard(title: title, width: 150, rank: rank ? i + 1 : nil)
                        .zoomSource(title.id)
                }
                .buttonStyle(.plain)
                .contextMenu { TitleMenu(title: title) }
            }
        }
    }

    private func loadingRow(_ name: String) -> some View {
        Shelf(title: name) {
            ForEach(0..<4, id: \.self) { _ in
                RoundedRectangle(cornerRadius: 18).fill(Dx.raised).frame(width: 150, height: 225)
            }
        }
        .redacted(reason: .placeholder)
    }
}

/** A titled row of cards that scrolls sideways, snapping to each */
struct Shelf<Content: View>: View {
    var title: String
    var see: Route?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let see {
                NavigationLink(value: see) {
                    HStack(spacing: 4) {
                        Text(title).font(.title2.bold()).lineLimit(1)
                        Image(systemName: "chevron.right").font(.title3.weight(.bold)).foregroundStyle(Dx.muted)
                    }
                }
                .buttonStyle(.plain)
                .padding(.horizontal, Dx.gutter)
            } else {
                SectionHeader(title: title)
            }
            ScrollView(.horizontal) {
                LazyHStack(spacing: 14) { content }
                    .scrollTargetLayout()
                    .padding(.horizontal, Dx.gutter)
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollIndicators(.hidden)
        }
    }
}

/** Long-press on a title */
struct TitleMenu: View {
    @Environment(Stremio.self) private var stremio
    var title: Title
    var body: some View {
        NavigationLink(value: Route.title(title.ref)) { Label("Details", systemImage: "info.circle") }
        NavigationLink(value: Route.title(TitleRef(type: title.type, id: title.id, name: title.name, play: true))) { Label("Play", systemImage: "play.fill") }
    }
}

/** Continue Watching: plays where they left off; ⋯ for the rest */
private struct ContinueTile: View {
    @Environment(Stremio.self) private var stremio
    var item: Continue
    var width: CGFloat

    var body: some View {
        NavigationLink(value: Route.title(TitleRef(type: item.title.type, id: item.title.id, name: item.title.name, play: true))) {
            ContinueCard(item: item, width: width)
                .zoomSource(item.title.id)
        }
        .buttonStyle(.plain)
        .contextMenu {
            NavigationLink(value: Route.title(item.title.ref)) { Label("Details", systemImage: "info.circle") }
            Button(role: .destructive) { stremio.removeFromContinue(item.title.id) } label: { Label("Remove from Continue Watching", systemImage: "eye.slash") }
        }
    }
}

/**
 * The tall billboard at the top of Home: one title at a time, fading into the next (by itself every
 * few seconds, or with a swipe; either way the wait starts again). Tapping it opens the title; Play plays.
 */
private struct Billboard: View {
    @Environment(Stremio.self) private var stremio
    var titles: [Title]
    var height: CGFloat
    @State private var index = 0
    @State private var drag: CGFloat = 0
    @State private var opened: TitleRef?

    private var current: Title { titles[min(index, titles.count - 1)] }

    var body: some View {
        ZStack(alignment: .bottom) {
            ZStack {
                ForEach(Array(titles.enumerated()), id: \.element.id) { i, title in
                    if i == index { picture(title).transition(.opacity.combined(with: .scale(scale: 1.04))) }
                }
            }
            info(current)
                .id(current.id)
                .transition(.opacity)
            dots.padding(.bottom, 4)
        }
        .frame(height: height)
        .clipped()
        .offset(x: drag * 0.15)
        .contentShape(.rect)
        // a tap opens the title; a swipe only changes the slide (and Home still scrolls up and down)
        .onTapGesture { opened = current.ref }
        .navigationDestination(item: $opened) { TitleView(ref: $0) }
        .simultaneousGesture(
            DragGesture(minimumDistance: 20)
                .onChanged { v in if abs(v.translation.width) > abs(v.translation.height) { drag = v.translation.width } }
                .onEnded { v in
                    let swipe = v.translation.width
                    withAnimation(.snappy) { drag = 0 }
                    guard abs(swipe) > 50, abs(swipe) > abs(v.translation.height) else { return }
                    go(swipe < 0 ? index + 1 : index - 1)
                }
        )
        // turns by itself; any change (a swipe too) starts the wait again
        .task(id: "\(index)-\(titles.count)") {
            try? await Task.sleep(for: .seconds(8))
            if !Task.isCancelled && titles.count > 1 { go(index + 1) }
        }
    }

    private func go(_ i: Int) {
        guard !titles.isEmpty else { return }
        withAnimation(.easeInOut(duration: 0.7)) { index = (i + titles.count) % titles.count }
    }

    private func picture(_ title: Title) -> some View {
        Color.clear
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .overlay { Art(url: title.backdrop) }
            .clipped()
            .overlay(LinearGradient(stops: [.init(color: .black.opacity(0.35), location: 0), .init(color: .clear, location: 0.25), .init(color: .clear, location: 0.45), .init(color: .black, location: 0.92)], startPoint: .top, endPoint: .bottom))
    }

    private func info(_ title: Title) -> some View {
        VStack(spacing: 12) {
            Group {
                if let year = title.year { Badge(text: year) }
                TitleLogo(title: title, maxHeight: 110, textSize: 40)
                    .frame(maxWidth: 320)
                Text(([typeName(title.type)] + title.genres.prefix(2)).joined(separator: " · "))
                    .font(.subheadline)
                    .foregroundStyle(Dx.muted)
                if let d = title.description {
                    Text(d).font(.footnote).foregroundStyle(Dx.faint).lineLimit(2).multilineTextAlignment(.center).frame(maxWidth: 360)
                }
            }
            // (the words open the title too)
            .allowsHitTesting(false)
            HStack(spacing: 14) {
                NavigationLink(value: Route.title(TitleRef(type: title.type, id: title.id, name: title.name, play: true))) {
                    Label("Play", systemImage: "play.fill").font(.headline).frame(width: 150, height: 50)
                }
                .dxGlassProminentButton()
                .tint(.white)
                .foregroundStyle(.black)
                GlassCircle(icon: title.inLibrary ? "checkmark" : "plus", label: title.inLibrary ? "In your Library" : "Add to Library") {
                    stremio.setInLibrary(title, !title.inLibrary)
                    stremio.show(title.inLibrary ? "Removed from your Library" : "Added to your Library")
                }
            }
            .padding(.top, 4)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 34)
    }

    private var dots: some View {
        HStack(spacing: 8) {
            ForEach(titles.indices, id: \.self) { i in
                Capsule().fill(i == index ? .white : .white.opacity(0.4)).frame(width: i == index ? 22 : 7, height: 7)
            }
        }
        .animation(.snappy, value: index)
    }
}

/** The signed-in person: their Stremio picture, or their initial */
struct Avatar: View {
    var email: String?
    var size: CGFloat = 30
    var body: some View {
        Text(String((email ?? "?").prefix(1)).uppercased())
            .font(.system(size: size * 0.45, weight: .semibold))
            .frame(width: size, height: size)
            .background(LinearGradient(colors: [Color(red: 0.35, green: 0.6, blue: 0.75), Color(red: 0.2, green: 0.4, blue: 0.55)], startPoint: .top, endPoint: .bottom), in: .circle)
            .overlay(Circle().strokeBorder(.white.opacity(0.25), lineWidth: 1))
    }
}


/// Home's top-right buttons. iOS 26 sets the picture apart from the bar's glass capsule; before
/// iOS 26 there's no capsule, so the two plain buttons sit side by side.
private struct HomeToolbar: ViewModifier {
    @Binding var party: Bool
    @Binding var account: Bool
    let email: String?

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *) {
            content.toolbar {
                ToolbarItem(placement: .topBarTrailing) { partyButton }
                ToolbarSpacer(.fixed, placement: .topBarTrailing)
                // The picture is the button, a perfect circle (not inside the bar's glass capsule)
                ToolbarItem(placement: .topBarTrailing) { accountButton }
                    .sharedBackgroundVisibility(.hidden)
            }
        } else {
            content.toolbar {
                ToolbarItem(placement: .topBarTrailing) { partyButton }
                ToolbarItem(placement: .topBarTrailing) { accountButton }
            }
        }
    }

    private var partyButton: some View {
        Button { party = true } label: { Image(systemName: "person.2.fill") }
            .accessibilityLabel("Watch party")
    }

    private var accountButton: some View {
        Button { account = true } label: {
            Avatar(email: email, size: 44)
                .dxGlass(interactive: true, in: .circle)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Profile and settings")
    }
}

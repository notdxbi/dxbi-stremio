import SwiftUI

/** Posters in a grid that fits the screen */
struct PosterGrid: View {
    var items: [Title]
    var onEnd: (() -> Void)?

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 108, maximum: 170), spacing: 12)], spacing: 14) {
            ForEach(items) { title in
                NavigationLink(value: Route.title(title.ref)) {
                    Color.clear
                        .aspectRatio(2 / 3, contentMode: .fit)
                        .overlay { Art(url: title.art) }
                        .clipShape(.rect(cornerRadius: 14))
                        .overlay(alignment: .topTrailing) {
                            if title.watched {
                                Image(systemName: "checkmark.circle.fill").symbolRenderingMode(.palette).foregroundStyle(.black, .white).padding(6)
                            }
                        }
                        .zoomSource(title.id)
                }
                .buttonStyle(.plain)
                .contextMenu { TitleMenu(title: title) }
                .onAppear { if title.id == items.last?.id { onEnd?() } }
            }
        }
        .padding(.horizontal, 16)
    }
}

// MARK: - Search

struct SearchView: View {
    @Environment(Stremio.self) private var stremio
    @State private var query = ""
    @State private var searched = ""
    @AppStorage("recentSearches") private var recentText = ""

    private var recent: [String] { recentText.split(separator: "\n").map(String.init) }

    var body: some View {
        ScrollView {
            if searched.isEmpty {
                VStack(alignment: .leading, spacing: 14) {
                    if !recent.isEmpty {
                        HStack {
                            Text("Recent Searches").font(.title3.bold())
                            Spacer()
                            Button("Clear") { recentText = "" }.font(.subheadline)
                        }
                        ForEach(recent, id: \.self) { r in
                            Button { query = r; run() } label: {
                                Label(r, systemImage: "clock.arrow.circlepath").frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                            .padding(.vertical, 4)
                        }
                    }
                    hints.padding(.top, recent.isEmpty ? 60 : 30)
                }
                .padding(.horizontal, Dx.gutter)
            } else {
                LazyVStack(alignment: .leading, spacing: 28) {
                    let rows = stremio.search.filter { !$0.items.isEmpty }
                    ForEach(rows) { row in
                        Shelf(title: row.heading, see: row.discover.map { .browse(link: $0, name: row.heading) }) {
                            ForEach(row.items) { title in
                                NavigationLink(value: Route.title(title.ref)) {
                                    PosterCard(title: title, width: 130).zoomSource(title.id)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    if rows.isEmpty {
                        if stremio.search.contains(where: { $0.state == .loading }) || stremio.search.isEmpty {
                            ProgressView().frame(maxWidth: .infinity).padding(40)
                        } else {
                            ContentUnavailableView.search(text: searched)
                        }
                    }
                }
            }
        }
        .padding(.bottom, 30)
        .screenBackground()
        .navigationTitle("Search")
        .searchable(text: $query, prompt: "Films, shows, people")
        .onSubmit(of: .search, run)
        // a name tapped on a title's page
        .onChange(of: stremio.pendingSearch, initial: true) { _, q in
            guard let q else { return }
            stremio.pendingSearch = nil
            query = q
            run()
        }
        .onChange(of: query) { _, q in if q.isEmpty { searched = "" } }
        .task(id: query) {
            // as they type, after a moment's pause
            let q = query.trimmingCharacters(in: .whitespaces)
            guard q.count >= 3 else { return }
            try? await Task.sleep(for: .milliseconds(600))
            if !Task.isCancelled, q != searched { searched = q; stremio.search(q) }
        }
    }

    /** Nothing typed yet: what Search finds, as Stremio's desktop app says it */
    private var hints: some View {
        VStack(spacing: 30) {
            Text("You can search anything…").font(.title3).foregroundStyle(Dx.muted)
            HStack(alignment: .top, spacing: 12) {
                ForEach([("film.stack", "Movies, series & anime"), ("person.fill", "Actors, directors & writers"), ("tv", "Channels & TV from your addons")], id: \.0) { icon, label in
                    VStack(spacing: 12) {
                        Image(systemName: icon).font(.system(size: 34)).frame(height: 40)
                        Text(label).font(.footnote).multilineTextAlignment(.center)
                    }
                    .foregroundStyle(Dx.muted)
                    .frame(maxWidth: .infinity)
                }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func run() {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        searched = q
        stremio.search(q)
        recentText = ([q] + recent.filter { $0 != q }).prefix(8).joined(separator: "\n")
    }
}

// MARK: - Discover

/** Every catalog the addons have, by type, catalog and genre */
struct DiscoverView: View {
    @Environment(Stremio.self) private var stremio

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let d = stremio.discover {
                    pickers(d)
                    PosterGrid(items: d.items) { if d.nextPage { stremio.discoverMore() } }
                    if d.state == .loading { ProgressView().frame(maxWidth: .infinity).padding() }
                    if d.state == .failed { ContentUnavailableView("Nothing here", systemImage: "square.grid.2x2", description: Text("This catalog has nothing for that choice.")) }
                } else {
                    ProgressView().frame(maxWidth: .infinity).padding(60)
                }
            }
            .padding(.bottom, 30)
        }
        .screenBackground()
        .navigationTitle("Discover")
        .onAppear { stremio.discoverStart() }
        .onChange(of: stremio.allRows.count) { stremio.discoverStart() }
    }

    private func pickers(_ d: Discover) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if d.types.count > 1 {
                Picker("Type", selection: Binding(get: { d.types.first(where: \.selected)?.link ?? "" }, set: { stremio.discover(link: $0) })) {
                    ForEach(d.types) { t in Text(t.name == "movie" ? "Movies" : t.name == "series" ? "TV Shows" : typeName(t.name)).tag(t.link ?? "") }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
            }
            ScrollView(.horizontal) {
                HStack(spacing: 8) {
                    Menu {
                        ForEach(d.catalogs) { c in
                            Button { if let l = c.link { stremio.discover(link: l) } } label: {
                                if c.selected { Label(c.name, systemImage: "checkmark") } else { Text(c.name) }
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(d.catalogs.first(where: \.selected)?.name ?? "Catalog")
                            Image(systemName: "chevron.down").font(.caption.weight(.bold))
                        }
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 14).padding(.vertical, 8)
                        .glassEffect(.regular.interactive(), in: .capsule)
                    }
                    if !d.genres.isEmpty {
                        genre(nil, on: d.genre == nil)
                        ForEach(d.genres, id: \.self) { g in genre(g, on: d.genre == g) }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 2)
            }
            .scrollIndicators(.hidden)
        }
    }

    private func genre(_ g: String?, on: Bool) -> some View {
        Button { stremio.discoverGenre(g) } label: {
            Text(g ?? "All")
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14).padding(.vertical, 8)
                .foregroundStyle(on ? .black : .white)
                .background(on ? AnyShapeStyle(.white) : AnyShapeStyle(.clear), in: .capsule)
                .glassEffect(on ? .identity : .regular.interactive(), in: .capsule)
        }
        .buttonStyle(.plain)
    }
}

/** A row's See All */
struct BrowseView: View {
    @Environment(Stremio.self) private var stremio
    var link: String
    var name: String

    var body: some View {
        ScrollView {
            if let d = stremio.discover {
                PosterGrid(items: d.items) { if d.nextPage { stremio.discoverMore() } }
                if d.state == .loading { ProgressView().padding() }
            }
        }
        .padding(.bottom, 30)
        .screenBackground()
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { stremio.discover(link: link) }
    }
}

// MARK: - Library

/** What's saved to their Stremio library (synced with their other devices) */
struct LibraryView: View {
    @Environment(Stremio.self) private var stremio
    @State private var type: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Picker("Type", selection: $type) {
                    Text("All").tag(String?.none)
                    Text("Movies").tag(String?.some("movie"))
                    Text("TV Shows").tag(String?.some("series"))
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                if stremio.library.isEmpty {
                    ContentUnavailableView("Your Library Is Empty", systemImage: "rectangle.stack", description: Text("Tap + on a title to keep it here."))
                } else {
                    PosterGrid(items: stremio.library) { stremio.libraryMore() }
                }
            }
            .padding(.bottom, 30)
        }
        .screenBackground()
        .navigationTitle("Library")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink { DownloadsView() } label: { Image(systemName: "arrow.down.circle") }
                    .accessibilityLabel("Downloads")
            }
        }
        .onAppear { stremio.loadLibrary(type) }
        .onChange(of: type) { _, t in stremio.loadLibrary(t) }
    }
}

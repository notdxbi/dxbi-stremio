import SwiftUI
import UIKit
import WebKit

@main
struct DxbiApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var stremio: Stremio

    init() {
        // Posters and backdrops: kept so rows scroll and the app opens without fetching them again
        URLCache.shared = URLCache(memoryCapacity: 80 << 20, diskCapacity: 600 << 20)
        _stremio = State(initialValue: Stremio())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(stremio)
                .preferredColorScheme(.dark)
                .tint(.white)
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate {
    /** Upright, apart from the player, which turns the phone sideways */
    static var orientations: UIInterfaceOrientationMask = .portrait

    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        Self.orientations
    }

    /** Downloads finished while the app was away: iOS wakes it to hear about them */
    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        MainActor.assumeIsolated { Downloads.shared.backgroundDone = completionHandler }
    }
}

enum AppTab: Hashable { case home, discover, library, search }

/** Where a tab's stack can go */
enum Route: Hashable {
    case title(TitleRef)
    /** A row's See All: a Discover link and the row's name */
    case browse(link: String, name: String)
    case library
}

struct RootView: View {
    @Environment(Stremio.self) private var stremio
    @State private var tab = AppTab.home
    @State private var update: Updates.Release?
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        ZStack {
            // Stremio's page, working underneath (it has to be in the window to keep running)
            PageHost(webView: stremio.page.webView)
                .opacity(0.02)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
                .ignoresSafeArea()
            if stremio.account?.signedIn == true || stremio.guest {
                tabs
            } else {
                WelcomeView()
            }
        }
        .screenBackground()
        .overlay(alignment: .top) {
            if let message = stremio.message {
                Text(message)
                    .font(.subheadline.weight(.medium))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .dxGlass(in: .capsule)
                    .padding(.horizontal, 24)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .onTapGesture { stremio.message = nil }
            }
        }
        .animation(.spring(duration: 0.35), value: stremio.message)
        // A new release: offered once when the app opens or comes back (every few hours at most)
        .onChange(of: scenePhase, initial: true) { _, phase in
            guard phase == .active else { return }
            Task { if let found = await Updates.check() { update = found } }
        }
        .alert("dx.bi \(update?.version ?? "") is out", isPresented: Binding(get: { update != nil }, set: { if !$0 { update = nil } }), presenting: update) { release in
            Button("Open the Release") { UIApplication.shared.open(release.page) }
            Button("Skip This Version") { Updates.skip(release) }
            Button("Not Now", role: .cancel) {}
        } message: { _ in
            Text("You have \(Page.version). The release page has dxbi.ipa: install it over this one with SideStore, AltStore or Sideloadly, and your sign-in, settings and downloads stay.")
        }
    }

    private var tabs: some View {
        TabView(selection: $tab) {
            Tab("Home", systemImage: "house.fill", value: AppTab.home) {
                Stack { HomeView() }
            }
            Tab("Discover", systemImage: "square.grid.2x2.fill", value: AppTab.discover) {
                Stack { DiscoverView() }
            }
            Tab("Library", systemImage: "rectangle.stack.fill", value: AppTab.library) {
                Stack { LibraryView() }
            }
            Tab(value: AppTab.search, role: .search) {
                Stack { SearchView() }
            }
        }
        .dxMinimizeTabBarOnScroll()
        .onChange(of: stremio.pendingSearch) { _, q in if q != nil { tab = .search } }
    }
}

private struct ZoomKey: EnvironmentKey {
    static let defaultValue: Namespace.ID? = nil
}

extension EnvironmentValues {
    /** The tab's namespace: titles open by growing out of the card that was tapped */
    var zoom: Namespace.ID? {
        get { self[ZoomKey.self] }
        set { self[ZoomKey.self] = newValue }
    }
}

/** A tab's navigation, with every screen it can open */
struct Stack<Content: View>: View {
    @ViewBuilder var content: Content
    @Namespace private var zoom

    var body: some View {
        NavigationStack {
            content
                .navigationDestination(for: Route.self) { route in
                    Group {
                        switch route {
                        case .title(let ref):
                            TitleView(ref: ref)
                                .navigationTransition(.zoom(sourceID: ref.id, in: zoom))
                        case .browse(let link, let name):
                            BrowseView(link: link, name: name)
                        case .library:
                            LibraryView()
                        }
                    }
                }
        }
        .environment(\.zoom, zoom)
    }
}

extension View {
    /** The card a title opens from (see Stack) */
    @ViewBuilder
    func zoomSource(_ id: String) -> some View {
        modifier(ZoomSource(id: id))
    }
}

private struct ZoomSource: ViewModifier {
    var id: String
    @Environment(\.zoom) private var zoom
    func body(content: Content) -> some View {
        if let zoom { content.matchedTransitionSource(id: id, in: zoom) } else { content }
    }
}

/** The page, in the window but out of sight */
struct PageHost: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> PageBox {
        let box = PageBox()
        PageBox.home = box
        box.take(webView)
        return box
    }
    func updateUIView(_ view: PageBox, context: Context) {}
}

/**
 * Where the page is. A web view out of the window stops working (iOS pauses its page), and the
 * player's full-screen cover takes the app's screens, this one included, out of the window while it
 * shows: so the page goes along with the player, under the video, and comes back when it closes.
 * Without that, watch progress and how the player closed only reached Stremio now and then.
 */
final class PageBox: UIView {
    static weak var home: PageBox?

    func take(_ webView: WKWebView) {
        webView.alpha = 1
        webView.isUserInteractionEnabled = true
        webView.frame = bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(webView)
    }

    /** Under the player's picture (kept the size it was, so the page isn't laid out again) */
    static func lend(_ webView: WKWebView, to view: UIView) {
        let size = webView.bounds.size
        webView.autoresizingMask = []
        webView.frame = CGRect(origin: .zero, size: size.width > 0 ? size : CGSize(width: 400, height: 800))
        webView.alpha = 0.02
        webView.isUserInteractionEnabled = false
        view.insertSubview(webView, at: 0)
    }

    static func bringBack(_ webView: WKWebView) {
        home?.take(webView)
    }
}

import SwiftUI

// iOS 18 to 25: the same screens without iOS 26's Liquid Glass. Each helper uses the iOS 26 look when
// it's there, and the closest older one (frosted material, standard button styles) otherwise.

extension View {
    /// Liquid Glass behind a view (frosted material before iOS 26); `hidden` shows none, as `.identity` did
    @ViewBuilder
    func dxGlass<S: Shape>(interactive: Bool = false, hidden: Bool = false, in shape: S) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(hidden ? .identity : (interactive ? .regular.interactive() : .regular), in: shape)
        } else if hidden {
            self
        } else {
            self.background(.ultraThinMaterial, in: shape)
        }
    }

    @ViewBuilder
    func dxGlassButton() -> some View {
        if #available(iOS 26.0, *) { self.buttonStyle(.glass) } else { self.buttonStyle(.bordered) }
    }

    @ViewBuilder
    func dxGlassProminentButton() -> some View {
        if #available(iOS 26.0, *) { self.buttonStyle(.glassProminent) } else { self.buttonStyle(.borderedProminent) }
    }

    @ViewBuilder
    func dxMinimizeTabBarOnScroll() -> some View {
        if #available(iOS 26.0, *) { self.tabBarMinimizeBehavior(.onScrollDown) } else { self }
    }

    @ViewBuilder
    func dxScrollEdgeEffectHidden(_ hidden: Bool) -> some View {
        if #available(iOS 26.0, *) { self.scrollEdgeEffectHidden(hidden, for: .top) } else { self }
    }

    @ViewBuilder
    func dxNavigationSubtitle(_ text: String) -> some View {
        if #available(iOS 26.0, *) { self.navigationSubtitle(text) } else { self }
    }
}

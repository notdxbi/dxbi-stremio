import SwiftUI
import UIKit

/**
 * The player's own screen, sideways. Shown over the app (which stays upright underneath) rather than
 * as a SwiftUI cover: a cover turned the whole app sideways with it, and the title page came back
 * laid out wrong when it turned upright again.
 */
final class PlayerHost: UIHostingController<AnyView> {

    private static weak var shown: PlayerHost?

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .landscapeRight }
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }

    @MainActor
    static func show(_ playback: Playback, stremio: Stremio) {
        shown?.dismiss(animated: false)
        let host = PlayerHost(rootView: AnyView(PlayerScreen(playback: playback).environment(stremio).preferredColorScheme(.dark)))
        host.modalPresentationStyle = .fullScreen
        host.view.backgroundColor = .black
        shown = host
        present(host, playback: playback, tries: 0)
    }

    /**
     * iOS won't show it while something else is coming or going (the stream list closing as Play is
     * pressed): it waits for that, and tries again
     */
    @MainActor
    private static func present(_ host: PlayerHost, playback: Playback, tries: Int) {
        guard shown === host, host.presentingViewController == nil else { return }
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first,
              var top = scene.keyWindow?.rootViewController else { return }
        while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
        let busy = top.transitionCoordinator != nil || top.isBeingDismissed || top.isBeingPresented || top.presentedViewController != nil
        if busy {
            guard tries < 40 else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { present(host, playback: playback, tries: tries + 1) }
            return
        }
        // (sideways only once the player is there to be sideways)
        AppDelegate.orientations = .landscape
        top.present(host, animated: true)
    }

    @MainActor
    static func hide() {
        guard let host = shown else { return }
        shown = nil
        AppDelegate.orientations = .portrait
        let presenter = host.presentingViewController
        host.dismiss(animated: true) {
            presenter?.setNeedsUpdateOfSupportedInterfaceOrientations()
            (presenter?.view.window?.windowScene)?.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait)) { _ in }
        }
    }
}

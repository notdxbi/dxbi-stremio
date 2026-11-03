import AVKit
import CoreMedia

/**
 * Picture in picture for mpv's layer: iOS shows the layer in a small window and asks this what's
 * playing (from the layer's clock) and to play, pause and skip. Starts by itself when they leave
 * the app while a video plays.
 */
@MainActor
final class PictureInPicture: NSObject {
    private var controller: AVPictureInPictureController?
    private let mpv: MPV

    var active: Bool { controller?.isPictureInPictureActive ?? false }
    var possible: Bool { controller?.isPictureInPicturePossible ?? false }

    init(mpv: MPV) {
        self.mpv = mpv
        super.init()
        guard AVPictureInPictureController.isPictureInPictureSupported() else { return }
        let source = AVPictureInPictureController.ContentSource(sampleBufferDisplayLayer: mpv.layer, playbackDelegate: self)
        controller = AVPictureInPictureController(contentSource: source)
        controller?.requiresLinearPlayback = false
        controller?.canStartPictureInPictureAutomaticallyFromInline = true
    }

    func start() { if possible { controller?.startPictureInPicture() } }

    /** The player closed: no more picture in picture (iOS kept offering an empty one on leaving the app) */
    func end() {
        controller?.canStartPictureInPictureAutomaticallyFromInline = false
        controller?.stopPictureInPicture()
        controller?.contentSource = nil
        controller = nil
    }

    /** Tells the small window that playing, paused or the length changed */
    func refresh() { if active { controller?.invalidatePlaybackState() } }
}

extension PictureInPicture: AVPictureInPictureSampleBufferPlaybackDelegate {
    nonisolated func pictureInPictureController(_ c: AVPictureInPictureController, setPlaying playing: Bool) {
        MainActor.assumeIsolated { playing ? mpv.play() : mpv.pause() }
    }

    nonisolated func pictureInPictureControllerTimeRangeForPlayback(_ c: AVPictureInPictureController) -> CMTimeRange {
        MainActor.assumeIsolated {
            mpv.duration > 0 ? CMTimeRange(start: .zero, duration: CMTime(seconds: mpv.duration, preferredTimescale: 1000))
                : CMTimeRange(start: .zero, duration: .positiveInfinity)
        }
    }

    nonisolated func pictureInPictureControllerIsPlaybackPaused(_ c: AVPictureInPictureController) -> Bool {
        MainActor.assumeIsolated { mpv.paused }
    }

    nonisolated func pictureInPictureController(_ c: AVPictureInPictureController, didTransitionToRenderSize size: CMVideoDimensions) {}

    nonisolated func pictureInPictureController(_ c: AVPictureInPictureController, skipByInterval interval: CMTime, completion: @escaping () -> Void) {
        MainActor.assumeIsolated { mpv.seek(by: CMTimeGetSeconds(interval)) }
        completion()
    }
}

import Foundation
import UIKit

/** Players on the phone a stream can be handed to (Settings → Play videos in, and Play with External Player) */
struct OtherApp: Identifiable, Hashable {
    var id: String
    var name: String
    /** What the app opens a stream with */
    var link: (String) -> String

    static let all: [OtherApp] = [
        OtherApp(id: "infuse", name: "Infuse") { "infuse://x-callback-url/play?url=\($0)" },
        OtherApp(id: "vlc", name: "VLC") { "vlc-x-callback://x-callback-url/stream?url=\($0)" },
        OtherApp(id: "outplayer", name: "Outplayer") { "outplayer://\($0)" },
        OtherApp(id: "senplayer", name: "SenPlayer") { "senplayer://x-callback-url/play?url=\($0)" },
    ]

    static func == (a: OtherApp, b: OtherApp) -> Bool { a.id == b.id }
    func hash(into h: inout Hasher) { h.combine(id) }

    var installed: Bool {
        guard let probe = URL(string: link("x").components(separatedBy: "://")[0] + "://") else { return false }
        return UIApplication.shared.canOpenURL(probe)
    }

    /** The one chosen in Settings, else the first one on the phone */
    @MainActor
    static func find(_ id: String?) -> OtherApp? {
        all.first { $0.id == id && $0.installed } ?? all.first { $0.installed }
    }

    func link(_ payload: JSON) -> URL? {
        let url = payload.string("url")
        guard !url.isEmpty, let encoded = url.addingPercentEncoding(withAllowedCharacters: .alphanumerics) else { return nil }
        return URL(string: link(id == "outplayer" ? url : encoded))
    }
}

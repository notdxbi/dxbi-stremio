import CoreImage
import SwiftUI
import UIKit

enum Dx {
    /** dx.bi's red (Netflix's): progress, what's chosen */
    static let accent = Color(red: 0.898, green: 0.035, blue: 0.078)
    static let background = Color.black
    static let raised = Color(white: 0.12)
    static let muted = Color.white.opacity(0.62)
    static let faint = Color.white.opacity(0.4)
    static let gutter: CGFloat = 20
}

/** DX.BI in Bebas Neue, as on the desktop */
struct Logo: View {
    var size: CGFloat = 30
    var body: some View {
        Text("DX.BI")
            .font(.custom("BebasNeue-Regular", size: size))
            .foregroundStyle(Dx.accent)
            .shadow(color: Dx.accent.opacity(0.55), radius: size / 5)
            .accessibilityLabel("dx.bi")
    }
}

// MARK: - Pictures

/** A picture from the web, kept in memory and on disk (URLCache) so rows scroll without reloading */
struct Art: View {
    var url: URL?
    var contentMode: ContentMode = .fill

    var body: some View {
        AsyncImage(url: url, transaction: Transaction(animation: .easeOut(duration: 0.25))) { phase in
            if let image = phase.image {
                image.resizable().aspectRatio(contentMode: contentMode)
            } else {
                Rectangle().fill(Dx.raised)
            }
        }
    }
}

/** A title's logo (its name drawn as on the poster), or its name in large type when it has none */
struct TitleLogo: View {
    var title: Title
    var maxHeight: CGFloat = 100
    var textSize: CGFloat = 34
    var alignment: Alignment = .center

    var body: some View {
        AsyncImage(url: title.logoURL) { phase in
            if let image = phase.image {
                image.resizable().scaledToFit().frame(maxHeight: maxHeight, alignment: alignment)
                    .shadow(color: .black.opacity(0.5), radius: 12)
            } else if case .empty = phase, title.logoURL != nil {
                Color.clear.frame(height: maxHeight * 0.6)
            } else {
                Text(title.name)
                    .font(.system(size: textSize, weight: .heavy))
                    .multilineTextAlignment(alignment == .leading ? .leading : .center)
                    .lineLimit(3)
                    .minimumScaleFactor(0.6)
                    .shadow(color: .black.opacity(0.5), radius: 10)
            }
        }
    }
}

/** The main colour of a picture, darkened to sit behind white text (a title's page takes its art's colour) */
@MainActor
enum ArtColour {
    private static var known: [URL: Color] = [:]
    private static let context = CIContext(options: [.workingColorSpace: NSNull()])

    static func of(_ url: URL?) async -> Color? {
        guard let url else { return nil }
        if let c = known[url] { return c }
        guard let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }
        let colour: Color? = await Task.detached(priority: .utility) {
            guard let image = CIImage(data: data),
                  let filter = CIFilter(name: "CIAreaAverage", parameters: [kCIInputImageKey: image, kCIInputExtentKey: CIVector(cgRect: image.extent)]),
                  let output = filter.outputImage else { return nil }
            var pixel = [UInt8](repeating: 0, count: 4)
            CIContext(options: [.workingColorSpace: NSNull()]).render(output, toBitmap: &pixel, rowBytes: 4, bounds: CGRect(x: 0, y: 0, width: 1, height: 1), format: .RGBA8, colorSpace: nil)
            var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            UIColor(red: CGFloat(pixel[0]) / 255, green: CGFloat(pixel[1]) / 255, blue: CGFloat(pixel[2]) / 255, alpha: 1).getHue(&h, saturation: &s, brightness: &b, alpha: &a)
            // dark enough for white text, a little colour kept
            return Color(hue: h, saturation: min(s, 0.55), brightness: min(max(b * 0.62, 0.16), 0.42))
        }.value
        if let colour { known[url] = colour }
        return colour
    }
}

// MARK: - Buttons

/** Apple TV's white Play pill */
struct PrimaryPill: View {
    var label: String
    var icon: String = "play.fill"
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Label(label, systemImage: icon)
                .font(.headline)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 50)
        }
        .dxGlassProminentButton()
        .tint(.white)
        .foregroundStyle(.black)
        .buttonBorderShape(.capsule)
    }
}

/** A round glass button (+, ✓, ⋯) */
struct GlassCircle: View {
    var icon: String
    var label: String
    var size: CGFloat = 50
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: size * 0.4, weight: .semibold))
                .frame(width: size - 14, height: size - 14)
                .contentTransition(.symbolEffect(.replace))
        }
        .dxGlassButton()
        .buttonBorderShape(.circle)
        .accessibilityLabel(label)
    }
}

/** "Continue Watching ›": a row's title, which opens all of it */
struct SectionHeader: View {
    var title: String
    var action: (() -> Void)?
    var body: some View {
        Button {
            action?()
        } label: {
            HStack(spacing: 4) {
                Text(title).font(.title2.bold()).lineLimit(1)
                if action != nil { Image(systemName: "chevron.right").font(.title3.weight(.bold)).foregroundStyle(Dx.muted) }
            }
            .foregroundStyle(.white)
        }
        .buttonStyle(.plain)
        .disabled(action == nil)
        .padding(.horizontal, Dx.gutter)
    }
}

/** A small outlined tag (New, 4K, HDR…) */
struct Badge: View {
    var text: String
    var filled = false
    var colour: Color = .white
    var body: some View {
        Text(text)
            .font(.caption.weight(.bold))
            .padding(.horizontal, 7)
            .padding(.vertical, 2.5)
            .foregroundStyle(filled ? .black : colour)
            .background(filled ? AnyShapeStyle(colour) : AnyShapeStyle(.clear), in: .rect(cornerRadius: 5))
            .overlay(RoundedRectangle(cornerRadius: 5).strokeBorder(filled ? .clear : colour.opacity(0.7), lineWidth: 1.2))
    }
}

/** A thin progress line */
struct ProgressLine: View {
    var value: Double
    var colour: Color = .white
    var body: some View {
        GeometryReader { g in
            Capsule().fill(.white.opacity(0.3))
                .overlay(alignment: .leading) { Capsule().fill(colour).frame(width: g.size.width * min(max(value, 0), 1)) }
        }
        .frame(height: 4)
    }
}

extension View {
    /** The page's black, edge to edge */
    func screenBackground() -> some View { background(Dx.background.ignoresSafeArea()) }
}

/** "S1, E3" from Stremio's video id (tt0000:1:3) */
func episodeLabel(_ videoId: String?) -> String? {
    guard let parts = videoId?.split(separator: ":"), parts.count >= 3, let s = Int(parts[parts.count - 2]), let e = Int(parts[parts.count - 1]) else { return nil }
    return "S\(s), E\(e)"
}

func typeName(_ type: String) -> String {
    switch type {
    case "movie": "Movie"
    case "series": "TV Show"
    case "anime": "Anime"
    case "channel": "Channel"
    case "tv": "Live TV"
    default: type.capitalized
    }
}

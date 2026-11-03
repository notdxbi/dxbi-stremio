import SwiftUI

/** Films and episodes saved to watch offline */
struct DownloadsView: View {
    @Environment(Stremio.self) private var stremio
    private var downloads: Downloads { Downloads.shared }

    var body: some View {
        List {
            if downloads.items.isEmpty {
                ContentUnavailableView("No Downloads", systemImage: "arrow.down.circle", description: Text("Download a film or episode from its stream list (hold a stream) to watch it offline."))
                    .listRowBackground(Color.clear)
            }
            ForEach(downloads.items) { item in
                Button { if item.state == .done { stremio.play(download: item) } } label: { row(item) }
                    .buttonStyle(.plain)
                    .swipeActions {
                        Button(role: .destructive) { downloads.remove(item) } label: { Label("Delete", systemImage: "trash") }
                            // (the app's white tint made it a blank white circle)
                            .tint(.red)
                    }
                    .contextMenu {
                        if item.state == .done { Button { stremio.play(download: item) } label: { Label("Play", systemImage: "play.fill") } }
                        Button(role: .destructive) { downloads.remove(item) } label: { Label(item.state == .downloading ? "Cancel" : "Delete", systemImage: "trash") }
                    }
            }
        }
        .navigationTitle("Downloads")
    }

    private func row(_ item: Downloads.Item) -> some View {
        HStack(spacing: 14) {
            Art(url: item.art)
                .frame(width: 112, height: 63)
                .clipShape(.rect(cornerRadius: 10))
                .overlay {
                    if item.state == .done { Image(systemName: "play.circle.fill").font(.title2).foregroundStyle(.white).shadow(radius: 4) }
                }
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title).font(.headline).lineLimit(1)
                if !item.subtitle.isEmpty { Text(item.subtitle).font(.subheadline).foregroundStyle(Dx.muted).lineLimit(1) }
                switch item.state {
                case .downloading:
                    ProgressLine(value: item.progress, colour: Dx.accent)
                    Text(item.expected > 0 ? "\(size(item.written)) of \(size(item.expected))" : "Starting…").font(.caption).foregroundStyle(Dx.muted)
                case .done:
                    Text(size(max(item.written, item.expected))).font(.caption).foregroundStyle(Dx.muted)
                case .failed:
                    Text("Couldn't download: swipe to delete, then try again").font(.caption).foregroundStyle(.red)
                }
            }
        }
        .padding(.vertical, 4)
        .contentShape(.rect)
    }

    private func size(_ bytes: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }
}

/** Report a problem: what went wrong, sent with dx.bi's own report (as on the desktop and TV) */
struct ReportView: View {
    @Environment(Stremio.self) private var stremio
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var sending = false
    @State private var sent: String?
    @State private var problem: String?

    var body: some View {
        Form {
            if let sent {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Report sent", systemImage: "checkmark.circle.fill").font(.headline).foregroundStyle(.green)
                        Text("Thanks! Your report code is **\(sent)**. Post it in dx.bi's Discord (#bug-reports) so it can be matched to you.")
                        Button("Copy the Code") { UIPasteboard.general.string = sent }
                    }
                    .padding(.vertical, 6)
                }
            } else {
                Section {
                    TextField("What went wrong, and what were you doing?", text: $text, axis: .vertical)
                        .lineLimit(5...12)
                } footer: {
                    Text("dx.bi adds its version, this phone's model, your settings, addon names and recent errors. No passwords, keys or stream links are sent.")
                }
                if let problem { Section { Text(problem).foregroundStyle(.red) } }
                Section {
                    Button {
                        sending = true
                        problem = nil
                        Task {
                            switch await stremio.report(text) {
                            case .success(let code): sent = code
                            case .failure(let failure): problem = failure.message
                            }
                            sending = false
                        }
                    } label: {
                        HStack {
                            Text(sending ? "Sending…" : "Send Report")
                            if sending { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(sending)
                }
            }
        }
        .navigationTitle("Report a Problem")
    }
}

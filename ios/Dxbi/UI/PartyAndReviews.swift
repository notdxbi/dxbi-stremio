import SwiftUI

/** dx.bi's watch party: start one or join with a code; everyone streams from their own addons */
struct PartyView: View {
    @Environment(Stremio.self) private var stremio
    @Environment(\.dismiss) private var dismiss
    @AppStorage("partyName") private var name = ""
    @State private var code = ""
    @State private var state: JSON?
    @State private var busy = false
    @State private var message = ""

    private var active: Bool { state?.bool("active") == true }

    var body: some View {
        NavigationStack {
            List {
                if active, let state { lobby(state) } else { start }
            }
            .navigationTitle("Watch Party")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done", systemImage: "checkmark") { dismiss() } } }
            .task {
                // kept current while it's open: who's here, what's playing, the chat
                while !Task.isCancelled {
                    state = await stremio.party()
                    try? await Task.sleep(for: .seconds(2))
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    @ViewBuilder
    private var start: some View {
        Section {
            TextField("Your name", text: $name)
        } footer: {
            Text("Watch together, in sync, with friends anywhere. End-to-end encrypted.")
        }
        Section("Start a party") {
            Button { go { await stremio.startParty(name: name) } } label: { Label("Start a Party", systemImage: "person.2.fill") }
                .disabled(name.isEmpty || busy)
        }
        Section("Join a party") {
            TextField("Party code", text: $code)
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
            Button { go { await stremio.joinParty(code: code, name: name) } } label: { Label("Join", systemImage: "arrow.right.circle.fill") }
                .disabled(name.isEmpty || code.isEmpty || busy)
        }
    }

    @ViewBuilder
    private func lobby(_ s: JSON) -> some View {
        Section {
            VStack(spacing: 6) {
                Text(s.string("code")).font(.system(size: 34, weight: .bold, design: .monospaced))
                Text(s.bool("connected") ? "Connected" : "Connecting…").font(.footnote).foregroundStyle(Dx.muted)
                if let code = s.text("code") { ShareLink(item: "Join my dx.bi watch party: \(code)") { Label("Invite", systemImage: "square.and.arrow.up") }.padding(.top, 4) }
            }
            .frame(maxWidth: .infinity)
        }
        if let media = s.object("media") {
            Section("Playing") { Label(media.string("title"), systemImage: media.bool("playing") ? "play.fill" : "pause.fill") }
        }
        Section("People") {
            ForEach(Array(s.objects("members").enumerated()), id: \.offset) { _, m in
                VStack(alignment: .leading) {
                    Text(m.string("name") + (m.bool("self") ? " (you)" : "") + (m.bool("host") ? " · Host" : "")).font(.headline)
                    Text(m.string("line")).font(.footnote).foregroundStyle(Dx.muted)
                }
            }
        }
        Section("Chat") {
            ForEach(Array(s.objects("chat").enumerated()), id: \.offset) { _, m in
                Text("\(Text(m.string("name") + ":").bold()) \(m.string("text"))")
            }
            HStack {
                TextField("Say something", text: $message).onSubmit(say)
                Button("Send", action: say).disabled(message.isEmpty)
            }
        }
        Section {
            Button("Leave Party", role: .destructive) { stremio.leaveParty() }
        }
    }

    private func say() {
        guard !message.isEmpty else { return }
        stremio.sayInParty(message)
        message = ""
    }

    private func go(_ work: @escaping () async -> String?) {
        busy = true
        Task {
            if let problem = await work() { stremio.show(problem) }
            state = await stremio.party()
            busy = false
        }
    }
}

/** Scores and reviews: MDBList, Wikidata, TMDB (with keys set in dx.bi settings) */
struct ReviewsView: View {
    var title: Title
    var reviews: Reviews?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if let r = reviews {
                    if !r.scores.isEmpty {
                        Section("Scores") {
                            ForEach(r.scores) { s in
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(s.name).font(.headline)
                                        if !s.note.isEmpty { Text(s.note).font(.footnote).foregroundStyle(Dx.muted) }
                                    }
                                    Spacer()
                                    Text(s.value).font(.title3.bold())
                                }
                            }
                        }
                    }
                    if !r.critics.isEmpty {
                        Section("Critics") { ForEach(r.critics, id: \.self) { Text($0).font(.subheadline) } }
                    }
                    Section(r.audienceTotal > 0 ? "Audience · \(r.audienceTotal)" : "Audience") {
                        if r.audience.isEmpty {
                            Text(r.audienceProblem ?? "No audience reviews for this one.").foregroundStyle(Dx.muted)
                        }
                        ForEach(r.audience) { review in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(review.author).font(.headline)
                                    if let rating = review.rating { Label(String(format: "%.0f", rating), systemImage: "star.fill").font(.footnote).foregroundStyle(.yellow) }
                                    Spacer()
                                    Text(review.date).font(.caption).foregroundStyle(Dx.muted)
                                }
                                Text(review.text).font(.subheadline).lineLimit(12)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    if let p = r.problem { Section { Text(p).font(.footnote).foregroundStyle(Dx.muted) } }
                } else {
                    ProgressView()
                }
            }
            .navigationTitle(title.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done", systemImage: "checkmark") { dismiss() } } }
        }
    }
}

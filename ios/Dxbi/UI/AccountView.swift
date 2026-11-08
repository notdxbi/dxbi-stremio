import SwiftUI

/** The first screen until they sign in (or choose to go without an account) */
struct WelcomeView: View {
    @Environment(Stremio.self) private var stremio
    @State private var email = ""
    @State private var password = ""
    @State private var busy = false
    @State private var problem: String?

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                Logo(size: 84).padding(.top, 80)
                Text("Sign in with your Stremio account.\nYour addons, library and progress come with it.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Dx.muted)
                VStack(spacing: 12) {
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(16)
                        .dxGlass(in: .rect(cornerRadius: 18))
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .padding(16)
                        .dxGlass(in: .rect(cornerRadius: 18))
                        .onSubmit(signIn)
                }
                .padding(.top, 20)
                if let problem { Text(problem).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center) }
                PrimaryPill(label: busy ? "Signing In…" : "Sign In", icon: "person.fill") { signIn() }
                    .disabled(busy || email.isEmpty || password.isEmpty || !stremio.ready)
                if !stremio.ready {
                    Label("Starting Stremio…", systemImage: "hourglass").font(.footnote).foregroundStyle(Dx.faint)
                }
                Button("Continue Without an Account") { stremio.guest = true }
                    .font(.subheadline.weight(.semibold))
                    .padding(.top, 6)
                Link("Create a Stremio account", destination: URL(string: "https://www.stremio.com/register")!)
                    .font(.footnote)
                    .foregroundStyle(Dx.muted)
            }
            .frame(maxWidth: 420)
            .padding(.horizontal, 28)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(
            LinearGradient(colors: [Dx.accent.opacity(0.25), .black, .black], startPoint: .top, endPoint: .bottom).ignoresSafeArea()
        )
    }

    private func signIn() {
        busy = true
        problem = nil
        Task {
            problem = await stremio.signIn(email: email.trimmingCharacters(in: .whitespaces), password: password)
            busy = false
        }
    }
}

/** Profile: the account, addons, settings, Customise Home */
struct AccountView: View {
    @Environment(Stremio.self) private var stremio
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        @Bindable var stremio = stremio
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 14) {
                        Avatar(email: stremio.account?.email).scaleEffect(1.6).frame(width: 52, height: 52)
                        VStack(alignment: .leading) {
                            Text(stremio.account?.email ?? "Not signed in").font(.headline)
                            Text(stremio.account?.signedIn == true ? "Stremio account" : "Using dx.bi without an account").font(.footnote).foregroundStyle(Dx.muted)
                        }
                    }
                    .padding(.vertical, 6)
                }
                Section {
                    NavigationLink { AddonsView() } label: { Label("Addons", systemImage: "puzzlepiece.extension.fill") }
                    NavigationLink { DownloadsView() } label: { Label("Downloads", systemImage: "arrow.down.circle.fill") }
                    NavigationLink { StatsView() } label: { Label("Your Stats", systemImage: "chart.bar.fill") }
                    NavigationLink { CustomiseHomeView() } label: { Label("Customise Home", systemImage: "square.stack.3d.up.fill") }
                    NavigationLink { DxbiSettingsView() } label: { Label("dx.bi Settings", systemImage: "slider.horizontal.3") }
                    NavigationLink { PlaybackSettingsView() } label: { Label("Playback", systemImage: "play.rectangle.fill") }
                }
                Section {
                    NavigationLink { ReportView() } label: { Label("Report a Problem", systemImage: "exclamationmark.bubble.fill") }
                }
                Section {
                    if stremio.account?.signedIn == true {
                        Button("Sign Out", role: .destructive) {
                            stremio.signOut()
                            dismiss()
                        }
                    } else {
                        Button("Sign In") {
                            stremio.guest = false
                            dismiss()
                        }
                    }
                } footer: {
                    Text("dx.bi \(Page.version) · Not affiliated with Stremio.")
                }
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done", systemImage: "checkmark") { dismiss() } }
            }
        }
    }
}

// MARK: - Addons

struct AddonsView: View {
    @Environment(Stremio.self) private var stremio
    @State private var list = "installed"
    @State private var link = ""
    @State private var busy: String?

    var body: some View {
        List {
            Section {
                Picker("List", selection: $list) {
                    Text("Installed").tag("installed")
                    Text("Official").tag("official")
                    Text("Community").tag("community")
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
            }
            if list == "installed" {
                Section("Add from a link") {
                    HStack {
                        TextField("https://…/manifest.json", text: $link)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Button("Install") { act("link") { await stremio.install(link: link) } }
                            .disabled(link.isEmpty || busy != nil)
                    }
                }
            }
            Section {
                let addons = list == "installed" ? stremio.installedAddons : stremio.remoteAddons
                if list != "installed" && stremio.remoteAddonsLoading && addons.isEmpty { ProgressView() }
                ForEach(addons) { addon in row(addon) }
            }
        }
        .navigationTitle("Addons")
        .onAppear { stremio.loadAddons() }
        .onChange(of: list) { _, l in if l != "installed" { stremio.loadRemoteAddons(l) } }
    }

    private func row(_ addon: Addon) -> some View {
        let installed = addon.installed || stremio.installedAddons.contains { $0.transportUrl == addon.transportUrl }
        return HStack(spacing: 12) {
            AsyncImage(url: URL(string: addon.logo ?? "")) { phase in
                if let i = phase.image { i.resizable().scaledToFit() } else { Image(systemName: "puzzlepiece.extension").foregroundStyle(Dx.muted) }
            }
            .frame(width: 40, height: 40)
            .background(Dx.raised, in: .rect(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text(addon.name).font(.headline)
                Text(addon.description).font(.footnote).foregroundStyle(Dx.muted).lineLimit(2)
            }
            Spacer()
            if busy == addon.transportUrl {
                ProgressView()
            } else if installed {
                Menu {
                    if addon.configurable, let url = addon.configureURL { Link(destination: url) { Label("Configure", systemImage: "gearshape") } }
                    if !addon.isProtected {
                        Button(role: .destructive) { act(addon.transportUrl) { await stremio.uninstall(addon) } } label: { Label("Uninstall", systemImage: "trash") }
                    }
                } label: { Image(systemName: "ellipsis.circle").font(.title3) }
            } else {
                Button("Get") { act(addon.transportUrl) { await stremio.install(addon) } }
                    .dxGlassButton()
                    .font(.subheadline.weight(.bold))
            }
        }
    }

    private func act(_ key: String, _ work: @escaping () async -> String?) {
        busy = key
        Task {
            let problem = await work()
            busy = nil
            if let problem { stremio.show(problem) } else if key == "link" { link = ""; stremio.show("Installed") }
            stremio.loadAddons()
        }
    }
}

// MARK: - Settings

/** dx.bi settings: the same list the TV shows */
struct DxbiSettingsView: View {
    @Environment(Stremio.self) private var stremio
    @State private var settings: [Setting]?

    /** How Stremio's page looks: the app's own screens don't use these */
    private static let webOnly: Set<String> = [
        "liteMode", "builtInTheme", "previews", "ratings", "animeTitles", "wideContinue", "librarySort", "trailers",
        "whoIsWatching", "addonTools", "posterAccent", "crispPosters", "streamTools", "streamRows", "splash", "introSound",
        "profileSync", "uiSounds", "focusColour", "videoRowsOnly", "newEpisodes", "accent", "tvTorrents",
    ]

    var body: some View {
        List {
            if let settings {
                let groups = settings.reduce(into: [String]()) { if !$0.contains($1.group) { $0.append($1.group) } }
                ForEach(groups, id: \.self) { group in
                    Section(group.isEmpty ? "General" : group) {
                        ForEach(settings.filter { $0.group == group }) { s in SettingRow(setting: s) { json in save(s, json) } }
                    }
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle("dx.bi Settings")
        .task { settings = await stremio.settings().filter { !Self.webOnly.contains($0.key) } }
    }

    private func save(_ s: Setting, _ json: String) {
        if let i = settings?.firstIndex(where: { $0.key == s.key }) { settings?[i].value = json }
        Task { await stremio.saveSetting(s.key, json: json) }
    }
}

private struct SettingRow: View {
    var setting: Setting
    var onChange: (String) -> Void
    @State private var text = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            switch setting.type {
            case "toggle":
                Toggle(setting.label, isOn: Binding(get: { setting.isOn }, set: { onChange($0 ? "true" : "false") }))
                    .tint(Dx.accent)
            case "select":
                Picker(setting.label, selection: Binding(get: { setting.value }, set: { onChange($0) })) {
                    ForEach(setting.options, id: \.value) { Text($0.label).tag($0.value) }
                }
            default:
                Text(setting.label)
                TextField("Not set", text: $text)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit { onChange(Json.encode(text)) }
                    .onAppear { text = setting.textValue }
            }
            if !setting.description.isEmpty {
                Text(setting.description).font(.footnote).foregroundStyle(Dx.muted)
            }
        }
    }
}

/** Stremio's own player settings, and where videos play */
struct PlaybackSettingsView: View {
    @Environment(Stremio.self) private var stremio
    @State private var server = ""

    var body: some View {
        @Bindable var stremio = stremio
        let settings = stremio.profileSettings
        List {
            Section {
                Picker("Play videos in", selection: $stremio.otherApp) {
                    Text("dx.bi").tag(String?.none)
                    ForEach(OtherApp.all) { app in Text(app.name + (app.installed ? "" : " (not installed)")).tag(String?.some(app.id)) }
                }
            } footer: {
                Text("dx.bi's player plays almost anything. Another app keeps no watch progress in Stremio.")
            }
            Section("Languages") {
                LanguagePicker(title: "Audio", value: settings.string("audioLanguage")) { stremio.updateSettings(["audioLanguage": $0]) }
                LanguagePicker(title: "Subtitles", value: settings.string("subtitlesLanguage")) { stremio.updateSettings(["subtitlesLanguage": $0]) }
            }
            Section {
                TextField("http://192.168.1.10:11470", text: $server)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit { stremio.updateSettings(["streamingServerUrl": server]) }
                    .onAppear { server = settings.string("streamingServerUrl") }
            } header: {
                Text("Streaming server")
            } footer: {
                Text("Torrents need Stremio (or dx.bi) running on a computer: put its address here. Debrid streams play without one.")
            }
        }
        .navigationTitle("Playback")
    }
}

private struct LanguagePicker: View {
    var title: String
    var value: String
    var onPick: (String) -> Void
    private static let languages: [(String, String)] = [
        ("eng", "English"), ("spa", "Spanish"), ("fre", "French"), ("ger", "German"), ("ita", "Italian"), ("por", "Portuguese"),
        ("ara", "Arabic"), ("urd", "Urdu"), ("hin", "Hindi"), ("tur", "Turkish"), ("rus", "Russian"), ("jpn", "Japanese"),
        ("kor", "Korean"), ("chi", "Chinese"), ("dut", "Dutch"), ("pol", "Polish"), ("swe", "Swedish"), ("per", "Persian"),
    ]
    var body: some View {
        Picker(title, selection: Binding(get: { value }, set: onPick)) {
            if !Self.languages.contains(where: { $0.0 == value }) { Text(value.isEmpty ? "Default" : value).tag(value) }
            ForEach(Self.languages, id: \.0) { Text($0.1).tag($0.0) }
        }
    }
}

/** Customise Home: which catalog rows show, and in what order */
struct CustomiseHomeView: View {
    @Environment(Stremio.self) private var stremio
    @State private var keys: [String] = []
    @State private var hidden: Set<String> = []

    var body: some View {
        let byKey = Dictionary(stremio.allRows.map { ($0.key, $0) }, uniquingKeysWith: { a, _ in a })
        List {
            Section {
                ForEach(keys, id: \.self) { key in
                    if let row = byKey[key] {
                        Toggle(isOn: Binding(get: { !hidden.contains(key) }, set: { on in if on { hidden.remove(key) } else { hidden.insert(key) }; save() })) {
                            VStack(alignment: .leading) {
                                Text(stremio.layout.names[key] ?? row.heading)
                                Text(row.addon).font(.footnote).foregroundStyle(Dx.muted)
                            }
                        }
                    }
                }
                .onMove { from, to in keys.move(fromOffsets: from, toOffset: to); save() }
                .tint(Dx.accent)
            } footer: {
                Text("Drag to reorder. dx.bi saves this to your profile, so your other devices follow it.")
            }
        }
        .environment(\.editMode, .constant(.active))
        .navigationTitle("Customise Home")
        .onAppear {
            let all = stremio.allRows.map(\.key)
            keys = stremio.layout.order.filter(all.contains) + all.filter { !stremio.layout.order.contains($0) }
            hidden = stremio.layout.hidden
        }
    }

    private func save() {
        var layout = stremio.layout
        layout.order = keys
        layout.hidden = hidden
        stremio.saveLayout(layout)
    }
}

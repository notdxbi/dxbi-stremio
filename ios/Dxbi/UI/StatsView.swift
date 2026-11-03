import Charts
import SwiftUI

/** Your stats: how long you've watched, what and when (dx.bi's Watch stats, counted on this phone) */
struct StatsView: View {
    @Environment(Stremio.self) private var stremio
    @State private var stats: JSON?
    @State private var loaded = false

    var body: some View {
        ScrollView {
            if let s = stats {
                content(s)
            } else if loaded {
                ContentUnavailableView("Watch Stats Are Off", systemImage: "chart.bar", description: Text("Turn on Watch stats in dx.bi Settings to count how long you watch."))
                    .padding(.top, 60)
            } else {
                ProgressView().padding(60)
            }
        }
        .screenBackground()
        .navigationTitle("Your Stats")
        .task {
            stats = await stremio.stats()
            loaded = true
        }
    }

    private func content(_ s: JSON) -> some View {
        let year = s.string("year")
        let since = Date(timeIntervalSince1970: s.double("since") / 1000)
        return VStack(alignment: .leading, spacing: 26) {
            Text("\(hours(s.double("total"))) in total · since \(since.formatted(date: .long, time: .omitted))")
                .font(.subheadline).foregroundStyle(Dx.muted)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 12)], spacing: 12) {
                ForEach(Array(s.objects("tiles").enumerated()), id: \.offset) { _, t in
                    tile(t.string("label"), hours(t.double("sec")))
                }
                let streak = s.object("streak")
                tile("Streak", "\(streak?.int("current") ?? 0) days", note: "best \(streak?.int("best") ?? 0)")
            }
            section("Last 30 Days") {
                Chart(Array(s.objects("days").enumerated()), id: \.offset) { _, d in
                    BarMark(x: .value("Day", day(d.string("day")), unit: .day), y: .value("Minutes", d.double("sec") / 60))
                        .foregroundStyle(Dx.accent.gradient)
                        .clipShape(.rect(cornerRadius: 3))
                }
                .chartYAxis { AxisMarks { v in AxisValueLabel { if let m = v.as(Double.self) { Text(hours(m * 60)) } } } }
                .chartXAxis { AxisMarks(values: .stride(by: .day, count: 7)) { _ in AxisValueLabel(format: .dateTime.day().month(.abbreviated)) } }
                .frame(height: 170)
            }
            section("Most Watched in \(year)") {
                let top = s.objects("top")
                if top.isEmpty {
                    Text("Nothing yet this year. Start watching and it shows up here.").foregroundStyle(Dx.muted)
                }
                ForEach(Array(top.enumerated()), id: \.offset) { i, t in
                    HStack(spacing: 14) {
                        Text("\(i + 1)").font(.title2.bold()).frame(width: 28)
                        Art(url: URL(string: t.string("poster"))).frame(width: 46, height: 68).clipShape(.rect(cornerRadius: 8))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(t.string("name")).font(.headline).lineLimit(2)
                            Text("\(t.string("type") == "series" ? "Series" : "Film") · \(hours(t.double("sec")))").font(.subheadline).foregroundStyle(Dx.muted)
                        }
                    }
                }
            }
            section("Top Genres in \(year)") {
                let genres = s.objects("genres")
                let total = max(genres.reduce(0) { $0 + $1.double("sec") }, 1)
                if genres.isEmpty {
                    Text("Genres appear once you've watched a few titles.").foregroundStyle(Dx.muted)
                }
                ForEach(Array(genres.enumerated()), id: \.offset) { _, g in
                    let share = g.double("sec") / total
                    HStack {
                        Text(g.string("name")).frame(width: 110, alignment: .leading)
                        ProgressLine(value: share, colour: Dx.accent)
                        Text("\(Int((share * 100).rounded()))%").font(.footnote.monospacedDigit()).frame(width: 40, alignment: .trailing)
                    }
                }
            }
            section("Habits") {
                fact("Favourite time", s.isNull("hour") ? "–" : String(format: "%02d:00–%02d:00", s.int("hour"), (s.int("hour") + 1) % 24))
                fact("Busiest day", s.text("day") ?? "–")
                fact("In your Stremio library", "\(s.int("movies")) films · \(s.int("series")) series")
            }
            Text("Stats stay on this phone (saved with dx.bi's data). Only time spent actually playing counts.")
                .font(.footnote).foregroundStyle(Dx.faint)
        }
        .padding(Dx.gutter)
    }

    private func tile(_ label: String, _ value: String, note: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.subheadline).foregroundStyle(Dx.muted)
            Text(value).font(.title2.bold()).lineLimit(1).minimumScaleFactor(0.7)
            if let note { Text(note).font(.caption).foregroundStyle(Dx.faint) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .glassEffect(.regular, in: .rect(cornerRadius: 20))
    }

    private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.title3.bold())
            content()
        }
    }

    private func fact(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label).foregroundStyle(Dx.muted)
            Spacer()
            Text(value).fontWeight(.semibold)
        }
    }

    private func hours(_ sec: Double) -> String {
        let s = Int(sec.rounded())
        if s < 60 { return s > 0 ? "<1m" : "0m" }
        let h = s / 3600, m = s % 3600 / 60
        return h > 0 ? String(format: "%dh %02dm", h, m) : "\(m)m"
    }

    private func day(_ key: String) -> Date {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: key) ?? .now
    }
}

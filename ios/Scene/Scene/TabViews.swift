import SwiftUI

struct HomeView: View {
    @State private var dashboard: Dashboard?; @State private var error: String?
    var body: some View {
        SceneScreen {
            VStack(spacing: 0) {
                header
                    .padding(.top, 8)

                ScrollView {
                    VStack(alignment: .leading, spacing: 30) {
                        if let dashboard { dashboardContent(dashboard) }
                        else if let error { ContentUnavailableView("Couldn’t load Scene", systemImage: "wifi.exclamationmark", description: Text(error)).frame(maxWidth: .infinity, minHeight: 360) }
                        else { ProgressView().frame(maxWidth: .infinity, minHeight: 360) }
                    }
                    .padding(.top, 26)
                    .padding(.bottom, 30)
                }
                .contentMargins(.top, 0, for: .scrollContent)
                .refreshable { await load() }
            }
        }
        .task { await load() }
    }
    private var header: some View { HStack { HStack(spacing: 10) { Text("S").font(.title2.bold().italic()).foregroundStyle(SceneTheme.canvas).frame(width: 34, height: 42).background(SceneTheme.yellow); Text("Scene").font(.system(.title3, design: .serif).bold()) }; Spacer(); if let s = dashboard?.stats { HStack(spacing: 12) { stat(s.watchedMovies, "Movies"); stat(s.watchedEpisodes, "Episodes"); stat(s.watchEvents, "Plays", true) } } }.padding(.bottom, 12).overlay(alignment: .bottom) { Rectangle().fill(SceneTheme.line).frame(height: 1) } }
    private func stat(_ value: Int, _ label: String, _ accent: Bool = false) -> some View { VStack(alignment: .trailing, spacing: 1) { Text("\(value)").font(.system(.subheadline, design: .serif).bold()).foregroundStyle(accent ? SceneTheme.yellow : SceneTheme.ink); Text(label.uppercased()).font(.system(size: 7, weight: .heavy)).tracking(0.8).foregroundStyle(SceneTheme.muted) } }
    private func dashboardContent(_ data: Dashboard) -> some View { Group { if APIClient.shared.lastCacheState == .stale { Label("Showing saved content while offline", systemImage: "wifi.slash").font(.caption.weight(.semibold)).foregroundStyle(SceneTheme.yellow).padding(10).frame(maxWidth: .infinity, alignment: .leading).background(SceneTheme.raised) }; posterSection("Continue", "Up next", data.upNext.map { PosterItem(media: $0.show, subtitle: $0.progress.nextEpisode?.title ?? "", badge: $0.progress.nextEpisode.map { "S\($0.seasonNumber ?? 0)E\($0.episodeNumber ?? 0)" }, progress: $0.progress.percentage) }); posterSection("The log", "Recently watched", data.recent.map { PosterItem(media: $0.media, subtitle: String($0.watchedAt.prefix(10))) }); if !data.watchlist.isEmpty { posterSection("Saved", "Watchlist", data.watchlist.map { PosterItem(media: $0, subtitle: $0.releaseYear.map(String.init) ?? "Saved") }) } } }
    private func posterSection(_ eyebrow: String, _ title: String, _ items: [PosterItem]) -> some View { VStack(alignment: .leading, spacing: 14) { SceneSectionTitle(eyebrow: eyebrow, title: title); if items.isEmpty { SceneCard { Text("Nothing here yet.").foregroundStyle(SceneTheme.muted) } } else { ScrollView(.horizontal, showsIndicators: false) { LazyHStack(alignment: .top, spacing: 14) { ForEach(items) { item in SceneRouteButton(kind: item.media.kind, tmdbId: item.media.tmdbId) { PosterCard(media: item.media, subtitle: item.subtitle, badge: item.badge, progress: item.progress) } } }.padding(.vertical, 2) } } } }
    private func load() async { do { dashboard = try await APIClient.shared.request("/api/dashboard", cacheKey: "dashboard") } catch { self.error = error.localizedDescription } }
}

private struct PosterItem: Identifiable { let media: MediaRecord; let subtitle: String; var badge: String? = nil; var progress: Double? = nil; var id: String { media.id } }

struct SearchView: View {
    @State private var query = ""; @State private var results: [SearchResult] = []
    var body: some View { SceneScreen { ScrollView { LazyVStack(alignment: .leading, spacing: 14) { SceneSectionTitle(eyebrow: "Catalogue", title: "Find a title"); if results.isEmpty { ContentUnavailableView("Search Scene", systemImage: "magnifyingglass", description: Text("Movies and shows, powered by TMDB.")).frame(maxWidth: .infinity, minHeight: 340) } else { ForEach(results) { result in SceneRouteButton(kind: result.kind, tmdbId: result.tmdbId) { SceneMediaRow(media: result) } } } }.padding(.vertical, 18) }.searchable(text: $query, prompt: "Movies and shows").onChange(of: query) { _, value in Task { await search(value) } } } }
    private func search(_ q: String) async { guard q.count >= 2 else { results = []; return }; let p = "/api/search?q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q)"; let page: SearchPage? = try? await APIClient.shared.request(p, cacheKey: "search-\(q.lowercased())"); results = page?.results ?? [] }
}

struct LibraryView: View { @State private var page: LibraryPage?; @State private var filter = "watchlist"; var body: some View { SceneScreen { ScrollView { LazyVStack(alignment: .leading, spacing: 14) { SceneSectionTitle(eyebrow: "Collection", title: "Library"); Picker("Collection", selection: $filter) { Text("Watchlist").tag("watchlist"); Text("Watched").tag("watched") }.pickerStyle(.segmented); ForEach(page?.items ?? []) { row in SceneRouteButton(kind: row.item.kind, tmdbId: row.item.tmdbId) { SceneMediaRow(media: row.item) } } }.padding(.vertical, 18) }.refreshable { await load() } }.task(id: filter) { await load() } }; private func load() async { page = try? await APIClient.shared.request("/api/library?filter=\(filter)", cacheKey: "library-\(filter)") } }
struct HistoryView: View { @State private var page: HistoryPage?; var body: some View { SceneScreen { ScrollView { LazyVStack(alignment: .leading, spacing: 14) { SceneSectionTitle(eyebrow: "The log", title: "History"); ForEach(page?.items ?? []) { event in SceneRouteButton(kind: event.media.kind, tmdbId: event.media.tmdbId) { SceneMediaRow(media: event.media, trailing: String(event.watchedAt.prefix(10))) } } }.padding(.vertical, 18) }.refreshable { await load() } }.task { await load() } }; private func load() async { page = try? await APIClient.shared.request("/api/history", cacheKey: "history") } }
struct SettingsView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var status = ""
    var body: some View {
        SceneScreen {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    SceneSectionTitle(eyebrow: "Scene", title: "Settings")
                    settingsCard("Account") {
                        Button("Log out of this iPhone", role: .destructive) {
                            Task { try? await APIClient.shared.noContent("/api/mobile/sessions/current", method: "DELETE"); session.clear() }
                        }
                    }
                    settingsCard("Storage") {
                        Button("Clear local cache") { Task { await APIClient.shared.cache.clear(); status = "Local cache cleared." } }
                        if !status.isEmpty { Text(status).font(.caption).foregroundStyle(SceneTheme.muted) }
                    }
                    settingsCard("About") {
                        LabeledContent("Version", value: "1.0 (1)")
                        Link("TMDB attribution", destination: URL(string: "https://www.themoviedb.org")!)
                        Text("This product uses the TMDB API but is not endorsed or certified by TMDB.").font(.caption).foregroundStyle(SceneTheme.muted)
                    }
                }.padding(.vertical, 18)
            }
        }
    }
    private func settingsCard<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        SceneCard { VStack(alignment: .leading, spacing: 14) { Text(title.uppercased()).font(.caption2.weight(.black)).tracking(1.4).foregroundStyle(SceneTheme.yellow); content() } }
    }
}

private struct SceneRouteButton<Label: View>: View {
    let kind: MediaKind; let tmdbId: Int; @ViewBuilder let label: () -> Label
    @EnvironmentObject private var router: SceneRouter
    var body: some View { Button { router.show(kind: kind, tmdbId: tmdbId) } label: { label() }.buttonStyle(.plain) }
}

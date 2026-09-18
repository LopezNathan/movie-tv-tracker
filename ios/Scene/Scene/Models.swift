import Foundation

enum MediaKind: String, Codable { case movie, show, episode }
struct MediaRecord: Codable, Identifiable, Hashable {
    let id: String; let kind: MediaKind; let tmdbId: Int; let title: String
    let originalTitle: String?; let releaseYear: Int?; let overview: String?
    let posterPath: String?; let backdropPath: String?; let status: String?; let runtime: Int?
    let seriesId: String?; let seasonNumber: Int?; let episodeNumber: Int?; let airDate: String?
    let metadataUpdatedAt: String
}
struct SearchResult: Codable, Identifiable, Hashable {
    let kind: MediaKind; let tmdbId: Int; let title: String; let originalTitle: String?
    let releaseYear: Int?; let overview: String?; let posterPath: String?
    var id: String { "\(kind.rawValue)-\(tmdbId)" }
}
struct WatchEvent: Codable, Identifiable { let id: String; let mediaId: String; let watchedAt: String; let source: String; let media: MediaRecord; let show: MediaRecord? }
struct Progress: Codable { let showId: String; let watched: Int; let aired: Int; let percentage: Double; let nextEpisode: MediaRecord? }
struct Dashboard: Codable { let upNext: [UpNext]; let recent: [WatchEvent]; let watchlist: [MediaRecord]; let stats: Stats
    struct UpNext: Codable, Identifiable { let show: MediaRecord; let progress: Progress; var id: String { show.id } }
    struct Stats: Codable { let watchedMovies: Int; let watchedShows: Int; let watchedEpisodes: Int; let watchEvents: Int }
}
struct MediaDetail: Codable { let media: MediaRecord; let episodes: [MediaRecord]; let watchEvents: [WatchEvent]; let rating: Int?; let inWatchlist: Bool; let hiddenFromUpNext: Bool; let progress: Progress? }
struct SearchPage: Codable { let results: [SearchResult]; let page: Int; let totalPages: Int }
struct HistoryPage: Codable { let items: [WatchEvent]; let nextCursor: String? }
struct LibraryPage: Codable { struct Item: Codable, Identifiable { let item: MediaRecord; let watchedAt: String?; let addedAt: String?; var id: String { item.id } }; let items: [Item]; let total: Int; let nextCursor: Cursor?; struct Cursor: Codable { let watchedAt: String; let itemId: String } }
struct MobileTokens: Codable { let accessToken: String; let refreshToken: String; let accessExpiresAt: String; let refreshExpiresAt: String }

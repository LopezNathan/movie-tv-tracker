@testable import Scene
import XCTest

final class SceneTests: XCTestCase {
    func testDecodesSharedMediaContract() throws {
        let json = """{"id":"movie-1","kind":"movie","tmdb_id":1,"title":"Film","original_title":null,"release_year":2026,"overview":null,"poster_path":null,"backdrop_path":null,"status":null,"runtime":null,"series_id":null,"season_number":null,"episode_number":null,"air_date":null,"metadata_updated_at":"2026-01-01T00:00:00.000Z"}"""
        let decoder = JSONDecoder(); decoder.keyDecodingStrategy = .convertFromSnakeCase
        XCTAssertEqual(try decoder.decode(MediaRecord.self, from: Data(json.utf8)).title, "Film")
    }
    func testSessionStartsUnauthenticated() { XCTAssertNil(SessionStore().tokens) }
}

import Foundation

enum APIError: LocalizedError { case offline, unauthorized, server(String)
    var errorDescription: String? { switch self { case .offline: "You’re offline. Changes are unavailable until you reconnect."; case .unauthorized: "Your session has expired. Pair this device again."; case .server(let message): message } }
}
enum CacheState { case fresh, stale }
actor ResponseCache {
    private let directory: URL
    init() { directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("SceneCache"); try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
    private func file(_ key: String) -> URL { directory.appendingPathComponent(key.data(using: .utf8)!.base64EncodedString().replacingOccurrences(of: "/", with: "_")) }
    func read(_ key: String) -> Data? { try? Data(contentsOf: file(key)) }
    func write(_ data: Data, key: String) { try? data.write(to: file(key), options: .atomic) }
    func clear() { try? FileManager.default.removeItem(at: directory); try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
}

@MainActor final class APIClient: ObservableObject {
    static let shared = APIClient()
    static let mobileBaseURL = URL(string: "https://api.scene.nathanlopez.com")!
    static let browserBaseURL = URL(string: "https://scene.nathanlopez.com")!
    let cache = ResponseCache()
    weak var session: SessionStore?
    @Published private(set) var lastCacheState: CacheState = .fresh
    private let decoder: JSONDecoder = { let d = JSONDecoder(); d.keyDecodingStrategy = .convertFromSnakeCase; return d }()

    func configure(session: SessionStore) { self.session = session }
    func request<T: Decodable>(_ path: String, method: String = "GET", body: Encodable? = nil, cacheKey: String? = nil, retryingAfterRefresh: Bool = false) async throws -> T {
        guard let token = session?.tokens?.accessToken else { throw APIError.unauthorized }
        var request = URLRequest(url: Self.mobileBaseURL.appending(path: path)); request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body { request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = try JSONEncoder().encode(AnyEncodable(body)) }
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw APIError.offline }
            if http.statusCode == 401, !retryingAfterRefresh, let refreshToken = session?.tokens?.refreshToken,
               let rotated = try? await refresh(refreshToken: refreshToken) {
                session?.save(rotated)
                return try await self.request(path, method: method, body: body, cacheKey: cacheKey, retryingAfterRefresh: true)
            }
            if http.statusCode == 401 { throw APIError.unauthorized }
            guard 200..<300 ~= http.statusCode else { throw APIError.server((try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String ?? "Request failed (HTTP \(http.statusCode)).") }
            if http.statusCode == 204 { return Empty() as! T }
            if method == "GET", let cacheKey { await cache.write(data, key: cacheKey); lastCacheState = .fresh }
            if method != "GET" { await cache.clear() }
            return try decoder.decode(T.self, from: data)
        } catch let error as APIError { throw error
        } catch {
            if method == "GET", let cacheKey, let data = await cache.read(cacheKey) { lastCacheState = .stale; return try decoder.decode(T.self, from: data) }
            throw method == "GET" ? APIError.offline : APIError.offline
        }
    }
    func noContent(_ path: String, method: String) async throws { let _: Empty = try await request(path, method: method) }
    func exchange(code: String) async throws -> MobileTokens { try await unauthenticated("/api/mobile/sessions/exchange", body: ["code": code]) }
    func refresh(refreshToken: String) async throws -> MobileTokens { try await unauthenticated("/api/mobile/sessions/refresh", body: ["refreshToken": refreshToken]) }
    private func unauthenticated<T: Decodable>(_ path: String, body: [String: String]) async throws -> T { var r = URLRequest(url: Self.mobileBaseURL.appending(path: path)); r.httpMethod = "POST"; r.setValue("application/json", forHTTPHeaderField: "Content-Type"); r.httpBody = try JSONEncoder().encode(body); let (data, response) = try await URLSession.shared.data(for: r); guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else { throw APIError.unauthorized }; return try decoder.decode(T.self, from: data) }
}
private struct Empty: Decodable {}
private struct AnyEncodable: Encodable { private let encodeBlock: (Encoder) throws -> Void; init(_ value: Encodable) { encodeBlock = value.encode }; func encode(to encoder: Encoder) throws { try encodeBlock(encoder) } }

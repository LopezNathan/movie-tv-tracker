import Foundation
import Security

final class KeychainStore {
    private let service = "com.nathanlopez.scene"
    func save(_ value: Data, key: String) throws { delete(key); let status = SecItemAdd([kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: key, kSecValueData: value] as CFDictionary, nil); guard status == errSecSuccess else { throw NSError(domain: "Keychain", code: Int(status)) } }
    func load(key: String) -> Data? { var result: CFTypeRef?; let status = SecItemCopyMatching([kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: key, kSecReturnData: true] as CFDictionary, &result); return status == errSecSuccess ? result as? Data : nil }
    func delete(_ key: String) { SecItemDelete([kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: key] as CFDictionary) }
}

@MainActor final class SessionStore: ObservableObject {
    @Published private(set) var tokens: MobileTokens?
    let keychain = KeychainStore()
    init() { tokens = keychain.load(key: "mobile-session").flatMap { try? JSONDecoder().decode(MobileTokens.self, from: $0) } }
    func save(_ tokens: MobileTokens) { self.tokens = tokens; try? keychain.save(JSONEncoder().encode(tokens), key: "mobile-session") }
    func clear() { tokens = nil; keychain.delete("mobile-session") }
}

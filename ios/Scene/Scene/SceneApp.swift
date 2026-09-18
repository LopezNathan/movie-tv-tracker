import SwiftUI

@main
struct SceneApp: App {
    @StateObject private var session = SessionStore()
    var body: some Scene {
        WindowGroup { RootView().environmentObject(session).preferredColorScheme(.dark) }
    }
}

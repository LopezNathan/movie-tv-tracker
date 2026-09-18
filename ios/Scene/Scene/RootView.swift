import AuthenticationServices
import SwiftUI
import UIKit

struct RootView: View {
    @EnvironmentObject private var session: SessionStore
    var body: some View {
        ZStack {
            SceneBackdrop()
            Group { if session.tokens == nil { PairingView() } else { SceneTabs() } }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .ignoresSafeArea()
        .task { APIClient.shared.configure(session: session) }
    }
}

struct PairingView: View {
    @EnvironmentObject private var session: SessionStore
    @State private var isPairing = false; @State private var error: String?
    var body: some View {
        VStack(spacing: 22) {
            Image(systemName: "film.stack.fill").font(.system(size: 52)).foregroundStyle(.tint)
            Text("Scene").font(.largeTitle.bold())
            Text("Pair your iPhone with your private Scene library. You’ll sign in through the protected Scene website.").multilineTextAlignment(.center).foregroundStyle(.secondary)
            Button("Pair this iPhone") { pair() }.buttonStyle(.borderedProminent).controlSize(.large).disabled(isPairing)
            if isPairing { ProgressView("Opening secure sign-in…") }
            if let error { Text(error).foregroundStyle(.red).multilineTextAlignment(.center) }
        }.padding(32)
    }
    private func pair() {
        isPairing = true; error = nil
        let state = UUID().uuidString
        var url = URLComponents(url: APIClient.browserBaseURL.appending(path: "/pair"), resolvingAgainstBaseURL: false)!
        url.queryItems = [URLQueryItem(name: "state", value: state)]
        WebAuthenticator.authenticate(url: url.url!) { result in
            isPairing = false
            switch result {
            case .success(let callback):
                guard let parts = URLComponents(url: callback, resolvingAgainstBaseURL: false), parts.queryItems?.first(where: {$0.name == "state"})?.value == state, let code = parts.queryItems?.first(where: {$0.name == "code"})?.value else { error = "The pairing response was not valid. Try again."; return }
                Task { do { session.save(try await APIClient.shared.exchange(code: code)) } catch { self.error = error.localizedDescription } }
            case .failure(let e): error = e.localizedDescription
            }
        }
    }
}

final class WebAuthenticator: NSObject, ASWebAuthenticationPresentationContextProviding {
    static var retained: WebAuthenticator?
    static var activeSession: ASWebAuthenticationSession?
    static func authenticate(url: URL, completion: @escaping (Result<URL, Error>) -> Void) {
        let delegate = WebAuthenticator(); retained = delegate
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "scene") { url, error in
            retained = nil; activeSession = nil
            if let url { completion(.success(url)) } else { completion(.failure(error ?? CancellationError())) }
        }
        // Pairing must not inherit Scene's installed web-app service worker or a
        // stale Access redirect. It deliberately starts a clean, one-shot web
        // context and returns only through the registered scene:// callback.
        session.prefersEphemeralWebBrowserSession = true
        session.presentationContextProvider = delegate
        activeSession = session
        session.start()
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor() }
}

struct SceneTabs: View {
    @StateObject private var router = SceneRouter()
    private enum Tab: String, CaseIterable, Identifiable {
        case home, search, library, history, settings
        var id: Self { self }
        var title: String { rawValue.capitalized }
        var icon: String {
            switch self {
            case .home: "house"
            case .search: "magnifyingglass"
            case .library: "rectangle.stack"
            case .history: "clock.arrow.circlepath"
            case .settings: "gearshape"
            }
        }
    }
    @State private var selected: Tab = .home

    var body: some View {
        ZStack(alignment: .bottom) {
            tabContent
            dock
        }
        .environmentObject(router)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(SceneTheme.canvas.ignoresSafeArea())
        .ignoresSafeArea()
        .fullScreenCover(item: $router.detail) { route in
            SceneDetailScreen(route: route)
        }
    }

    @ViewBuilder private var tabContent: some View {
        switch selected {
        case .home: HomeView()
        case .search: SearchView()
        case .library: LibraryView()
        case .history: HistoryView()
        case .settings: SettingsView()
        }
    }

    private var dock: some View {
        GeometryReader { proxy in
            VStack(spacing: 0) {
                Spacer()
                HStack(spacing: 0) {
                ForEach(Tab.allCases) { tab in
                    Button {
                        withAnimation(.easeOut(duration: 0.16)) { selected = tab }
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: tab.icon)
                                .font(.system(size: 17, weight: selected == tab ? .bold : .medium))
                            Text(tab.title.uppercased())
                                .font(.system(size: 8, weight: .black))
                                .tracking(0.45)
                        }
                        .foregroundStyle(selected == tab ? SceneTheme.canvas : SceneTheme.muted)
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .background(selected == tab ? SceneTheme.yellow : .clear)
                        .overlay(alignment: .top) {
                            Rectangle()
                                .fill(selected == tab ? SceneTheme.yellow : .clear)
                                .frame(height: 2)
                        }
                    }
                    .accessibilityLabel(tab.title)
                    .accessibilityAddTraits(selected == tab ? .isSelected : [])
                }
                }
                .padding(.top, 4)
                .padding(.horizontal, 0)
                .padding(.bottom, proxy.safeAreaInsets.bottom)
                .background(SceneTheme.surface.opacity(0.98))
                .overlay(alignment: .top) { Rectangle().fill(SceneTheme.line).frame(height: 1) }
            }
        }
        .ignoresSafeArea(edges: .bottom)
        .allowsHitTesting(true)
    }
}

struct SceneRoute: Identifiable {
    let kind: MediaKind
    let tmdbId: Int
    var id: String { "\(kind.rawValue)-\(tmdbId)" }
}

final class SceneRouter: ObservableObject {
    @Published var detail: SceneRoute?
    func show(kind: MediaKind, tmdbId: Int) { detail = SceneRoute(kind: kind, tmdbId: tmdbId) }
}

private struct SceneDetailScreen: View {
    let route: SceneRoute
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        ZStack(alignment: .topLeading) {
            SceneBackdrop()
            DetailView(kind: route.kind, tmdbId: route.tmdbId)
            Button(action: { dismiss() }) {
                Image(systemName: "chevron.left")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(SceneTheme.ink)
                    .frame(width: 42, height: 42)
                    .background(SceneTheme.surface, in: Circle())
            }
            .padding(.leading, 14)
            .padding(.top, 8)
            .accessibilityLabel("Back")
        }
    }
}

import SwiftUI

enum SceneTheme {
    static let ink = Color(red: 0.94, green: 0.92, blue: 0.84)
    static let canvas = Color(red: 0.05, green: 0.05, blue: 0.04)
    static let surface = Color(red: 0.09, green: 0.09, blue: 0.07)
    static let raised = Color(red: 0.12, green: 0.12, blue: 0.09)
    static let line = Color(red: 0.23, green: 0.22, blue: 0.18)
    static let muted = Color(red: 0.64, green: 0.62, blue: 0.56)
    static let yellow = Color(red: 0.94, green: 0.84, blue: 0.31)
    static let display = Font.system(.title, design: .serif).weight(.semibold)
}

struct SceneScreen<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        content
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .foregroundStyle(SceneTheme.ink)
        .tint(SceneTheme.yellow)
    }
}

struct SceneBackdrop: View {
    var body: some View {
        ZStack {
            SceneTheme.canvas
            LinearGradient(
                colors: [Color(red: 0.22, green: 0.20, blue: 0.07).opacity(0.48), .clear],
                startPoint: .topTrailing,
                endPoint: .center
            )
        }
        .ignoresSafeArea()
    }
}

struct SceneSectionTitle: View {
    let eyebrow: String; let title: String; var action: String? = nil
    var body: some View { HStack(alignment: .lastTextBaseline) { VStack(alignment: .leading, spacing: 3) { Text(eyebrow.uppercased()).font(.caption2.weight(.black)).tracking(1.7).foregroundStyle(SceneTheme.yellow); Text(title).font(SceneTheme.display) }; Spacer(); if let action { Text(action.uppercased()).font(.caption2.weight(.bold)).foregroundStyle(SceneTheme.muted) } }.padding(.top, 6) }
}

struct SceneCard<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View { content.padding(14).background(SceneTheme.surface.opacity(0.9), in: RoundedRectangle(cornerRadius: 3)).overlay(RoundedRectangle(cornerRadius: 3).stroke(SceneTheme.line, lineWidth: 1)) }
}

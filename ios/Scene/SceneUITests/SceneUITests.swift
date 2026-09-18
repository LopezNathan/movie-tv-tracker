import XCTest

final class SceneUITests: XCTestCase {
    func testPairingScreenIsShownWithoutSession() {
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.buttons["Pair this iPhone"].waitForExistence(timeout: 3))
    }
}

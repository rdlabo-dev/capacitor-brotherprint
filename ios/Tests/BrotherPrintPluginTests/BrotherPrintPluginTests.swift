import XCTest
import Capacitor
@testable import BrotherPrintPlugin

class BluetoothAccessorySearchTests: XCTestCase {
    func testCancellationDuringInitialScanDoesNotOpenPicker() {
        let scanStarted = expectation(description: "Initial scan started")
        let scanFinished = expectation(description: "Initial scan returned")
        let pickerOpened = expectation(description: "Cancelled scan must not open picker")
        pickerOpened.isInverted = true
        let releaseScan = DispatchSemaphore(value: 0)
        let plugin = BrotherPrintPlugin()
        var rejections = 0
        let call = CAPPluginCall(callbackId: "initial-scan", methodName: "search", options: [:], success: { _, _ in
            XCTFail("Cancelled search must not resolve")
        }, error: { error in
            rejections += 1
            XCTAssertTrue(error?.message.contains("cancelled") == true)
        })!
        plugin.checkBLEChannel(call, scan: {
            scanStarted.fulfill()
            XCTAssertEqual(releaseScan.wait(timeout: .now() + 3), .success)
            scanFinished.fulfill()
            return ([], .noError)
        }, startAccessorySearch: { _ in
            pickerOpened.fulfill()
        })
        wait(for: [scanStarted], timeout: 3)
        let cancel = CAPPluginCall(callbackId: "stop", methodName: "cancelSearchBluetoothPrinter", options: [:], success: { _, _ in
            releaseScan.signal()
        }, error: { _ in
            XCTFail("Cancellation must resolve")
        })!
        plugin.cancelSearchBluetoothPrinter(cancel)
        wait(for: [scanFinished], timeout: 3)
        wait(for: [pickerOpened], timeout: 0.2)
        XCTAssertEqual(rejections, 1)
    }

    func testMissingPickerCallbackTimesOutAndDoesNotOpenAnotherPicker() {
        let timedOut = expectation(description: "Search rejects without a picker callback")
        let plugin = BrotherPrintPlugin()
        var starts = 0
        let call = CAPPluginCall(callbackId: "timeout", methodName: "search", options: ["searchDuration": 1], success: { _, _ in
            XCTFail("Search must reject")
        }, error: { error in
            XCTAssertTrue(error?.message.contains("timed out") == true)
            let retry = CAPPluginCall(callbackId: "retry", methodName: "search", options: [:], success: { _, _ in
                XCTFail("A second picker must not open")
            }, error: { error in
                XCTAssertTrue(error?.message.contains("still open") == true)
            })!
            plugin.searchBluetoothAccessory(retry) { _ in starts += 1 }
            XCTAssertEqual(starts, 1)
            timedOut.fulfill()
        })!
        DispatchQueue.main.async {
            plugin.searchBluetoothAccessory(call) { _ in starts += 1 }
        }
        wait(for: [timedOut], timeout: 3)
    }

    func testCancellationRejectsOnlyOnceEvenAfterDeadline() {
        let finished = expectation(description: "Cancellation stays settled after the deadline")
        let plugin = BrotherPrintPlugin()
        var rejections = 0
        let call = CAPPluginCall(callbackId: "cancel", methodName: "search", options: ["searchDuration": 1], success: { _, _ in
            XCTFail("Search must reject")
        }, error: { error in
            rejections += 1
            XCTAssertTrue(error?.message.contains("cancelled") == true)
        })!
        let cancel = CAPPluginCall(callbackId: "stop", methodName: "cancelSearchBluetoothPrinter", options: [:], success: { _, _ in }, error: { _ in
            XCTFail("Cancellation must resolve")
        })!
        DispatchQueue.main.async {
            plugin.searchBluetoothAccessory(call) { _ in }
            plugin.cancelSearchBluetoothPrinter(cancel)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
                XCTAssertEqual(rejections, 1)
                finished.fulfill()
            }
        }
        wait(for: [finished], timeout: 3)
    }
}

class PrintImageValidationTests: XCTestCase {
    func testInvalidImagesRejectBeforeOpeningPrinter() {
        for image in ["", "A", "SGVsbG8=", "iVBORw0KGgo="] {
            var rejected = 0
            var errorEvents = 0
            var errorMessage: String?
            let plugin = BrotherPrintPlugin()
            // Normally initialized by Capacitor when attaching the bridge.
            plugin.eventListeners = NSMutableDictionary()
            for eventName in ["onPrintError", "onPrint", "onPrintFailedCommunication"] {
                let listener = CAPPluginCall(callbackId: eventName, methodName: "addListener", options: ["eventName": eventName], success: { result, _ in
                    XCTAssertEqual(eventName, "onPrintError")
                    XCTAssertEqual(result?.data?["code"] as? Int, 0)
                    errorMessage = result?.data?["message"] as? String
                    errorEvents += 1
                }, error: { _ in
                    XCTFail("Listener must not reject")
                })!
                plugin.addListener(listener)
            }
            let call = CAPPluginCall(callbackId: "test", methodName: "printImage", options: ["encodedImage": image], success: { _, _ in
                XCTFail("Invalid image must not resolve")
            }, error: { error in
                XCTAssertEqual(errorMessage, error?.message)
                rejected += 1
            })!
            plugin.printImage(call)
            XCTAssertEqual(rejected, 1, "Input: \(image)")
            XCTAssertEqual(errorEvents, 1, "Input: \(image)")
        }
    }
}

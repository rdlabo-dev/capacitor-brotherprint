import Foundation
import Capacitor
import BRLMPrinterKit

/**
 * Please read the Capacitor iOS Plugin Development Guide
 * here: https://capacitorjs.com/docs/plugins/ios
 */
@objc(BrotherPrintPlugin)
public class BrotherPrintPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BrotherPrint"
    public let jsName = "BrotherPrint"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "printImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isChannelAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "search", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelSearchWiFiPrinter", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelSearchBluetoothPrinter", returnType: CAPPluginReturnPromise)
    ]
    private var cancelRoutineWiFi: (() -> Void)?
    private var cancelRoutineBluetooth: (() -> Void)?

    @objc func printImage(_ call: CAPPluginCall) {
        let encodedImage: String = call.getString("encodedImage", "")
        if encodedImage == "" {
            self.notifyListeners(BrotherPrinterEvent.onPrintError.rawValue, data: ["code": 0, "message": "Error - Image data is not found."])
            call.reject("Error - Image data is not found.")
            return
        }

        guard let image = decodePrintImage(encodedImage) else {
            self.notifyListeners(BrotherPrinterEvent.onPrintError.rawValue, data: ["code": 0, "message": "Error - Create decodedByte From ImageData is failed."])
            call.reject("Error - Create decodedByte From ImageData is failed.")
            return
        }

        // 検索からデバイス情報が得られた場合
        let port: String = call.getString("port", "wifi")
        let channelInfo: String = call.getString("channelInfo", "")

        //        let localName: String = call.getString("localName", "")
        //        let serialNumber: String = call.getString("serialNumber", "")

        let modelName: String = call.getString("modelName", "QL-820NWB")
        let printerModel = BrotherModel.getModelName(from: modelName)

        NSLog(call.getString("modelName", "not set"))
        NSLog(call.getString("labelName", "not set"))

        // メインスレッドにて処理
        DispatchQueue.main.async {
            var channel: BRLMChannel

            switch port {
            case "wifi":
                channel = BRLMChannel(wifiIPAddress: channelInfo)
            case "bluetooth":
                channel = BRLMChannel(bluetoothSerialNumber: channelInfo)
            case "bluetoothLowEnergy":
                channel = BRLMChannel(bleLocalName: channelInfo)
            default:
                self.notifyListeners(BrotherPrinterEvent.onPrintError.rawValue, data: ["code": 0, "message": "Error - connection is not found."])
                call.reject("Error - connection is not found.")
                return
            }

            let generateResult = BRLMPrinterDriverGenerator.open(channel)
            guard generateResult.error.code == BRLMOpenChannelErrorCode.noError,
                  let printerDriver = generateResult.driver else {
                let message = OpenChannelErrorModel.fetchChannelErrorCode(error: generateResult.error.code)
                self.notifyListeners(BrotherPrinterEvent.onPrintFailedCommunication.rawValue, data: [
                    "message": message,
                    "code": generateResult.error.code.rawValue
                ])
                call.reject("Error - Open Channel: \(message)")
                return
            }

            var printSettings: BRLMPrintSettingsProtocol

            if modelName.hasPrefix("QL") {
                guard
                    let qlPrintSettings = BRLMQLPrintSettings(defaultPrintSettingsWith: printerModel)
                else {
                    printerDriver.closeChannel()
                    self.notifyListeners(BrotherPrinterEvent.onPrintError.rawValue, data: [
                        "code": 0,
                        "message": "Error - Create BRLMQLPrintSettings with " + modelName + " is failed."
                    ])
                    call.reject("Error - Create BRLMQLPrintSettings with " + modelName + " is failed.")
                    return
                }
                printSettings = PrinterSettingsModel.QLModelSettings(call, printSettings: qlPrintSettings)

            } else if modelName.hasPrefix("TD") {
                guard
                    let tdPrintSettings = BRLMTDPrintSettings(defaultPrintSettingsWith: printerModel)
                else {
                    printerDriver.closeChannel()
                    self.notifyListeners(BrotherPrinterEvent.onPrintError.rawValue, data: [
                        "code": 0,
                        "message": "Error - Create BRLMTDPrintSettings with " + modelName + " is failed."
                    ])
                    call.reject("Error - Create BRLMTDPrintSettings with " + modelName + " is failed.")
                    return
                }
                printSettings = PrinterSettingsModel.TDModelSettings(call, printSettings: tdPrintSettings)

            } else {
                printerDriver.closeChannel()
                self.notifyListeners(BrotherPrinterEvent.onPrintError.rawValue, data: ["code": 0, "message": "Error - " + modelName + " is not supported"])
                call.reject("Error - " + modelName + " is not supported")
                return
            }

            let printError = printerDriver.printImage(with: image, settings: printSettings)

            if printError.code != BRLMPrintErrorCode.noError {
                printerDriver.closeChannel()
                let message = PrintErrorModel.fetchErrorCode(errorCode: Int32(printError.code.rawValue))
                self.notifyListeners(BrotherPrinterEvent.onPrintError.rawValue, data: [
                    "message": message,
                    "code": printError.code.rawValue
                ])
                call.reject("Error - Print Image: " + message)
                return
            }

            printerDriver.closeChannel()

            self.notifyListeners(BrotherPrinterEvent.onPrint.rawValue, data: [:])
            call.resolve()
        }
    }

    @objc func isChannelAvailable(_ call: CAPPluginCall) {
        let port: String = call.getString("port", "wifi")
        let channelInfo: String = call.getString("channelInfo", "")

        DispatchQueue.main.async {
            var channel: BRLMChannel
            switch port {
            case "wifi":
                channel = BRLMChannel(wifiIPAddress: channelInfo)
            case "bluetooth":
                channel = BRLMChannel(bluetoothSerialNumber: channelInfo)
            case "bluetoothLowEnergy":
                channel = BRLMChannel(bleLocalName: channelInfo)
            default:
                call.reject("Error - connection is not found.")
                return
            }
            let generateResult = BRLMPrinterDriverGenerator.open(channel)

            guard generateResult.error.code == BRLMOpenChannelErrorCode.noError,
                  let printerDriver = generateResult.driver else {
                call.resolve(["result": false])
                return
            }
            printerDriver.closeChannel()
            call.resolve(["result": true])
        }
    }

    @objc func search(_ call: CAPPluginCall) {
        switch call.getString("port", "wifi") {
        case "wifi":
            self.searchWiFiPrinter(call)
        case "bluetooth":
            self.checkBLEChannel(call)
        case "bluetoothLowEnergy":
            self.searchBLEPrinter(call)
        default:
            call.reject("port is not 'wifi' | 'bluetooth' | 'bluetoothLowEnergy'")
        }
    }

    private func searchWiFiPrinter(_ call: CAPPluginCall) {
        DispatchQueue.global().async {
            self.cancelRoutineWiFi = {
                BRLMPrinterSearcher.cancelNetworkSearch()
            }

            let option = BRLMNetworkSearchOption()
            option.printerList = PrinterModel.allCases.map { $0.searchModelName }
            option.searchDuration = TimeInterval(call.getInt("searchDuration", 15))

            NSLog("BRLMPrinterSearcher.startNetworkSearch")
            let searcher = BRLMPrinterSearcher.startNetworkSearch(option) { channel in
                NSLog(channel.channelInfo)
                let printer = self.chanelToPrinter(port: "wifi", channel: channel)
                self.notifyListeners(BrotherPrinterEvent.onPrinterAvailable.rawValue, data: printer)
            }
            if searcher.error.code != BRLMPrinterSearchErrorCode.noError {
                call.reject("Error - startNetworkSearch: " + PrinterSearchErrorModel.fetchChannelErrorCode(error: searcher.error.code))
                return
            }
            print(searcher.channels.count)
            self.cancelRoutineWiFi = nil
            call.resolve()
        }
    }

    private func checkBLEChannel(_ call: CAPPluginCall) {
        DispatchQueue.global().async {
            let searcher = BRLMPrinterSearcher.startBluetoothSearch()
            if searcher.error.code != BRLMPrinterSearchErrorCode.noError {
                call.reject("Error - startBluetoothSearch: " + PrinterSearchErrorModel.fetchChannelErrorCode(error: searcher.error.code))
                return
            }
            if searcher.channels.isEmpty {
                DispatchQueue.main.async {
                    BRLMPrinterSearcher.startBluetoothAccessorySearch { result in
                        guard result.error.code == BRLMPrinterSearchErrorCode.noError else {
                            call.reject("Error - startBluetoothAccessorySearch: " + PrinterSearchErrorModel.fetchChannelErrorCode(error: result.error.code))
                            return
                        }
                        for channel in result.channels {
                            self.notifyListeners(BrotherPrinterEvent.onPrinterAvailable.rawValue, data: self.chanelToPrinter(port: "bluetooth", channel: channel))
                        }
                        call.resolve()
                    }
                }
                return
            }
            for channel in searcher.channels {
                NSLog(channel.channelInfo)
                self.notifyListeners(BrotherPrinterEvent.onPrinterAvailable.rawValue, data: self.chanelToPrinter(port: "bluetooth", channel: channel))
            }
            call.resolve()
        }

    }

    private func searchBLEPrinter(_ call: CAPPluginCall) {
        DispatchQueue.global().async {
            self.cancelRoutineBluetooth = {
                BRLMPrinterSearcher.cancelBLESearch()
            }
            defer { self.cancelRoutineBluetooth = nil }
            let option = BRLMBLESearchOption()
            option.searchDuration = TimeInterval(call.getInt("searchDuration", 15))
            NSLog("BRLMPrinterSearcher.startBLESearch")
            let searcher = BRLMPrinterSearcher.startBLESearch(option) { channel in
                self.notifyListeners(BrotherPrinterEvent.onPrinterAvailable.rawValue, data: self.chanelToPrinter(port: "bluetoothLowEnergy", channel: channel))
            }
            guard searcher.error.code == BRLMPrinterSearchErrorCode.noError else {
                call.reject("Error - startBLESearch: " + PrinterSearchErrorModel.fetchChannelErrorCode(error: searcher.error.code))
                return
            }
            call.resolve()
        }
    }

    private func chanelToPrinter(port: String, channel: BRLMChannel) -> JSObject {
        let modelName = channel.extraInfo?.value(forKey: BRLMChannelExtraInfoKeyModelName) as? String ?? ""
        let serialNumber = channel.extraInfo?.value(forKey: BRLMChannelExtraInfoKeySerialNumber) as? String ?? ""
        let macAddress = channel.extraInfo?.value(forKey: BRLMChannelExtraInfoKeyMacAddress) as? String ?? ""
        let nodeName = channel.extraInfo?.value(forKey: BRLMChannelExtraInfoKeyNodeName) as? String ?? ""
        let location = channel.extraInfo?.value(forKey: BRLMChannelExtraInfoKeyLocation) as? String ?? ""
        let ipaddress = channel.channelInfo

        return [
            "port": port,
            "modelName": modelName,
            "serialNumber": serialNumber,
            "macAddress": macAddress,
            "nodeName": nodeName,
            "location": location,
            "channelInfo": ipaddress
        ]
    }

    @objc func cancelSearchWiFiPrinter(_ call: CAPPluginCall) {
        DispatchQueue.global().async {
            self.cancelRoutineWiFi?()
            self.cancelRoutineWiFi = nil
            call.resolve()
        }
    }

    @objc func cancelSearchBluetoothPrinter(_ call: CAPPluginCall) {
        DispatchQueue.global().async {
            self.cancelRoutineBluetooth?()
            self.cancelRoutineBluetooth = nil
            call.resolve()
        }
    }
}

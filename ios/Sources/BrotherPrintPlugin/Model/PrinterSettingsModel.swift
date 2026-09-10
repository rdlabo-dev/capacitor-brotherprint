import BRLMPrinterKit
import Foundation
import Capacitor

class PrinterSettingsModel {
    static func TDModelSettings(_ call: CAPPluginCall, printSettings: BRLMTDPrintSettings) -> BRLMTDPrintSettings {
        let baseSettings = self.baseModelSettings(call, printSettings: printSettings)

        let margins = BrotherModel.getMargin(call.getDouble("marginTop", 0), call.getDouble("marginRight", 0), call.getDouble("marginBottom", 0), call.getDouble("marginLeft", 0))

        let unit = BrotherModel.getCustomPaperSizeLengthUnit(unit: call.getString("paperUnit", "mm"))

        baseSettings.customPaperSize = BrotherModel.getCustomPaper(
            type: call.getString("paperType")!,
            width: call.getFloat("tapeWidth", 0),
            length: call.getFloat("tapeLength", 0),
            margins: margins,
            markPosition: call.getFloat("paperMarkPosition", 0),
            markLength: call.getFloat("paperMarkLength", 0),
            gapLength: call.getFloat("gapLength", 0),
            unit: unit
        )

        if let autoCut = call.getBool("autoCut") ?? nil {
            baseSettings.autoCut = autoCut
            baseSettings.cutAtEnd = true
        }

        let report = BRLMValidatePrintSettings.validate(baseSettings)
        NSLog(report.description())

        return printSettings
    }

    static func QLModelSettings(_ call: CAPPluginCall, printSettings: BRLMQLPrintSettings) -> BRLMQLPrintSettings {
        let baseSettings = self.baseModelSettings(call, printSettings: printSettings)
        baseSettings.labelSize = BrotherModel.getLabelSize(from: call.getString("labelName", "rollW62"))

        if let autoCut = call.getBool("autoCut") ?? nil {
            baseSettings.autoCut = autoCut
            baseSettings.cutAtEnd = true
        }

        let report = BRLMValidatePrintSettings.validate(baseSettings)
        NSLog(report.description())

        return baseSettings
    }

    static func baseModelSettings<T: BRLMPrintImageSettings>(_ call: CAPPluginCall, printSettings: T) -> T {
        printSettings.numCopies = UInt(call.getInt("numberOfCopies", 1))

        let scaleModes: [String: BRLMPrintSettingsScaleMode] = [
            "ActualSize": .actualSize,
            "FitPageAspect": .fitPageAspect,
            "FitPaperAspect": .fitPaperAspect,
            "ScaleValue": .scaleValue
        ]
        if let scaleMode = call.getString("scaleMode") ?? nil {
            if let mapped = scaleModes[scaleMode] {
                printSettings.scaleMode = mapped
                if scaleMode == "ScaleValue" {
                    if call.getInt("scaleValue") != nil {
                        printSettings.scaleValue = CGFloat(call.getFloat("scaleValue")!)
                    }
                }
            }
        }

        let halftones: [String: BRLMPrintSettingsHalftone] = [
            "Threshold": .threshold,
            "ErrorDiffusion": .errorDiffusion,
            "PatternDither": .patternDither
        ]
        if let halftone = call.getString("halftone") ?? nil {
            if let mapped = halftones[halftone] {
                printSettings.halftone = mapped
                if halftone == "Threshold" {
                    if call.getInt("halftoneThreshold") != nil {
                        printSettings.halftoneThreshold = UInt8(call.getInt("halftoneThreshold")!)
                    }
                }
            }
        }

        let imageRotations: [String: BRLMPrintSettingsRotation] = [
            "Rotate0": .rotate0,
            "Rotate90": .rotate90,
            "Rotate180": .rotate180,
            "Rotate270": .rotate270
        ]
        if let imageRotation = call.getString("imageRotation") ?? nil {
            if let mapped = imageRotations[imageRotation] {
                printSettings.imageRotation = mapped
            }
        }

        let verticalAlignments: [String: BRLMPrintSettingsVerticalAlignment] = [
            "Top": .top,
            "Center": .center,
            "Bottom": .bottom
        ]
        if let verticalAlignment = call.getString("verticalAlignment") ?? nil {
            if let mapped = verticalAlignments[verticalAlignment] {
                printSettings.vAlignment = mapped
            }
        }

        let horizontalAlignments: [String: BRLMPrintSettingsHorizontalAlignment] = [
            "Left": .left,
            "Center": .center,
            "Right": .right
        ]
        if let horizontalAlignment = call.getString("horizontalAlignment") ?? nil {
            if let mapped = horizontalAlignments[horizontalAlignment] {
                printSettings.hAlignment = mapped
            }
        }

        let compressModes: [String: BRLMPrintSettingsCompressMode] = [
            "None": .none,
            "Tiff": .tiff,
            "Mode9": .mode9
        ]
        if let compressMode = call.getString("compressMode") ?? nil {
            if let mapped = compressModes[compressMode] {
                printSettings.compress = mapped
            }
        }

        let printQualities: [String: BRLMPrintSettingsPrintQuality] = [
            "Best": .best,
            "Fast": .fast
        ]
        if let printQuality = call.getString("printQuality") ?? nil {
            if let mapped = printQualities[printQuality] {
                printSettings.printQuality = mapped
            }
        }

        //        if let resolution = call.getString("resolution") ?? nil {
        //            switch resolution {
        //            case "Low":
        //                printSettings.resolution = BRLMPrintSettingsResolution.low
        //            case "Normal":
        //                printSettings.resolution = BRLMPrintSettingsResolution.normal
        //            case "High":
        //                printSettings.resolution = BRLMPrintSettingsResolution.high
        //            default: break
        //            }
        //        }

        return printSettings
    }
}

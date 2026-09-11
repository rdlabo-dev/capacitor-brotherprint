import type {
  BRLMPrinterLabelName,
  BRLMPrinterModelName,
  BRLMPrinterAutoCutType,
  BRLMPrinterCompressMode,
  BRLMPrinterHalftone,
  BRLMPrinterHalftoneThresholdType,
  BRLMPrinterHorizontalAlignment,
  BRLMPrinterNumberOfCopies,
  BRLMPrinterPrintQuality,
  BRLMPrinterImageRotation,
  BRLMPrinterScaleMode,
  BRLMPrinterScaleValueType,
  BRLMPrinterVerticalAlignment,
  BRLMPrinterCustomPaperType,
  BRLMPrinterCustomPaperUnit,
  BRLMPrinterPort,
} from './brother-printer.enum';

export type BRLMChannelResult = {
  port: BRLMPrinterPort;
  modelName: string;
  serialNumber: string;
  macAddress: string;
  nodeName: string;
  location: string;

  /**
   * This need to connect to the printer.
   * wifi: IP Address
   * bluetooth: macAddress
   * bluetoothLowEnergy: modelName for bluetoothLowEnergy
   */
  channelInfo: string;
};

export type BRLMPrintOptions = {
  encodedImage: string;

  /**
   * Should use enum BRLMPrinterModelName
   */
  modelName: BRLMPrinterModelName;
} & Partial<BRLMChannelResult> &
  (BRLMPrinterQLModelSettings | BRLMPrinterTDModelSettings);

export type isChannelAvailableResult = {
  result: boolean;
};

export type BRLMPrinterTDModelSettings = {
  /**
   * Should use enum BRKMPrinterCustomPaperType
   */
  paperType: BRLMPrinterCustomPaperType;

  /**
   * The width of the label. For example, the RD-U04J1 is 60.0 wide.
   */
  tapeWidth: number;

  /**
   * The length of the label. For example, the RD-U04J1 is 60.0 wide.
   */
  tapeLength: number;

  /**
   * It is the difference between a sticker and a mount.
   * For example, the RD-U04J1 is `1.0, 2.0, 1.0, 2.0`
   */
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;

  /**
   * The spacing between seals. For example, the RD-U04J1 is 0.2.
   */
  gapLength: number;

  paperMarkPosition: number;
  paperMarkLength: number;

  /**
   * Should use enum BRKMPrinterCustomPaperUnit.
   * For example, the RD-U04J1 is mm.
   */
  paperUnit: BRLMPrinterCustomPaperUnit;
};

export type BRLMPrinterQLModelSettings = {
  /**
   * Should use enum BRLMPrinterLabelName
   */
  labelName: BRLMPrinterLabelName;
} & BRLMPrinterSettings;

/**
 * These are optional. If these are not set, default values are assigned by the printer.
 */
export type BRLMPrinterSettings = {
  /**
   * The number of copies you print.
   */
  numberOfCopies?: BRLMPrinterNumberOfCopies;

  /**
   * Whether the auto-cut is enabled or not. If true, your printer cut the paper each page.
   */
  autoCut?: BRLMPrinterAutoCutType;

  /**
   * A scale mode that specifies how your data is scaled in a print area of your printer.
   */
  scaleMode?: BRLMPrinterScaleMode;

  /**
   * A scale value. This is effective when ScaleMode is ScaleValue.
   */
  scaleValue?: BRLMPrinterScaleValueType;

  /**
   * A way to rasterize your data.
   */
  halftone?: BRLMPrinterHalftone;

  /**
   * A threshold value. This is effective when the Halftone is Threshold.
   */
  halftoneThreshold?: BRLMPrinterHalftoneThresholdType;

  /**
   * An image rotation that specifies the angle in which your data is placed in the print area. Rotation direction is clockwise.
   */
  imageRotation?: BRLMPrinterImageRotation;

  /**
   * A vertical alignment that specifies how your data is placed in the printable area.
   */
  verticalAlignment?: BRLMPrinterVerticalAlignment;

  /**
   * A horizontal alignment that specifies how your data is placed in the printable area.
   */
  horizontalAlignment?: BRLMPrinterHorizontalAlignment;

  /**
   * A compress mode that specifies how to compress your data.
   * note: This is ios only.
   */
  compressMode?: BRLMPrinterCompressMode;

  /**
   * A priority that is print speed or print quality. Whether or not this has an effect is depend on your printer.
   */
  printQuality?: BRLMPrinterPrintQuality;
};

export type BRLMSearchOption = {
  /**
   * 'usb' is android only, and now developing.
   */
  port: BRLMPrinterPort;

  /**
   * searchDuration is the time to end search for devices.
   * default is 15 seconds.
   * Used for Wi-Fi, BLE, and the iOS Bluetooth accessory picker wait.
   * Timing out does not dismiss the system accessory picker; close it before retrying.
   */
  searchDuration: number;
  /**
   * Android Bluetooth Classic only. Include only devices whose Bluetooth class
   * reports a printer. Defaults to false; ignored for other ports and on iOS.
   * This does not identify Brother devices. Devices with an unknown class are excluded when true.
   */
  bluetoothPrintersOnly?: boolean;
};

export type ErrorInfo = {
  message: string;
  code: number;
};

import { BRLMPrinterModelName as Model, BRLMPrinterPort as Port } from './brother-printer.enum';

export const printerPorts: Record<Model, readonly Port[]> = {
  [Model.QL_800]: [Port.usb],
  [Model.QL_810W]: [Port.wifi, Port.usb],
  [Model.QL_820NWB]: [Port.wifi, Port.bluetooth, Port.usb],
  [Model.TD_2320D_203]: [Port.wifi, Port.usb],
  [Model.TD_2030AD]: [Port.usb],
  [Model.TD_2350D_300]: [Port.wifi, Port.bluetooth, Port.usb, Port.bluetoothLowEnergy],
};

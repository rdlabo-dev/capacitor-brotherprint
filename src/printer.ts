import { Capacitor } from '@capacitor/core';

import { BRLMPrinterModelName, BRLMPrinterPort } from './brother-printer.enum';
import { printerPorts } from './models';

/** Common display names for connection transports. */
export function brotherPrinterPortLabel(port: BRLMPrinterPort | undefined): string {
  switch (port) {
    case BRLMPrinterPort.wifi:
      return 'Wi-Fi';
    case BRLMPrinterPort.bluetooth:
      return 'Bluetooth';
    case BRLMPrinterPort.bluetoothLowEnergy:
      return 'Bluetooth LE';
    case BRLMPrinterPort.usb:
      return 'USB';
    default:
      return '';
  }
}

/** Connection choices for the existing models. USB is Android-only; wifi also covers Ethernet. */
export function brotherPrinterPorts(
  model: string,
  isAndroid = Capacitor.getPlatform() === 'android',
): BRLMPrinterPort[] {
  if (!Object.values(BRLMPrinterModelName).includes(model as BRLMPrinterModelName)) return [];
  return printerPorts[model as BRLMPrinterModelName].filter((port) => isAndroid || port !== BRLMPrinterPort.usb);
}

/** Keep a supported saved port; otherwise prefer USB for QL-800/810W on Android. */
export function resolveBrotherPrinterPort(model: string, saved?: BRLMPrinterPort): BRLMPrinterPort | undefined {
  const ports = brotherPrinterPorts(model);
  if (saved && ports.includes(saved)) return saved;
  if (
    ports.includes(BRLMPrinterPort.usb) &&
    (model === BRLMPrinterModelName.QL_800 || model === BRLMPrinterModelName.QL_810W)
  )
    return BRLMPrinterPort.usb;
  return ports[0];
}

/** Match discovery names to an existing model enum, including documented product aliases. */
export function brotherPrinterModel(name: string): BRLMPrinterModelName | undefined {
  const key = name
    .trim()
    .toUpperCase()
    .replace(/^BROTHER\s+/, '')
    .replace(/[-_ ]/g, '');
  // Product names omit TD resolution; QL-820NWBc and TD-2030A use the existing enum spellings.
  const product = key === 'QL820NWBC' ? 'QL820NWB' : key === 'TD2030A' ? 'TD2030AD' : key;
  return Object.values(BRLMPrinterModelName).find(
    (model) => model.replace(/_/g, '') === product || model.replace(/_(203|300)$/, '').replace(/_/g, '') === product,
  );
}

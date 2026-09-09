import { BRLMPrinterModelName, BRLMPrinterPort } from './brother-printer.enum';
import { printerPorts } from './models';

/** Connection choices for the existing models. USB is Android-only; wifi also covers Ethernet. */
export function brotherPrinterPorts(model: BRLMPrinterModelName, isAndroid: boolean): BRLMPrinterPort[] {
  return printerPorts[model].filter((port) => isAndroid || port !== BRLMPrinterPort.usb);
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

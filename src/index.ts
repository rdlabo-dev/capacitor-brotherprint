import { registerPlugin } from '@capacitor/core';

import type { BRLMPrinterModelName } from './brother-printer.enum';
import { BRLMPrinterPort } from './brother-printer.enum';
import type { BrotherPrintPlugin } from './definitions';
import { BrotherPrintEventsEnum } from './events.enum';
import type { BRLMChannelResult, BRLMSearchOption } from './interfaces';
import { brotherPrinterModel } from './printer';

const BrotherPrint = registerPlugin<BrotherPrintPlugin>('BrotherPrint', {
  web: () => import('./web').then((m) => new m.BrotherPrintWeb()),
});

export * from './definitions';
export * from './web';
export * from './events.enum';
export * from './interfaces';
export * from './brother-printer.enum';
export { BrotherPrint };

export * from './printer';

/**
 * Collect discovery events and remove this call's listener when native search finishes.
 * Run one search at a time: native discovery events are shared and have no request ID.
 * USB results are passed through even when the SDK supplies no model or address.
 */
export async function searchBrotherPrinters(
  options: BRLMSearchOption,
  model?: BRLMPrinterModelName,
): Promise<BRLMChannelResult[]> {
  const printers: BRLMChannelResult[] = [];
  const listener = await BrotherPrint.addListener(BrotherPrintEventsEnum.onPrinterAvailable, (printer) => {
    if (printer.port !== options.port) return;
    if (printer.port !== BRLMPrinterPort.usb && model !== undefined && brotherPrinterModel(printer.modelName) !== model)
      return;
    const index = printers.findIndex(
      (current) => current.port === printer.port && current.channelInfo === printer.channelInfo,
    );
    if (index < 0) printers.push(printer);
    else printers[index] = printer;
  });
  try {
    await BrotherPrint.search(options);
    return printers;
  } finally {
    await listener.remove();
  }
}

import {
  BrotherPrint,
  BrotherPrinterSession,
  checkBrotherPrinterChannel,
  BRLMPrinterModelName,
  BRLMPrinterPort,
  BRLMPrinterLabelName,
} from '@rdlabo/capacitor-brotherprint';
import type { BRLMChannelResult } from '@rdlabo/capacitor-brotherprint';

/** Invoke once per screen; storage is supplied by the application. */
export function createPrintSession(storage: Storage): BrotherPrinterSession {
  return new BrotherPrinterSession({
    storage: {
      get: (key) => storage.getItem(key),
      set: (key, value) => storage.setItem(key, value),
      remove: (key) => storage.removeItem(key),
    },
    storagePrefix: 'labels:',
  });
}

/** The same contract works with an asynchronous key/value store. */
export function createAsyncPrintSession(storage: {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  remove(key: string): Promise<unknown>;
}): BrotherPrinterSession {
  return new BrotherPrinterSession({
    storage: {
      get: (key) => storage.get(key),
      set: (key, value) => storage.set(key, value),
      remove: (key) => storage.remove(key),
    },
  });
}

export async function printLabel(
  session: BrotherPrinterSession,
  encodedImage: string,
  select: (channels: readonly BRLMChannelResult[]) => Promise<BRLMChannelResult | null>,
): Promise<BRLMChannelResult | undefined> {
  const model = BRLMPrinterModelName.QL_820NWB;
  const printers = await session.prepare({ port: BRLMPrinterPort.wifi, searchDuration: 10 }, model);
  const channel = printers.length === 1 ? printers[0] : printers.length > 1 ? await select(printers) : null;
  if (!channel || session.closed) return;
  await session.printImage({
    modelName: model,
    encodedImage,
    labelName: BRLMPrinterLabelName.RollW62,
    port: channel.port,
    channelInfo: channel.channelInfo,
  });
  return channel; // The session remembers the connection when storage is configured.
}

/** Manual addresses do not require discovery metadata or imply a printer model. */
export async function printToManualAddress(
  encodedImage: string,
  port: BRLMPrinterPort,
  address: string,
): Promise<boolean> {
  const channel = { port, channelInfo: address };
  if (!(await checkBrotherPrinterChannel(channel))) return false;
  await BrotherPrint.printImage({
    modelName: BRLMPrinterModelName.QL_820NWB,
    labelName: BRLMPrinterLabelName.RollW62,
    encodedImage,
    ...channel,
  });
  return true;
}

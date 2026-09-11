import type { PluginListenerHandle } from '@capacitor/core';
import { registerPlugin } from '@capacitor/core';

import type { BRLMPrinterModelName } from './brother-printer.enum';
import { BRLMPrinterPort } from './brother-printer.enum';
import type { BrotherPrintPlugin } from './definitions';
import { BrotherPrintEventsEnum } from './events.enum';
import type { BRLMChannelResult, BRLMPrintOptions, BRLMSearchOption, ErrorInfo } from './interfaces';
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

// Native discovery events are shared. Keep each helper call's listener scoped to its turn.
let connectionQueue: Promise<unknown> = Promise.resolve();

function queueConnection<T>(run: () => Promise<T>): Promise<T> {
  const result = connectionQueue.then(run);
  connectionQueue = result.catch(() => undefined);
  return result;
}

/** Collect discovery results, waiting for earlier helper calls to finish. */
export function searchBrotherPrinters(
  options: BRLMSearchOption,
  _model?: BRLMPrinterModelName,
): Promise<BRLMChannelResult[]> {
  return queueConnection(() => discoverPrinters(options));
}

/**
 * Reuse a matching, available previous channel; otherwise discover printers.
 * The caller owns storage. USB always discovers again through the native permission flow.
 * Availability errors propagate; only an unavailable channel triggers discovery.
 */
export function prepareBrotherPrinters(
  options: BRLMSearchOption,
  model: BRLMPrinterModelName,
  previous?: BRLMChannelResult | null,
): Promise<BRLMChannelResult[]> {
  return queueConnection(() => preparePrinters(options, model, previous));
}

/**
 * Check an explicitly selected address without discovery or fallback to another printer.
 * Port must be supplied; an address does not identify its transport or printer model.
 */
export function checkBrotherPrinterChannel(channel: Pick<BRLMChannelResult, 'port' | 'channelInfo'>): Promise<boolean> {
  return queueConnection(async () => {
    const { result } = await BrotherPrint.isChannelAvailable({
      modelName: '',
      serialNumber: '',
      macAddress: '',
      nodeName: '',
      location: '',
      ...channel,
    });
    return result;
  });
}

async function discoverPrinters(
  options: BRLMSearchOption,
  active: () => boolean = () => true,
): Promise<BRLMChannelResult[]> {
  const printers: BRLMChannelResult[] = [];
  const listener = await BrotherPrint.addListener(BrotherPrintEventsEnum.onPrinterAvailable, (printer) => {
    if (printer.port !== options.port) return;
    const index = printers.findIndex(
      (current) => current.port === printer.port && current.channelInfo === printer.channelInfo,
    );
    if (index < 0) printers.push(printer);
    else printers[index] = printer;
  });
  await (active() ? BrotherPrint.search(options) : Promise.resolve()).finally(() => listener.remove());
  return printers;
}

async function preparePrinters(
  options: BRLMSearchOption,
  model: BRLMPrinterModelName,
  previous?: BRLMChannelResult | null,
  active: () => boolean = () => true,
): Promise<BRLMChannelResult[]> {
  if (
    options.port !== BRLMPrinterPort.usb &&
    previous?.port === options.port &&
    previous.channelInfo.trim() &&
    brotherPrinterModel(previous.modelName) === model
  ) {
    const available = await BrotherPrint.isChannelAvailable(previous);
    if (available.result) return [previous];
  }
  return active() ? discoverPrinters(options, active) : [];
}

export interface BrotherPrinterEvents {
  onPrint?: () => void;
  onPrintError?: (info: ErrorInfo) => void;
  onPrintFailedCommunication?: (info: ErrorInfo) => void;
}

/** String storage callbacks; both synchronous and asynchronous stores are supported. */
export interface BrotherPrinterStorage {
  get(key: string): string | null | undefined | Promise<string | null | undefined>;
  set(key: string, value: string): unknown;
  remove(key: string): unknown;
}

export interface BrotherPrinterSessionOptions {
  storage?: BrotherPrinterStorage;
  /** Defaults to `brotherprint:`. The session appends `last-printer`. */
  storagePrefix?: string;
}

/** One print screen's discovery results and event subscriptions. Create a new session after disposal. */
export class BrotherPrinterSession {
  #closed = false;
  #printers: BRLMChannelResult[] = [];
  #listeners: Promise<PluginListenerHandle>[] = [];
  #listening?: Promise<void>;
  #disposal?: Promise<void>;
  readonly #storage?: BrotherPrinterStorage;
  readonly #storageKey: string;

  constructor(options: BrotherPrinterSessionOptions = {}) {
    this.#storage = options.storage;
    this.#storageKey = `${options.storagePrefix ?? 'brotherprint:'}last-printer`;
  }

  get closed(): boolean {
    return this.#closed;
  }

  get printers(): readonly BRLMChannelResult[] {
    return this.#printers;
  }

  search(options: BRLMSearchOption, _model?: BRLMPrinterModelName): Promise<readonly BRLMChannelResult[]> {
    return this.#discover(() => discoverPrinters(options, () => !this.#closed));
  }

  prepare(
    options: BRLMSearchOption,
    model: BRLMPrinterModelName,
    previous?: BRLMChannelResult | null,
  ): Promise<readonly BRLMChannelResult[]> {
    return this.#discover(async () => {
      const saved = previous === undefined ? await this.#readSavedPrinter().catch(() => undefined) : previous;
      if (this.#closed) return [];
      return preparePrinters(options, model, saved, () => !this.#closed);
    });
  }

  async #readSavedPrinter(): Promise<BRLMChannelResult | undefined> {
    const value = await this.#storage?.get(this.#storageKey);
    if (!value) return undefined;
    const channel = JSON.parse(value);
    if (
      channel &&
      Object.values(BRLMPrinterPort).includes(channel.port) &&
      ['modelName', 'channelInfo', 'serialNumber', 'macAddress', 'nodeName', 'location'].every(
        (key) => typeof channel[key] === 'string',
      )
    )
      return channel;
    return undefined;
  }

  /** Forget the remembered connection. Storage removal errors propagate to the caller. */
  async clearSavedPrinter(): Promise<void> {
    await this.#storage?.remove(this.#storageKey);
  }

  async #savePrinter(options: BRLMPrintOptions): Promise<void> {
    if (!this.#storage || !options.port || !options.channelInfo?.trim()) return;
    const found = this.#printers.find(
      (printer) => printer.port === options.port && printer.channelInfo === options.channelInfo,
    );
    const channel: BRLMChannelResult = {
      serialNumber: '',
      macAddress: '',
      nodeName: '',
      location: '',
      ...found,
      port: options.port,
      channelInfo: options.channelInfo,
      modelName: options.modelName,
    };
    await this.#storage.set(this.#storageKey, JSON.stringify(channel));
  }

  #discover(run: () => Promise<BRLMChannelResult[]>): Promise<readonly BRLMChannelResult[]> {
    return queueConnection(async () => {
      if (this.#closed) return [];
      this.#printers = [];
      return run().then((printers) => {
        if (this.#closed) return [];
        this.#printers = printers;
        return printers;
      });
    });
  }

  /** Register print notifications once. Callbacks stop immediately when disposed. */
  listen(events: BrotherPrinterEvents): Promise<void> {
    if (this.#closed) return Promise.resolve();
    if (!this.#listening) {
      this.#listeners = [
        BrotherPrint.addListener(BrotherPrintEventsEnum.onPrint, () => {
          if (!this.#closed) events.onPrint?.();
        }),
        BrotherPrint.addListener(BrotherPrintEventsEnum.onPrintError, (info) => {
          if (!this.#closed) events.onPrintError?.(info);
        }),
        BrotherPrint.addListener(BrotherPrintEventsEnum.onPrintFailedCommunication, (info) => {
          if (!this.#closed) events.onPrintFailedCommunication?.(info);
        }),
      ];
      this.#listening = Promise.all(this.#listeners).then(() => undefined);
    }
    return this.#listening;
  }

  /** A closed session cannot start another print. Already started native printing is awaited. */
  async printImage(options: BRLMPrintOptions): Promise<void> {
    if (this.#closed) return;
    if (this.#storage) await this.#savePrinter(options).catch(() => undefined);
    if (!this.#closed) await BrotherPrint.printImage(options);
  }

  /** Invalidate pending work immediately, then remove this session's print listeners. */
  dispose(): Promise<void> {
    this.#closed = true;
    this.#printers = [];
    this.#disposal ??= Promise.all(this.#listeners.map((listener) => listener.then((handle) => handle.remove()))).then(
      () => undefined,
    );
    return this.#disposal;
  }
}

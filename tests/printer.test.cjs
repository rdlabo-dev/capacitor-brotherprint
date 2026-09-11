const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const core = require('@capacitor/core');

// Capture the existing registration without calling native code.
const plugin = {};
const registration = mock.method(core, 'registerPlugin', () => plugin);
const {
  BrotherPrint,
  brotherPrinterPorts,
  brotherPrinterModel,
  searchBrotherPrinters,
  prepareBrotherPrinters,
  checkBrotherPrinterChannel,
  BRLMPrinterModelName: Model,
  BRLMPrinterPort: Port,
} = require('../dist/plugin.cjs.js');
registration.mock.restore();

const channel = {
  port: Port.wifi,
  modelName: 'Brother QL-820NWBc',
  channelInfo: '192.0.2.1',
  serialNumber: '',
  macAddress: '',
  nodeName: '',
  location: '',
};
function setup() {
  let emit;
  const remove = mock.fn(async () => {});
  plugin.addListener = mock.fn(async (_event, callback) => {
    emit = callback;
    return { remove };
  });
  plugin.search = mock.fn(async () => {});
  plugin.isChannelAvailable = mock.fn(async () => ({ result: true }));
  return { remove, emit: (value) => emit(value) };
}

describe('model helpers', () => {
  const connections = [
    [Model.QL_800, [Port.usb]],
    [Model.QL_810W, [Port.wifi, Port.usb]],
    [Model.QL_820NWB, [Port.wifi, Port.bluetooth, Port.usb]],
    [Model.TD_2320D_203, [Port.wifi, Port.usb]],
    [Model.TD_2030AD, [Port.usb]],
    [Model.TD_2350D_300, [Port.wifi, Port.bluetooth, Port.usb, Port.bluetoothLowEnergy]],
  ];
  for (const [model, ports] of connections)
    it(`${model} provides Android and iOS choices`, () => {
      assert.deepEqual(brotherPrinterPorts(model, true), ports);
      assert.deepEqual(
        brotherPrinterPorts(model, false),
        ports.filter((port) => port !== Port.usb),
      );
    });
  it('uses all existing enum values and handles product names', () => {
    assert.deepEqual(
      connections.map(([model]) => model),
      Object.values(Model),
    );
    for (const model of Object.values(Model)) assert.equal(brotherPrinterModel(model), model);
    assert.equal(brotherPrinterModel(' Brother QL-820NWBc '), Model.QL_820NWB);
    assert.equal(brotherPrinterModel('TD-2350D'), Model.TD_2350D_300);
    assert.equal(brotherPrinterModel('TD-2320D'), Model.TD_2320D_203);
    assert.equal(brotherPrinterModel('TD-2030A'), Model.TD_2030AD);
    assert.equal(brotherPrinterModel('TD-2350D_203'), undefined);
    assert.equal(brotherPrinterModel('unknown'), undefined);
  });
});

describe('searchBrotherPrinters', () => {
  it('uses the bundled plugin, filters results and removes its listener', async () => {
    const { emit, remove } = setup();
    assert.equal(BrotherPrint, plugin);
    const options = { port: Port.wifi, searchDuration: 5 };
    plugin.search = mock.fn(async () => {
      emit(channel);
      emit({ ...channel, nodeName: 'updated' });
      emit({ ...channel, channelInfo: '192.0.2.2' });
      emit({ ...channel, modelName: 'TD-2350D', channelInfo: '192.0.2.3' });
      emit({ ...channel, port: Port.bluetooth });
    });
    assert.deepEqual(await searchBrotherPrinters(options, Model.QL_820NWB), [
      { ...channel, nodeName: 'updated' },
      { ...channel, channelInfo: '192.0.2.2' },
      { ...channel, modelName: 'TD-2350D', channelInfo: '192.0.2.3' },
    ]);
    assert.deepEqual(plugin.search.mock.calls[0].arguments, [options]);
    assert.equal(remove.mock.callCount(), 1);
  });
  it('returns an empty array when nothing is found', async () => {
    const { remove } = setup();
    assert.deepEqual(await searchBrotherPrinters({ port: Port.wifi, searchDuration: 10 }), []);
    assert.equal(remove.mock.callCount(), 1);
  });
  it('preserves native failures and removes its listener', async () => {
    const { remove } = setup();
    const error = new Error('Search failed');
    plugin.search = async () => {
      throw error;
    };
    await assert.rejects(searchBrotherPrinters({ port: Port.wifi, searchDuration: 10 }), (value) => value === error);
    assert.equal(remove.mock.callCount(), 1);
  });
  it('does not search if registration fails', async () => {
    setup();
    const error = new Error('Listener failed');
    plugin.addListener = async () => {
      throw error;
    };
    await assert.rejects(searchBrotherPrinters({ port: Port.wifi, searchDuration: 10 }), (value) => value === error);
    assert.equal(plugin.search.mock.callCount(), 0);
  });
  it('keeps unknown models when no filter is requested', async () => {
    const { emit } = setup();
    const unknown = { ...channel, modelName: 'unknown' };
    plugin.search = async () => emit(unknown);
    assert.deepEqual(await searchBrotherPrinters({ port: Port.wifi, searchDuration: 10 }), [unknown]);
  });
  it('accepts the existing empty USB address and model', async () => {
    const { emit } = setup();
    const usb = { ...channel, port: Port.usb, channelInfo: '', modelName: '' };
    plugin.search = async () => emit(usb);
    assert.deepEqual(await searchBrotherPrinters({ port: Port.usb, searchDuration: 10 }, Model.QL_820NWB), [usb]);
  });
  it('keeps multiple candidates including different models', async () => {
    const { emit } = setup();
    const first = { ...channel, port: Port.bluetooth, modelName: 'QL-820NWB9475', channelInfo: 'SN-9475' };
    const second = { ...channel, port: Port.bluetooth, modelName: 'QL-820NWB1234', channelInfo: 'SN-1234' };
    const other = { ...channel, port: Port.bluetooth, modelName: 'TD-2350D_2991', channelInfo: 'SN-2991' };
    plugin.search = async () => {
      emit(first);
      emit(second);
      emit(other);
    };
    assert.deepEqual(await searchBrotherPrinters({ port: Port.bluetooth, searchDuration: 10 }, Model.QL_820NWB), [
      first,
      second,
      other,
    ]);
  });
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('discovery sequencing and previous channel reuse', () => {
  const options = { port: Port.wifi, searchDuration: 10 };
  it('keeps concurrent searches and listener cleanup in order, then recovers after failure', async () => {
    const { emit } = setup();
    const started = deferred();
    const finished = deferred();
    const removing = deferred();
    const removed = deferred();
    let call = 0;
    const add = plugin.addListener;
    plugin.addListener = mock.fn(async (...args) => {
      const handle = await add(...args);
      if (plugin.addListener.mock.callCount() === 1)
        return {
          remove: async () => {
            removing.resolve();
            await removed.promise;
          },
        };
      return handle;
    });
    plugin.search = mock.fn(async () => {
      if (++call === 1) {
        started.resolve();
        await finished.promise;
      } else emit(channel);
    });
    const error = new Error('First search failed');
    const first = assert.rejects(searchBrotherPrinters(options), (value) => value === error);
    const second = searchBrotherPrinters(options);
    await started.promise;
    assert.equal(plugin.addListener.mock.callCount(), 1);
    finished.reject(error);
    await removing.promise;
    assert.equal(plugin.search.mock.callCount(), 1);
    removed.resolve();
    await first;
    assert.deepEqual(await second, [channel]);
    assert.equal(plugin.search.mock.callCount(), 2);
  });
  it('rechecks a previous channel on each call without searching when available', async () => {
    setup();
    assert.deepEqual(await prepareBrotherPrinters(options, Model.QL_820NWB, channel), [channel]);
    assert.deepEqual(await prepareBrotherPrinters(options, Model.QL_820NWB, channel), [channel]);
    assert.equal(plugin.isChannelAvailable.mock.callCount(), 2);
    assert.equal(plugin.search.mock.callCount(), 0);
    assert.equal(plugin.addListener.mock.callCount(), 0);
  });
  it('discovers when the previous channel is unavailable', async () => {
    const { emit } = setup();
    const replacement = { ...channel, channelInfo: '192.0.2.9' };
    plugin.isChannelAvailable = async () => ({ result: false });
    plugin.search = async () => emit(replacement);
    assert.deepEqual(await prepareBrotherPrinters(options, Model.QL_820NWB, channel), [replacement]);
  });
  it('skips reuse for absent, mismatched or empty channels', async () => {
    const { emit } = setup();
    plugin.search = async () => emit(channel);
    for (const previous of [
      undefined,
      null,
      { ...channel, port: Port.bluetooth },
      { ...channel, modelName: 'TD-2350D' },
      { ...channel, channelInfo: '' },
    ]) {
      assert.deepEqual(await prepareBrotherPrinters(options, Model.QL_820NWB, previous), [channel]);
    }
    assert.equal(plugin.isChannelAvailable.mock.callCount(), 0);
  });
  it('always rediscovers USB through the existing native flow', async () => {
    const { emit } = setup();
    const usb = { ...channel, port: Port.usb, channelInfo: '' };
    plugin.search = mock.fn(async () => emit(usb));
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(await prepareBrotherPrinters({ ...options, port: Port.usb }, Model.QL_820NWB, usb), [usb]);
    }
    assert.equal(plugin.isChannelAvailable.mock.callCount(), 0);
    assert.equal(plugin.search.mock.callCount(), 2);
  });
  it('preserves availability errors and keeps the queue usable', async () => {
    const { emit } = setup();
    const error = new Error('Permission denied');
    plugin.isChannelAvailable = async () => {
      throw error;
    };
    await assert.rejects(prepareBrotherPrinters(options, Model.QL_820NWB, channel), (value) => value === error);
    assert.equal(plugin.search.mock.callCount(), 0);
    plugin.search = async () => emit(channel);
    assert.deepEqual(await searchBrotherPrinters(options), [channel]);
  });
  it('queues preparation and direct discovery together', async () => {
    const { emit } = setup();
    const started = deferred();
    const available = deferred();
    plugin.isChannelAvailable = async () => {
      started.resolve();
      return available.promise;
    };
    const prepare = prepareBrotherPrinters(options, Model.QL_820NWB, channel);
    const search = searchBrotherPrinters(options);
    await started.promise;
    assert.equal(plugin.addListener.mock.callCount(), 0);
    plugin.search = async () => emit(channel);
    available.resolve({ result: true });
    assert.deepEqual(await prepare, [channel]);
    assert.deepEqual(await search, [channel]);
  });
});

describe('explicit or manually entered channels', () => {
  it('checks an explicit port and address without discovery or guessing its transport', async () => {
    setup();
    const manual = { port: Port.bluetooth, channelInfo: 'printer-serial-number' };
    assert.equal(await checkBrotherPrinterChannel(manual), true);
    assert.deepEqual(plugin.isChannelAvailable.mock.calls[0].arguments, [
      {
        modelName: '',
        serialNumber: '',
        macAddress: '',
        nodeName: '',
        location: '',
        ...manual,
      },
    ]);
    assert.equal(plugin.search.mock.callCount(), 0);
    assert.equal(plugin.addListener.mock.callCount(), 0);
  });
  it('returns unavailable and propagates errors without switching to another printer', async () => {
    setup();
    const manual = { port: Port.wifi, channelInfo: '192.0.2.42' };
    plugin.isChannelAvailable = async () => ({ result: false });
    assert.equal(await checkBrotherPrinterChannel(manual), false);
    const error = new Error('Native connection check failed');
    plugin.isChannelAvailable = async () => {
      throw error;
    };
    await assert.rejects(checkBrotherPrinterChannel(manual), (value) => value === error);
    assert.equal(plugin.search.mock.callCount(), 0);
  });
  it('waits for active discovery before checking a manual channel', async () => {
    setup();
    const started = deferred();
    const finished = deferred();
    plugin.search = async () => {
      started.resolve();
      await finished.promise;
    };
    const search = searchBrotherPrinters({ port: Port.wifi, searchDuration: 10 });
    const check = checkBrotherPrinterChannel({ port: Port.wifi, channelInfo: '192.0.2.42' });
    await started.promise;
    assert.equal(plugin.isChannelAvailable.mock.callCount(), 0);
    finished.resolve();
    await search;
    assert.equal(await check, true);
    assert.equal(plugin.isChannelAvailable.mock.callCount(), 1);
  });
});

const { BrotherPrinterSession } = require('../dist/plugin.cjs.js');
describe('BrotherPrinterSession', () => {
  it('owns discovery results and clears them on disposal', async () => {
    const { emit } = setup();
    plugin.search = mock.fn(async () => emit(channel));
    const session = new BrotherPrinterSession();
    assert.deepEqual(await session.search({ port: Port.wifi }), [channel]);
    assert.deepEqual(session.printers, [channel]);
    await session.dispose();
    assert.equal(session.closed, true);
    assert.deepEqual(session.printers, []);
    assert.deepEqual(await session.search({ port: Port.wifi }), []);
    assert.equal(plugin.search.mock.callCount(), 1);
  });

  it('ignores active results and skips queued work after disposal while allowing a new screen', async () => {
    const { emit, remove } = setup();
    const started = deferred();
    const finish = deferred();
    plugin.search = mock.fn(async () => {
      started.resolve();
      await finish.promise;
      emit(channel);
    });
    const old = new BrotherPrinterSession();
    const first = old.search({ port: Port.wifi });
    await started.promise;
    const queued = old.search({ port: Port.wifi });
    await old.dispose();
    finish.resolve();
    assert.deepEqual(await first, []);
    assert.deepEqual(await queued, []);
    assert.equal(plugin.search.mock.callCount(), 1);
    assert.equal(remove.mock.callCount(), 1);
    const next = new BrotherPrinterSession();
    assert.deepEqual(await next.search({ port: Port.wifi }), [channel]);
    await next.dispose();
  });

  it('does not start native discovery when disposed during listener registration', async () => {
    setup();
    const started = deferred();
    const finish = deferred();
    const remove = mock.fn(async () => {});
    plugin.addListener = mock.fn(async () => {
      started.resolve();
      await finish.promise;
      return { remove };
    });
    const session = new BrotherPrinterSession();
    const search = session.search({ port: Port.wifi });
    await started.promise;
    await session.dispose();
    finish.resolve();
    assert.deepEqual(await search, []);
    assert.equal(plugin.search.mock.callCount(), 0);
    assert.equal(remove.mock.callCount(), 1);
  });

  it('does not rediscover after disposal during an availability check', async () => {
    setup();
    const started = deferred();
    const finish = deferred();
    plugin.isChannelAvailable = mock.fn(async () => {
      started.resolve();
      return finish.promise;
    });
    const session = new BrotherPrinterSession();
    const preparation = session.prepare({ port: Port.wifi }, Model.QL_820NWB, channel);
    await started.promise;
    await session.dispose();
    finish.resolve({ result: false });
    assert.deepEqual(await preparation, []);
    assert.equal(plugin.search.mock.callCount(), 0);
  });

  it('registers events once and removes pending registrations, ignoring late callbacks', async () => {
    setup();
    const registration = deferred();
    const callbacks = [];
    const remove = mock.fn(async () => {});
    plugin.addListener = mock.fn(async (_event, callback) => {
      callbacks.push(callback);
      await registration.promise;
      return { remove };
    });
    const onPrint = mock.fn();
    const session = new BrotherPrinterSession();
    const listening = session.listen({ onPrint, onPrintError: onPrint, onPrintFailedCommunication: onPrint });
    assert.equal(session.listen({ onPrint }), listening);
    const disposal = session.dispose();
    for (const callback of callbacks) callback({ message: 'late' });
    assert.equal(onPrint.mock.callCount(), 0);
    registration.resolve();
    await listening;
    await disposal;
    await session.dispose();
    assert.equal(remove.mock.callCount(), 3);
  });

  it('awaits a native print already started but cannot start another after disposal', async () => {
    setup();
    const finish = deferred();
    plugin.printImage = mock.fn(() => finish.promise);
    const session = new BrotherPrinterSession();
    let completed = false;
    const printing = session.printImage({}).then(() => {
      completed = true;
    });
    await session.dispose();
    await session.printImage({});
    assert.equal(plugin.printImage.mock.callCount(), 1);
    assert.equal(completed, false);
    finish.resolve();
    await printing;
    assert.equal(completed, true);
  });
});

describe('session storage callbacks', () => {
  const options = { port: Port.wifi, searchDuration: 3 };
  const print = {
    port: Port.wifi,
    channelInfo: channel.channelInfo,
    modelName: Model.QL_820NWB,
    encodedImage: 'image',
  };
  function storage() {
    const values = new Map();
    return {
      values,
      get: (key) => values.get(key) ?? null,
      set: (key, value) => values.set(key, value),
      remove: (key) => values.delete(key),
    };
  }
  it('reuses a JSON connection across screens with synchronous callbacks and a custom prefix', async () => {
    setup();
    plugin.printImage = mock.fn(async () => {});
    const store = storage();
    const first = new BrotherPrinterSession({ storage: store, storagePrefix: 'labels:' });
    await first.printImage(print);
    await first.dispose();
    const saved = JSON.parse(store.values.get('labels:last-printer'));
    assert.equal(saved.channelInfo, channel.channelInfo);
    assert.equal(saved.encodedImage, undefined);
    assert.equal(saved.modelName, Model.QL_820NWB);
    const second = new BrotherPrinterSession({ storage: store, storagePrefix: 'labels:' });
    assert.deepEqual(await second.prepare(options, Model.QL_820NWB), [saved]);
    assert.equal(plugin.search.mock.callCount(), 0);
    await second.clearSavedPrinter();
    assert.equal(store.values.size, 0);
    await second.prepare(options, Model.QL_820NWB);
    assert.equal(plugin.search.mock.callCount(), 1);
  });
  it('awaits asynchronous callbacks and uses the default key', async () => {
    setup();
    plugin.printImage = mock.fn(async () => {});
    const store = storage();
    const session = new BrotherPrinterSession({
      storage: {
        get: async (key) => store.get(key),
        set: async (key, value) => store.set(key, value),
        remove: async (key) => store.remove(key),
      },
    });
    await session.printImage(print);
    assert.ok(store.values.has('brotherprint:last-printer'));
    assert.equal((await session.prepare(options, Model.QL_820NWB)).length, 1);
    await session.clearSavedPrinter();
    assert.equal(store.values.size, 0);
  });
  it('ignores corrupt or failing storage but preserves native errors', async () => {
    for (const value of ['{', '{}', 'null', '{"port":"wifi","modelName":3}']) {
      setup();
      const session = new BrotherPrinterSession({ storage: { get: () => value, set() {}, remove() {} } });
      await session.prepare(options, Model.QL_820NWB);
      assert.equal(plugin.search.mock.callCount(), 1);
    }
    for (const fail of [
      () => {
        throw new Error('storage');
      },
      async () => {
        throw new Error('storage');
      },
    ]) {
      setup();
      plugin.printImage = mock.fn(async () => {});
      const session = new BrotherPrinterSession({ storage: { get: fail, set: fail, remove: fail } });
      await session.prepare(options, Model.QL_820NWB);
      await session.printImage(print);
      assert.equal(plugin.printImage.mock.callCount(), 1);
      await assert.rejects(session.clearSavedPrinter(), /storage/);
      plugin.printImage = async () => {
        throw new Error('native');
      };
      await assert.rejects(session.printImage(print), /native/);
    }
  });
  it('does not start native work after disposal during storage reads or writes', async () => {
    for (const operation of ['get', 'set']) {
      setup();
      plugin.printImage = mock.fn(async () => {});
      const started = deferred();
      const finish = deferred();
      const store = storage();
      store[operation] = () => {
        started.resolve();
        return finish.promise;
      };
      const session = new BrotherPrinterSession({ storage: store });
      const pending = operation === 'get' ? session.prepare(options, Model.QL_820NWB) : session.printImage(print);
      await started.promise;
      await session.dispose();
      finish.resolve(JSON.stringify(channel));
      await pending;
      assert.equal(plugin.search.mock.callCount(), 0);
      assert.equal(plugin.isChannelAvailable.mock.callCount(), 0);
      assert.equal(plugin.printImage.mock.callCount(), 0);
    }
  });
  it('respects explicit previous channels, model/port changes and USB discovery', async () => {
    setup();
    const store = storage();
    store.set('brotherprint:last-printer', JSON.stringify(channel));
    const session = new BrotherPrinterSession({ storage: store });
    await session.prepare(options, Model.QL_810W);
    await session.prepare({ ...options, port: Port.bluetooth }, Model.QL_820NWB);
    await session.prepare({ ...options, port: Port.usb }, Model.QL_820NWB);
    await session.prepare(options, Model.QL_820NWB, null);
    assert.equal(plugin.search.mock.callCount(), 4);
    assert.equal(plugin.isChannelAvailable.mock.callCount(), 0);
    const explicit = { ...channel, channelInfo: '192.0.2.9' };
    assert.deepEqual(await session.prepare(options, Model.QL_820NWB, explicit), [explicit]);
  });
});

describe('platform-aware connection selection', () => {
  const { resolveBrotherPrinterPort, brotherPrinterPortLabel } = require('../dist/plugin.cjs.js');
  it('uses Capacitor platform and preserves supported saved connections', () => {
    const platform = mock.method(core.Capacitor, 'getPlatform', () => 'android');
    assert.deepEqual(brotherPrinterPorts(Model.QL_810W), [Port.wifi, Port.usb]);
    assert.equal(resolveBrotherPrinterPort(Model.QL_810W), Port.usb);
    assert.equal(resolveBrotherPrinterPort(Model.QL_800), Port.usb);
    assert.equal(resolveBrotherPrinterPort(Model.QL_820NWB), Port.wifi);
    assert.equal(resolveBrotherPrinterPort(Model.QL_810W, Port.wifi), Port.wifi);
    assert.equal(resolveBrotherPrinterPort(Model.QL_820NWB, Port.bluetooth), Port.bluetooth);
    assert.equal(resolveBrotherPrinterPort(Model.QL_800, Port.bluetooth), Port.usb);
    platform.mock.mockImplementation(() => 'ios');
    assert.deepEqual(brotherPrinterPorts(Model.QL_810W), [Port.wifi]);
    assert.equal(resolveBrotherPrinterPort(Model.QL_810W, Port.usb), Port.wifi);
    assert.equal(resolveBrotherPrinterPort(Model.QL_820NWB, Port.usb), Port.wifi);
    assert.equal(resolveBrotherPrinterPort(Model.QL_800, Port.usb), undefined);
    assert.deepEqual(brotherPrinterPorts('general'), []);
    assert.deepEqual(brotherPrinterPorts('toString'), []);
    assert.equal(resolveBrotherPrinterPort('general', Port.wifi), undefined);
    platform.mock.restore();
  });
  it('labels connection ports for display', () => {
    assert.equal(brotherPrinterPortLabel(Port.wifi), 'Wi-Fi');
    assert.equal(brotherPrinterPortLabel(Port.bluetooth), 'Bluetooth');
    assert.equal(brotherPrinterPortLabel(Port.bluetoothLowEnergy), 'Bluetooth LE');
    assert.equal(brotherPrinterPortLabel(Port.usb), 'USB');
    assert.equal(brotherPrinterPortLabel(undefined), '');
  });
});

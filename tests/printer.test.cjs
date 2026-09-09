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
});

# JavaScript printer helpers

These functions wrap the existing plugin API without changing native behavior.
They have no Angular or Ionic dependency. Sessions optionally remember connections through
application-supplied storage callbacks. All helpers share a queue to prevent overlapping
discovery and connection checks.

- `brotherPrinterPorts(model, isAndroid?)` returns connection choices for an existing
  model enum, using `Capacitor.getPlatform()` when the override is omitted. USB is
  Android-only. `wifi` also covers wired Ethernet. Unknown models return an empty array.
- `resolveBrotherPrinterPort(model, saved?)` keeps a supported saved connection.
  Otherwise it prefers USB for QL-800/QL-810W on Android, then the first supported
  connection. It returns `undefined` when no connection is supported.
- `brotherPrinterPortLabel(port)` returns a common display name: Wi-Fi, Bluetooth,
  Bluetooth LE or USB. An undefined or unknown port returns an empty string.
- `brotherPrinterModel(name)` matches a discovery name to the existing model enum,
  including product aliases such as QL-820NWBc. Unknown names return `undefined`.
- `searchBrotherPrinters(options, model?)` collects discovery events into an
  array. It registers its listener before searching and removes it when the search
  succeeds or fails. No results returns an empty array; native errors propagate.
- `prepareBrotherPrinters(options, model, previous?)` first checks a saved channel
  when its model and port match. If available, it returns `[previous]`; otherwise it
  discovers again. USB always discovers through the native permission flow. A rejected
  availability check propagates its error rather than silently starting discovery.

- `checkBrotherPrinterChannel({ port, channelInfo })` checks an explicitly selected
  or manually entered address without requiring discovery metadata. It returns a
  boolean and never discovers or switches to another printer. Native errors propagate.
  A successful check confirms connectivity, not the printer model or loaded paper.

```ts
import {
  searchBrotherPrinters,
  BRLMPrinterPort, BRLMPrinterModelName,
} from '@rdlabo/capacitor-brotherprint';

const printers = await searchBrotherPrinters(
  { port: BRLMPrinterPort.wifi, searchDuration: 10 },
  BRLMPrinterModelName.QL_820NWB,
);
```

Search, preparation and explicit connection checks share a queue. The next call begins after the previous
native operation and listener cleanup finish, even if the previous call failed. No JS
search timeout releases the queue early. Do not mix concurrent raw `BrotherPrint.search()`
or connection-check calls with these helpers: raw calls bypass this queue and native
events have no request ID. Printing also remains outside this queue; await connection
preparation before calling `printImage`.
The optional model filters non-USB results; USB results are retained even when the SDK
returns an empty model or address. Connection choices do not extend native support;
consult the existing README and SDK installation instructions.

When using the stateless functions, the app owns loading indicators, selection UI and caching. Pass its saved channel to
`prepareBrotherPrinters`, select a returned channel, and call the existing
`BrotherPrint.printImage()` with the selected port and address. The helper does not
retry printing. Store the chosen channel in the app for the next preparation.

Use `searchDuration: 3` for a short preliminary search or `10` for a normal search;
these are caller choices, not automatic retries. Cancellation through the existing
native methods affects the active search; it does not remove queued helper calls.
No controller instance or separate listener cleanup call is required.

See the [plain TypeScript print example](https://github.com/rdlabo-dev/capacitor-brotherprint/blob/main/examples/plain-typescript.ts).
In a source checkout, `npm test` tests the helpers and typechecks that example.


For a manually entered device, retain the selected port alongside its address. Do not
infer Bluetooth from punctuation: iOS Bluetooth uses a serial number and BLE uses
an SDK local name. Call `checkBrotherPrinterChannel` and print to that same channel
only if it is available. Use `prepareBrotherPrinters` for USB discovery/permissions.
The application supplies the model and label settings independently.

A screen can ignore a completed result after it closes. The helper still awaits native
completion and removes its listener. Periodic scanning intervals, screen cancellation
policy, known-device lists and preferred-device sorting remain application decisions.

See [design decisions](helper-design.md) for the practical scenarios behind these APIs.

## Screen lifetime

Use one `BrotherPrinterSession` for each print screen. Connection helpers use the Capacitor platform directly; the session owns discovery results, print notifications and disposal.
Do not reuse a disposed session. The stateless helpers remain available for
operations that do not have a screen lifetime.

```ts
import { BrotherPrinterSession, BRLMPrinterModelName, BRLMPrinterPort } from '@rdlabo/capacitor-brotherprint';

const session = new BrotherPrinterSession();
await session.listen({ onPrint: () => console.log('Printed') });
const printers = await session.prepare(
  { port: BRLMPrinterPort.wifi, searchDuration: 10 },
  BRLMPrinterModelName.QL_820NWB,
);
// Select a printer, then call session.printImage with the existing native options.
// In the screen's exit handler:
await session.dispose();
```

`closed` becomes true immediately on disposal and `printers` becomes empty.
Queued searches are skipped and late results are ignored. Print callbacks stop
immediately; disposal waits for this session's print listener handles to be removed,
including pending registrations. Active native discovery still finishes before
another connection operation starts. An already started native print is not aborted.
After asynchronous app work (image generation, storage or a dialog), check `closed`
before presenting UI. Calls to `search`, `prepare` and `printImage` on a closed
session do not start native work. No automatic print retry is added.

## Remembering a connection

Supply three callbacks to use localStorage, sessionStorage, Ionic Storage or another
string store. The plugin does not detect or depend on a storage implementation.

```ts
const session = new BrotherPrinterSession({
  storage: {
    get: (key) => localStorage.getItem(key),
    set: (key, value) => localStorage.setItem(key, value),
    remove: (key) => localStorage.removeItem(key),
  },
  storagePrefix: 'labels:',
});
```

For an asynchronous store, pass the same callbacks returning its promises:

```ts
const session = new BrotherPrinterSession({
  storage: {
    get: (key) => storage.get(key),
    set: (key, value) => storage.set(key, value),
    remove: (key) => storage.remove(key),
  },
});
```

`get` returns a string or null/undefined; callbacks may complete synchronously or
asynchronously. The session serializes connection metadata as JSON under
`${storagePrefix}last-printer` (default: `brotherprint:last-printer`). It never stores
images or font/paper settings. Use the same prefix across screens to reuse a connection.

`printImage` remembers the selected port, address and configured model before printing.
This remembers the attempted connection, not proof of print success. `prepare` loads
it when the third argument is omitted, checks matching model/port and availability,
and otherwise discovers. USB always discovers again. An explicit channel overrides
storage; passing `null` skips the saved connection. Storage read/write failures and
invalid saved JSON are ignored; native errors still propagate. Disposal during a
storage operation prevents subsequent native work.

`await session.clearSavedPrinter()` removes the remembered connection; removal errors
propagate so the app can report failure. Without storage callbacks, sessions keep only
screen-local state. Stateless helpers continue to accept app-managed previous channels.

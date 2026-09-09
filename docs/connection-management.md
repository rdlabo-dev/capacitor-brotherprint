# JavaScript printer helpers

These functions wrap the existing plugin API without changing native behavior.
They have no Angular or Ionic dependency and keep no state between calls.

- `brotherPrinterPorts(model, isAndroid)` returns connection choices for an existing
  model enum. USB is Android-only. `wifi` also covers wired Ethernet.
- `brotherPrinterModel(name)` matches a discovery name to the existing model enum,
  including product aliases such as QL-820NWBc. Unknown names return `undefined`.
- `searchBrotherPrinters(options, model?)` collects discovery events into an
  array. It registers its listener before searching and removes it when the search
  succeeds or fails. No results returns an empty array; native errors propagate.

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

Run one search at a time. Native discovery events are shared and have no request ID.
The optional model filters non-USB results; USB results are retained even when the SDK
returns an empty model or address. Connection choices do not extend native support;
consult the existing README and SDK installation instructions.

The app owns loading indicators, selection UI and caching. Use the existing
`BrotherPrint.isChannelAvailable()` to check a saved channel and
`BrotherPrint.printImage()` to print with the selected port and address. Cancel a
search through the existing native cancellation methods when needed. No controller
instance or separate listener cleanup call is required.

See the [plain TypeScript print example](https://github.com/rdlabo-dev/capacitor-brotherprint/blob/main/examples/plain-typescript.ts).
In a source checkout, `npm test` tests the helpers and typechecks that example.

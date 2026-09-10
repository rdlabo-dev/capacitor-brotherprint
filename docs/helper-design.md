# Design decisions

These helpers extract recurring connection work from label-printing applications.
They use the plugin bundled in this package and keep the existing native contract.

## Responsibility boundaries

| Observed application work | Shared behavior | Application responsibility |
| --- | --- | --- |
| Screens repeat platform and model connection checks | Read the Capacitor platform, filter supported ports and resolve the saved/default connection | Present connection choices |
| A second scan arrives while the first is running | Serialize helper calls until native completion and listener removal; recover after failure | Choose when to scan and present loading UI |
| A remembered network printer may have disconnected | Check a matching previous channel and rediscover if unavailable | Supply storage callbacks and decide whether fallback is appropriate |
| A printer is entered manually rather than discovered | Check an explicit port/address without discovery metadata or fallback | Supply the real model, choose the port and handle unavailable results |
| Discovery events repeat or use product-name aliases | Collect results and match existing model enums | Choose one printer or cancel the selection |
| Screens attach listeners and later close | A session owns results, print listeners and a terminal closed state; skip queued native work and discard late results | Create one session per screen, dispose on exit, and check `closed` before showing UI after asynchronous image generation |

## A reusable candidate versus an explicit destination

The distinction between preparation and explicit checking is intentional. A previous
printer is a convenience that may fall back to discovery. An explicitly chosen address
is a destination: a failed check must not silently choose a different printer.

## Serialize until native completion

Actual application code used both short preliminary scans and longer user-requested
scans, so duration remains an explicit native search option. Fixed JavaScript timers
are not used to infer SDK completion. Multiple ports can be searched by awaiting one
helper call after another; no automatic scan schedule or transport inference is added.

## Application policy

Selection dialogs, storage implementation, hidden-device lists, analytics, image generation,
fonts, label layouts and user-facing messages belong to applications. Native SDK
changes and automatic print retries are not part of these helpers. Existing native
errors and availability results are preserved rather than reclassified.

## Separate screen disposal from native completion

`BrotherPrinterSession` is the stateful boundary for a print screen. It shares the
same native connection queue as the stateless helpers, so creating a new screen
cannot overlap a previous screen's unfinished discovery. Disposal does not claim
to abort a native operation: an active search completes and removes its listener;
an already started print continues. `dispose()` waits for print listener removal, not for discovery or printing to finish. Await the `printImage()` promise separately when the caller needs to wait for printing. The application does not need its own
search queue, listener list or cancellation generation counter.

## Application-supplied storage

Optional session storage owns connection keys and JSON serialization through `get`,
`set` and `remove` callbacks. Applications supply the store; printer preparation and
remembering the selected destination do not need separate app persistence code.

For usage and code examples, see [JavaScript printer helpers](/docs/connection-management).

## What the tests establish

The tests exercise these connection flows through the built package using Node's
standard test runner. They do not establish physical printer compatibility or model
identity from an availability check.

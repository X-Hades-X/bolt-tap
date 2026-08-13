# Bolt Tap

A stateless Lightning wallet for Bolt Cards. Tap NFC, scan QR, print stickers.
*(Project codename during development was "Bolt Card Wallet" — released as Bolt Tap.)*

## What it does

1. **Tap a Bolt Card** (or scan QR / paste from clipboard)
2. **See limits and options** — withdraw/send, receive/pay, min/max amounts
3. **Enter an amount**, confirm with the card PIN when required (LUD-24-style)
4. **Get an invoice or printable voucher QR** — pay by tapping the card, or
   print it on a Niimbot label printer over BLE

No keys stored. No balances tracked. The app is just a bridge between
Bolt Cards and Lightning: every secret (k1) lives on the card and is only
passed through, wrapped in working memory, never persisted.

## ⚠️ Alpha status — read before using

- This is alpha software. **It moves real sats.** Test with small amounts only.
- A "Send" voucher is a **bearer instrument**: the printed QR *is* the money.
  Anyone who scans it can redeem it.
- Fully featured against a specific backend (see below). Stock LNbits works
  too — presigned vouchers just fall back to plain pay-from-card there.
- Android first. An iOS build is untested.
- Use at your own risk — see the [LICENSE](LICENSE).

## Backend requirement

Bolt Tap speaks LNURL to cards created on LNbits, via the
[**LNbits boltcards fork**, branch `feature/pin_presign`](https://github.com/X-Hades-X/boltcards/tree/feature/pin_presign),
which adds PIN columns, PIN validation in the
withdraw callback, and the presign-voucher endpoint that powers the clean
Send flow (enter amount → get a printable voucher).

**Not on that fork?** Stock LNbits works as well — the app asks for the
extension, sees the plain "missing payment request" answer, and silently
continues as normal LUD-03/LUD-24 pay-from-card (invoice on screen, tap the
card, PIN if the card demands it). Presigned vouchers simply aren't
available there; everything else is.

Developer note: the presign `amount` callback parameter is a fork extension
(LUD-03/LUD-24 define no such parameter) and carries **msat** — the same
denomination LNURLcash (luds PR #301) defines for `amount`. Client and
backend must agree on this or vouchers are off by 1000×.

Cards must be created/programmed on that backend (e.g. with common
Bolt Card tooling such as the
[Bolt Card NFC Programmer](https://github.com/boltcard/bolt-nfc-android-app)).

## Built with

- [Angular 20](https://angular.dev) (standalone components) + [Ionic 8](https://ionicframework.com) + [Capacitor 7](https://capacitorjs.com)
- NFC via `@exxili/capacitor-nfc`
- BLE label printing (Niimbot) via `@mmote/niimbluelib`
- bolt11 decoding via `light-bolt11-decoder`, QR via `qrcode`

## Install the app (testers)

1. Grab the APK from this repository's **Releases** page:
   `bolt-tap.apk` for most users (zero Bluetooth),
   `bolt-tap-printer.apk` if you own a Niimbot label printer.
2. Copy it to an Android phone with NFC and allow "install unknown apps"
   for your file manager/browser.
3. Open **Bolt Tap**, tap your Bolt Card.

Optional (printer APK): pair a Niimbot D110 (or compatible) label printer
in the app (Settings → Printer) to print invoice/voucher stickers.

## Build from source

Prerequisites: **Node 20+** (CI builds on 24), **JDK 21** (Gradle 8.11 rejects newer JDKs — set
`JAVA_HOME` accordingly or pin it in `~/.gradle/gradle.properties`),
Android SDK 35.

```bash
npm ci
npm test -- --watch=false --browsers=ChromeHeadless   # 121 unit tests
npm run lint
npm run build          # production web bundle
npx cap sync           # copy web bundle into dist/android/...
cd android && ./gradlew assembleDebug                 # APK in app/build/outputs/apk/debug/
```

Signed release builds are optional: drop an `android/keystore.properties`
(gitignored) with `storeFile`/`storePassword`/`keyAlias`/`keyPassword` next
to `android/gradle.properties` and `./gradlew assembleRelease` picks it up
automatically. Without it, release APKs simply come out unsigned.

### Build variants: standard (zero Bluetooth) and printer

Every release ships two APKs:

| APK | Bluetooth | Printer support |
|---|---|---|
| `bolt-tap.apk` (**standard**) | **none** — no BLE libraries, no `BLUETOOTH*`/`ACCESS_FINE_LOCATION` permissions | buttons hidden |
| `bolt-tap-printer.apk` | yes | yes |

The conservative build is the default: likely 99% of interest, and a money
app should ask for as few permissions as it can. Printer owners opt in with
the `-printer` APK, which is the superset build.

The standard (a.k.a. `noble`) variant is produced by
`src/environments/environment.noble.ts` (hides printer UI) plus two
API-identical stubs swapped in by Angular `fileReplacements`
(`src/services/ble.service.stub.ts`,
`print-preview.stub.component.ts`), while CI removes the BLE npm packages
before `cap sync` and strips the Bluetooth permissions from the manifest.
Build it locally with `npx ng build --configuration=noble` (deps installed),
the printer/full one with `ng build` (production config).

CI (`.github/workflows/android.yml`) runs lint + tests + a debug build of
both variants on every push/PR, and drafts a GitHub release with both APKs
when a `v*` tag is pushed (signed if the keystore secrets are configured).

## Project structure

```
src/
├── app/
│   ├── app.component.ts / app.routes.ts
│   ├── layout/tabs/                    # Tab navigation
│   ├── features/
│   │   ├── wallet/
│   │   │   ├── pages/
│   │   │   │   ├── wallet-page/        # Home: NFC scan, clipboard paste
│   │   │   │   ├── wallet-details-page/# Card limits + Receive/Send
│   │   │   │   ├── amount-page/        # Numpad amount entry + PIN prompt
│   │   │   │   └── invoice-page/       # QR display, tap-to-pay, print
│   │   │   └── components/
│   │   │       ├── nfc-scanner/        # Tap animation + NFC enable flow
│   │   │       └── pin-dialog/         # Bottom-sheet PIN (4 dots, numpad)
│   │   └── settings/pages/settings-page/
│   └── shared/
│       ├── components/ (numpad, print-preview, info-sheet)
│       ├── pipes/ (sats-format)
│       └── utils/ (units: msat <-> sats, the only conversion site)
├── services/
│   ├── lnurl.service.ts               # LNURL state machine (subjects)
│   ├── nfc.service.ts
│   ├── ble.service.ts                 # Niimbot BLE printing
│   └── global-error-handler.ts        # sanitizes anything that escapes
└── model/lnurl.model.ts
```

### Conventions that matter

- **Users see sats, wire talks msat.** Conversion happens only via
  `msatToSats`/`satsToMsat` in `shared/utils/units.ts`. Every amount the
  client emits on the wire is msat; UI input/display is sats. No exceptions.
- PIN is never stored — entered via the in-app numpad, passed to the
  callback, dropped.
- Errors shown to users must never contain URLs (they may carry k1/PIN).

## Contributing

Issues and PRs are welcome — this is an alpha and rough edges are expected.
CI must be green (`npm run lint`, unit tests). Please keep the conventions
above, and put specs next to the file you change (services mock HTTP with
`HttpTestingController`, components mock `LnurlService` with BehaviorSubjects).

Known dev-toolchain noise (`npm audit` advisories in `@babel/core`,
`webpack-dev-server`, `sharp`/libvips) only affects dev-time tools; none of
it ships in the APK.

## Acknowledgments

Bolt Tap was heavily inspired by
[**boltcard-tools-terminal**](https://github.com/SwissBitcoinPay/boltcard-tools-terminal)
by Swiss Bitcoin Pay (MIT). I contributed there, but with development
stalled (one of my PRs open for over a year) and the features I wanted
having no chance to land, I built my own thing.

Niimbot label printing was made possible by
[`@mmote/niimbluelib`](https://www.npmjs.com/package/@mmote/niimbluelib) —
a reverse-engineered implementation of Niimbot's BLE protocol. I genuinely
did not know it was possible until I found that.

### A note on authorship (LLM transparency)

This codebase was architected by a human and substantially written with
LLM assistance — less typing, more thinking. The maintainer has read and
accepted everything that went in; behavior is guarded by tests. It doesn't
matter whether blood or energy pumps through the producer's veins — if
the code works and is readable, that's what counts here.

## License

[MIT](LICENSE) — © Hades ([elysiumno.de](https://elysiumno.de/)).
Third-party licenses are listed in `third-party-licenses.txt`.

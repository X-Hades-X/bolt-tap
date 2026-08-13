# Agent Instructions

## Ground Rules

### Code Quality & Linting

1. **Ignore TODO comment warnings** - When asked to "clean up", do not remove or modify `// TODO` comments to satisfy SonarQube or other linting tools. These comments are intentional markers for future work.

## What this is

Stateless Lightning wallet for Bolt Cards (Ionic 8 + Angular 20 standalone + Capacitor 7). Tap NFC card → see limits → enter amount → get invoice/voucher QR → print it (Niimbot BLE) or tap card to pay. No keys, no balances.

**Naming**: the released product is **Bolt Tap** (public repo `X-Hades-X/bolt-tap`, npm name `bolt-tap`). "Bolt Card Wallet" was only the development codename (local dir `boltcard-wallet`); don't use it in UI/prose.

Backend is the owner's [**LNbits boltcards fork**, branch `feature/pin_presign`](https://github.com/X-Hades-X/boltcards/tree/feature/pin_presign) (adds PIN columns, PIN validation in `lnurl_callback`, and the presign-voucher endpoint behavior described below). Note: upstream `lnbits/boltcards` has no such branch — always link the fork.

## Critical conventions — read before touching logic

### Units: users see sats, msat is internal only

- LNURL protocol fields (`minWithdrawable`, `maxWithdrawable`, `pinLimit`, bolt11 amounts) are **msat**. Convert ONLY via `msatToSats`/`satsToMsat` (`src/app/shared/utils/units.ts`) — never inline `* 1000` or `/ 1000`.
- Display sats with the `SatsFormatPipe` (`satsFormat`) → space thousands separator (`5 000`). Do not use locale formatting.
- **Every amount the client emits on the wire is msat; UI input/display is sats. No exceptions.** `amountSats` params are sats at the app boundary; `satsToMsat` runs at the wire in both `getPayRequest` (LUD-06) and `getWithdrawRequest`. Never send sats to a callback.
- The presign-voucher `amount` callback param is a fork extension — LUD-03/LUD-24 define no such param (the voucher = a new withdrawRequest with `min == max == amount`, **no pinLimit**: bearer voucher, printable, redeemable without PIN). It carries **msat**, the same denomination LNURLcash (luds PR #301) defines for `amount`. The backend converts to sats internally for its `pin_limit` (sats DB column) comparison.
- **Coordination: backend must read `amount` as msat — it was sats before; ship both sides together or vouchers are off by 1000×.**
- PIN thresholds compare in msat on this side: `satsToMsat(amountSats) >= pinLimit` (presign) and bolt11 `amountMsat >= pinLimit` (invoice pay).

### Build variants (full / noble)

CI builds two APKs: **`bolt-tap.apk` is the STANDARD** (the zero-Bluetooth "noble" variant — no BLE deps/permissions; this deliberately IS the default) and `bolt-tap-printer.apk` (the full/printer build). The noble build works via an Angular `noble` configuration whose `fileReplacements` swap in `src/services/ble.service.stub.ts` and `print-preview.stub.component.ts`, plus `environment.noble.ts` (`printer: false` hides printer UI). **All imports of `@capacitor-community/bluetooth-le` and `@mmote/niimbluelib` must stay confined to `src/services/ble.service.ts` and `print-preview.component.ts`** so the stub swap compiles cleanly with those packages removed. If `BleService`'s API changes, update `ble.service.stub.ts` or the noble CI job breaks. New printer features belong behind that seam, gated on `environment.printer`.

### Payment flows (three paths)

1. **Presign voucher (Send, fork backend)**: amount page → if `amount*1000 >= pinLimit` → PIN bottom sheet → `fetchInvoice(data, undefined, amountSats, pin)` → backend returns `{lnurl, status}` → invoice page shows QR → print, or tap card to redeem voucher back onto it.
2. **Presign fallback (stock backend)**: same attempt, server answers `{status:'ERROR', reason:'Missing payment request.'}` (upstream `views_lnurl.py`; extra params ignored, hit stays unspent) → NOT an error: `handlePresignUnsupported` stores `redeemContext {amountMsat, pin}` and emits the tapped card's own lnurl as the artifact. Invoice page shows the **entered amount** (`redeemAmountMsat` override, not minWithdrawable). Redeemer taps a card → its `payLink`/lnurlp invoices that amount → callback pays with `k1` **and the PIN entered earlier** (no second prompt). **Rule: the amount that moves is the amount on screen — never silently substitute `minWithdrawable`.**
   - **Fallback mode is tap-only (`isPresignFallback`)**: no QR**, no print, no copy — the artifact is the owner's raw lnurlw (full-range wallet access; a usable voucher QR would even need the PIN leaked). Never render it as a QR. Fork presign vouchers are real bearer artifacts → keep their QR/print. Distinguishing signal: `redeemContext` set ⇔ fallback.
   - **The fallback artifact is the tapped card's RESOLVED DATA (`fetchInvoice`'s `data`), never its lnurl string**: the lnurlw link is a one-shot credential (upstream `api_scan` consumes the SUN counter on scan) — re-resolving it returns `{status:'ERROR', reason:'This link is already used.'}`, which once disguised itself as "1 sat top-up" (payRequest shape) and "Expected withdraw request to pay invoice" at redeem time. The invoice page shows the entered amount straight from stored data without any network call; `redeemWithdrawRequest` is shared by voucher and fallback redemption.
   - **Wrong-PIN retry in fallback**: the PIN is validated late at the paying callback (fork answers `{reason: 'Wrong Pin. N tries left.'}`). The invoice page's result overlay then swaps "Try Again" for "Enter PIN again" → `navigateBack` to the amount page: its digits + `_lnurl` card data survive in the stack (`resetAllData` fires on leave but doesn't touch component state), so Send re-asks for the PIN and `fetchInvoice` rebuilds the fallback with it updated. Only applies to the fallback — presign-enabled flows validate the PIN up front at fork Send time and never reach this.
   - **Settings toggle `presignEnabled`** (`SettingsService`, localStorage, **default off**) skips the probe entirely — `fetchInvoice` short-circuits into the same fallback without a network round-trip. Only fork owners enable it. Service specs inject a mutable `{presignEnabled: true}` mock so legacy probe tests stay untouched.
3. **Pay invoice (bolt11)**: paste/scan invoice → invoice page → tap card → if `amountMsat >= pinLimit` → PIN bottom sheet (via `pinRequest$`) → `confirmPin` → `executePayment` → result overlay.

`parseLnurl` returns `'invoice' | 'lnurl'` — invoices navigate themselves to the invoice page; callers (`wallet-page.readClipboard`, `tabs.startScan`) only navigate to details for `'lnurl'`. Don't navigate unconditionally after calling it (that bug existed and stomped invoice navigation). The `lnbc` check must stay **before** the `lnurl` substring check (bolt11 bech32 data can contain `lnurl`; LNURL bech32 can never contain `lnbc`).

### Deep links (card taps / links that launch the app)

`AndroidManifest.xml` intent filters make Android suggest Bolt Tap for Bolt Card taps (`NDEF_DISCOVERED` with `lnurlw`/`lnurlp` URI records) and for `lnurlw`/`lnurlp`/`lightning` links (`ACTION_VIEW`). Handling lives in `DeepLinkService` (`init()` once from `AppComponent` after `platform.ready()`):

- Warm-start **link** taps → `@capacitor/app` `appUrlOpen`. The App plugin only fires it for `ACTION_VIEW`, so NFC tag taps (handled by the NFC plugin's `onRead` path) never double-fire here.
- Warm-start **tag** taps → existing `NfcService.onRead` path (manifest filter delivers `NDEF_DISCOVERED` to `onNewIntent`); `DeepLinkService` is not involved.
- Cold-start **tag** taps → the NFC plugin's event fires before the WebView loads and is lost; `App.getLaunchUrl()` is the only way in.
- Cold-start **link** taps arrive BOTH as a retained `appUrlOpen` replay and via `getLaunchUrl()` → dedup: identical URL within 5 s is ignored.
- Capacitor `registerPlugin` proxies (`App`, `Clipboard`, …) can't be spied in specs — keep the plugin-touching wrapper seams (`registerUrlListener`/`readLaunchUrl`) spyable methods.

The activity is locked to portrait (`android:screenOrientation="portrait"` on `MainActivity`) — the app is portrait-only by design.

### LnurlService subjects

`lnurlWithdraw$` / `lnurlPay$` (card data for details page), `lnurlInvoice$` (selected request for amount page), `invoiceInvoice$` (invoice/voucher for invoice page), `paymentStatus$` (drives the full-screen result overlay), `pinRequest$` (opens PIN sheet), `processing$` (spinner at tap time), `lnurlError$` (details page error+retry). `fetchInvoice` returns an Observable — callers must subscribe; `{status:'ERROR'}` responses are mapped to thrown errors with the server `reason`. Internal (non-observable) state: `lastCardLnurl` (raw lnurl of last tap, needed by the fallback) and `redeemContext {amountMsat, pin}` (presign-fallback carry-over) — both cleared by `resetAllData`.

## Build / test / deploy

```bash
ng test --watch=false --browsers=ChromeHeadless   # Karma/Jasmine, specs next to sources
ng lint
npm run sync                                       # ng build + cap sync
cd android; .\gradlew.bat installDebug             # deploys to connected phone
adb shell am start -n io.ionic.starter/.MainActivity
```

- **JDK**: Gradle 8.11 rejects newer JDKs (e.g. Java 25: "Unsupported class file major version 69"), so builds require **JDK 21**. The repo deliberately does NOT pin `org.gradle.java.home` (machine-specific paths leaked a username and broke other machines) — pin it per machine in `~/.gradle/gradle.properties` or use `JAVA_HOME`. CI uses `actions/setup-java` with temurin 21.
- **Package ID is `io.ionic.starter`** (Android `applicationId`). `capacitor.config.ts` says `de.elysiumno.boltcardwallet`; they intentionally do NOT match (a rename was tried and reverted). Leave both as-is.
- Pre-existing noise, safe to ignore: CommonJS warnings (`qrcode`, `bech32`, `light-bolt11-decoder`), Kotlin warnings from `@capacitor-community/bluetooth-le`.

## Design system

- Tokens in `src/theme/variables.scss`: `--app-bg #2f3542`, `--app-surface`, `--app-orange #f7931a`, `--app-yellow #ffd930`, `--app-red`, `--app-green`, `--app-text(-dim)`.
- One shared button style: `.app-button` in `global.scss` (full-width rounded orange; `--ghost` variant). Use it everywhere — **except** the wallet-details page, which intentionally has large round side-by-side Receive/Send buttons (owner's explicit preference, don't unify them away).
- `NumpadComponent` (`shared/components/numpad`) — custom round keypad, event-emitting only; used by amount page and PIN dialog. No native inputs for amounts/PIN (password-manager prompts are unwanted).
- PIN entry = bottom-sheet modal (`breakpoints [0, 0.75]`, `cssClass: 'pin-sheet-modal'`), 4 dots, auto-submits on 4th digit.
- `InfoSheetComponent` (`shared/components/info-sheet`) — the single popup language: auto-height bottom-anchored modal (`cssClass: 'info-sheet-modal'`; **no breakpoints/drag handle** — oversized content scrolls inside) with title + headed text sections + role-dismissing buttons (default: one ghost Close; callers act on the `onWillDismiss` role). Used for the settings explanations and all print feedback/prompts — no ion-alert anywhere. Shared copy lives in `info-sheet.presets.ts` (`PRESIGN_INFO`/`PRINTER_INFO`); first activation of a feature force-shows its sheet once (`SettingsService` `presignInfoSeen`/`printerInfoSeen` flags; manual opens also mark seen). Keep the sheet BLE-free so the noble build is unaffected.
- Result screens: full-screen overlay in invoice page (green success / dark+red failure), not ion-alert.

## Workflow expectations

- Commit checkpoints as work completes (the owner wants visible progress commits, e.g. per feature/fix). This branch is the public `main` on GitHub (X-Hades-X) — kept alpha-quality; day-to-day development may live elsewhere and be merged in.
- When changing flows, update the specs next to the changed files; service specs mock HTTP with `HttpTestingController`, component specs mock `LnurlService` with BehaviorSubjects. CI (`.github/workflows/android.yml`, matrix full+noble) runs lint + tests + debug build of both variants on every PR; `v*` tags draft a release with both APKs.

# Integrated QR scanner

Signed-in users can open **Scan QR code** immediately to the left of the mobile menu, or beside the desktop sidebar branding. The scanner is an overlay: the underlying record stays in place until a recognized, accessible record opens. Plant labels open the plant instance, location labels open the location, and a scan never records care or uploads a photograph. Quick Care remains available after navigation.

Point the rear camera toward one label. A validated collection-scoped label opens its route immediately, without confirmation or a redundant lookup; that route performs its normal authorization. Exact IDs and unscoped legacy labels still use the authorized resolver. Scanning the current record simply closes the overlay with acknowledgment. Switching to another accessible collection follows the existing collection-scoped URL convention. The lookup resolver keeps inaccessible/missing records indistinguishable. Direct links use the normal login, collection-access or not-found screen. Archived specimens remain readable with their existing lifecycle restrictions; archived collections remain unavailable.

The camera fills a tall mobile preview with proportional cropping. Flashlight, switching, Photo and manual entry share one compact toolbar; privacy/permission help is behind the information button. **Restart camera** appears only after an error or interruption. After a short unsuccessful scan, a restrained hold-steady/distance hint appears. **Photo** reads a JPEG, PNG, WebP or GIF entirely on the device. A photo containing several recognized labels offers a choice; it never chooses an arbitrary destination. **Enter accession ID manually** accepts an exact accession ID or location code. If more than one accessible collection has that identifier, choose the matching record. This is exact lookup, not fuzzy search or autocomplete.

## Permissions, privacy and troubleshooting

Camera access is requested only when the scanner opens or camera restart/switch is chosen. Decoder code is prewarmed on launcher focus/pointer intent, and camera startup runs in parallel with decoder loading. The selected device ID is remembered as a preference, never as proof of authorization. Browser/OS permission persistence cannot be forced, and streams are not kept alive to avoid prompts. It requests video only, preferably the environmental camera. Camera capture requires a secure browser context: use the HTTPS application address rather than an insecure LAN HTTP address. If access was denied, allow Camera for the application in browser/site settings, then retry; Photo and manual lookup remain available without camera permission. Camera-in-use and disconnected-camera errors offer retry and the same alternatives.

Flashlight and camera switching are capability-dependent. Neither is required for scanning. Torch constraints may be unavailable on iPhone Safari or an installed PWA even when another camera app supports the light. The flashlight stops with its camera track.

Camera frames and selected images are not sent to AxilDB, an AI service or an external decoding service. Only decoded text requiring identifier/legacy resolution is posted to the authenticated record resolver; validated scoped links navigate directly. Payloads are held in the open dialog’s memory for retry/selection, then released; no scan history or new care/audit record is created. Existing server access logs still apply.

Photo input is limited to 15 MB, 24 megapixels and a 12,000 px maximum side. Supported headers are inspected before browser decompression, processing uses a maximum 1,600 px canvas side, and photo scanning is bounded to eight distinct payloads / 24 decode attempts. Crop dense multi-label sheets or unusually large photographs. HEIC/AVIF/TIFF scanning is not included; export a JPEG/PNG. These are scanner-only limits and do not change plant photo uploads.

## Existing printed labels and trusted origins

Current instance QR images, single-label previews and bulk plant/location PDFs all share `recordQrUrl`; the payload bytes are unchanged:

- `https://<application-origin>/c/<collection>/instances/<database-id>`
- `https://<application-origin>/c/<collection>/locations/<database-id>`

The initial pre-collection generator was also checked in Git history: it used `/instances/<database-id>`. The scanner accepts that unscoped route, plus unscoped `/locations/<id>` and optional legacy `?collection=<slug>`. Relative forms, valid percent encoding, surrounding whitespace and a trailing slash are accepted. Query strings/fragments never become navigation instructions. URL path IDs resolve only as database IDs, preventing accidental fallback to a different accession. Bare exact accession/location IDs are also supported; identifiers are never case-folded or typographically rewritten.

Origins are matched exactly against the current, validated request origin and configured `NEXT_PUBLIC_APP_URL`. A label from an unrelated site is not trusted merely because its path resembles an AxilDB route. If the deployment moved origins, optionally set:

```dotenv
AXILDB_QR_TRUSTED_ORIGINS=https://old.example.com,https://previous.example.com
```

Use exact origins including a nonstandard port where applicable; no wildcards, credentials, paths or URL schemes other than HTTP(S). Only allow origins whose label identifiers should map to this database. The app’s existing env-file mechanism can supply this optional setting; recreate the application container after changing its environment. Ordinary same-origin deployments require no new configuration or host changes.

## Architecture and resource limits

- `SidebarClient` owns one lazy scanner overlay shared by both entry points. Its session is bound to pathname, collection and signed-in identity, so shell navigation/unmount invalidates the old session immediately.
- `QrScanner` uses a native modal dialog with focus restoration, Escape handling, scroll locking, safe-area padding, theme tokens, status messages and 44 px controls. Manual lookup remains keyboard-accessible. Frame attempts are not announced individually.
- `QrCamera` owns one stream, one reusable canvas and one throttled timer. Video is muted, inline and rear-camera preferred. Visible cover-crop, central-detail and whole-visible-view fallback frames are scaled to a maximum 1,280 px working side, decoded serially with an adaptive target of roughly 10–12 attempts/second on fast devices, with no queue or per-frame React state. Slow processing automatically reduces the attempt rate. A bounded normalization/sharpening pass runs only after misses; contrast recovery is tested on low-contrast labels. No worker is necessary at the measured fixture workload.
- Close, route/collection/identity changes, camera replacement and unmount stop every track, clear `srcObject`, cancel the timer and release the canvas. Visibility/pagehide stop capture; visibility return or persisted pageshow resumes only a still-requested camera. Late permission results are stopped immediately. Torch changes are guarded against overlap.
- A synchronous busy guard permits one record resolution; request abortion and generation checks reject late responses after close, background or a new operation. Invalid-code processing pauses capture until explicit restart. Network retry reuses the decoded payload, not camera imagery.
- `parseQrPayload` allows only explicit resource routes and bounded identifier forms. It rejects foreign origins, credentials, schemes, path traversal, encoded slashes, malformed encoding, controls and oversized payloads. Server resolution repeats validation, scopes database reads to viewable active collections, bounds results, uses existing collection-view authorization (including server-admin two-factor checks), and constructs canonical internal paths for identifier/unscoped lookup. Validated scoped URLs can construct their own canonical internal path and rely on fresh authorization at the destination instead of issuing a resolver POST first. The resolver returns the same error for missing and private records. Direct links retain the destination’s normal authorization and not-found handling. Origin checks prevent cross-site resolver requests.

## Decoder dependency and PWA boundary

The pinned **jsQR 1.4.0** dependency is a small QR-specific TypeScript-compatible decoder with no production dependencies, licensed Apache-2.0. It is imported only through the scanner’s lazy decoder module; no CDN or service is involved. It works with ordinary canvas pixel data and does not depend on native `BarcodeDetector`. Black-on-white live labels use the cheaper non-inverted path; photos also attempt inverted symbols and bounded overlapping regions for multi-code selection. See the [upstream API](https://github.com/cozmo/jsQR) and the [distributed license](../public/licenses/jsqr.txt).

The existing PWA manifest retains its identity, standalone mode and `/` scope, which includes every destination. Navigation uses `router.push`, never `window.open` or an external URL, preserving the installed application context by design. The existing service worker does not cache scanner frames or resolver responses. No Caddy/Next camera-denial or CSP rule was present; no security headers were weakened. The camera uses the existing self-origin permission policy. Inline video and secure-context requirements follow the [browser media-capture API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

## Verification and release

Run `npm run check:qr-scanner` for payload, generated-symbol, photo and camera-controller fixtures. Database/browser tests require the guarded disposable database at `localhost:55444/axildb_qr`; use `check:qr-scanner:db` and `check:qr-scanner:ui`. They must never target production.

[The latest implementation review](audits/qr-refinement-2026-11-20/README.md) contains screenshots, resource observations, executed checks and the physical-device verification matrix. Desktop mock cameras and viewport emulation do not certify physical iOS/Android camera behavior. Test iPhone Safari and the installed PWA before depending on the scanner during a collection round, especially permission persistence, torch support and interruption recovery.

Deploy this refinement through Web deployment. It retains the existing jsQR dependency and lockfile; there is no schema migration, mandatory environment setting, host configuration change, QR reprint or PWA identity change.

## Local performance diagnostics

For development builds, stage timing is enabled by default. For a production-device investigation, opt in locally in the browser console:

```js
localStorage.setItem('axildb-qr-debug', '1')
// After scanning:
window.__axildbQrTimings
```

The bounded list keeps at most 30 sessions, with timestamps for button activation, mount, permission request, stream acquisition, video readiness, decoder readiness, first decode, recognition, validation, optional lookup start/end, navigation start and destination render. Missing stages indicate a cancelled/incomplete session or an intentionally skipped lookup. Timings use the browser performance clock; they contain no frames, payloads, record IDs, routes or device IDs and are never sent anywhere. Disable by removing the storage key and reloading. Native permission-prompt/human response time is distinct from ready-camera recognition time.

WebKit has [reported permission-persistence issues](https://bugs.webkit.org/show_bug.cgi?id=280394) in Home Screen apps. The implementation follows actual `getUserMedia` behavior; it does not use a saved permission boolean, global website permission changes, hidden streams or an iframe workaround. Persistent permission and close-range focus remain physical-device checks.

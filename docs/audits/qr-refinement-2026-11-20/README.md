# QR scanner refinement — November 20, 2026

## Implemented behavior

The scanner now emphasizes a tall, filled camera preview and one compact toolbar. It starts the camera and prepares the decoder concurrently, prewarms code on launcher intent, remembers the selected camera, and decodes serially with an adaptive loop. Validated collection-scoped labels begin internal navigation immediately; identifier and legacy-label lookup retain the authenticated resolver. Destination routes still authorize access. Deleted records now render the standard not-found screen instead of a database exception.

No QR payload, stored identity, label format, schema, dependency, lockfile, PWA identity or host configuration changed. Deploy through **Web deployment**.

## What the recording established

The supplied 26-second, 512 × 1112 recording shows a portrait camera squeezed into a landscape viewport, large black sidebars, multiple rows of secondary controls and delayed recognition. It does not isolate sensor focus, decoder failure, network delay or route rendering. The recording was reviewed locally; no private frames are included here.

Repository inspection found several avoidable costs: decoder preparation before camera startup, optional device enumeration before decoding, approximately six attempts/second with processing time added to the interval, and a resolver POST before opening an already complete scoped URL. These costs have been removed or reduced. They do **not** establish a complete explanation for the physical label’s long delay. Replaying cropped, compressed recording frames did not demonstrate earlier recognition with the new recovery path; exported video is not a substitute for the original camera pixels.

## Performance evidence

Production Next build, local PostgreSQL fixture database, Playwright Chromium, synthetic canvas camera, identical generated labels. These are controlled desktop results, not iPhone/Android benchmarks or a guarantee about permission prompts, autofocus, physical print quality or WAN navigation.

| Measurement | Before | After |
| --- | --- | --- |
| Clear label appearing in an already-running camera → overlay closed, 10 runs | median 233.8 ms; range 180.0–285.7 ms | median 181.1 ms; range 179.6–181.7 ms |
| Label appearing → recognized, local diagnostic timestamps, 10 runs | not instrumented | median 154.5 ms; range 151.5–158.0 ms |
| Preliminary resolver POSTs, those 10 scoped scans | 10 | 0 |
| Repeated scan cycles in one browser | not measured | 40; 4.37 s; zero resolver POSTs |
| Maximum simultaneous streams / active streams after closing | not measured | 1 / 0 |
| End-of-stress browser heap snapshot | not measured | 24.3 MB |

The matched overlay observation is about 23% faster at the median. It includes Playwright polling overhead and is not a pure decoding measurement. Earlier commentary incorrectly described a slower baseline observation as the median; the table and raw samples are authoritative. The <3-second user target is met for these clear synthetic labels, while physical recognition remains to be verified.

One real cross-route synthetic scan recorded these relative stage durations:

| Stage | Duration |
| --- | --- |
| Launcher activation → dialog mounted | 303.1 ms |
| Permission request → stream acquired, mocked immediate grant | 3.3 ms |
| Stream acquired → usable video | 16.4 ms |
| Video ready → first decode | 2.7 ms |
| Video ready → recognized | 15.8 ms |
| Recognized → validated / navigation initiated | 0.5 ms |
| Navigation initiated → destination render effect | 49.7 ms |
| Launcher activation → destination render effect | 397.2 ms |

Route-render timing observes the client route effect, not completion of every image or browser paint. Permission waiting must be evaluated separately on a real device. Raw, payload-free results: [before](before-results.json), [after](after-results.json). Diagnostics retain only a bounded local list of timestamps, are off by default in production, and never transmit frames, IDs, routes or payloads.

The stress fixture observed no new frame reads after closing, no surviving streams and no overlapping capture. Its heap snapshot is not a garbage-collection or leak proof. OS CPU utilization and physical-device thermal/battery behavior were not measured. The loop bounds processing duty with one timer and no concurrent decode; expensive contrast recovery runs only after misses. No CPU percentage claim is made.

## Camera and decoder choices

Retain the pinned portable jsQR 1.4.0 decoder rather than introducing another library without evidence of benefit. Reuse its lazy module, one canvas and serialized decoding. Request video only, with ideal 1280 × 720 / 24 fps, rear-camera preference and no mandatory resolution constraints. The ordinary visible-view pass is capped at 960 px; detail/recovery passes at 1280 px. Small generated labels at 256/360 px and default generated sizes, rotated and JPEG fixtures remain readable. These tests do not establish an optimal physical capture resolution; compare camera settings on the target iPhone if clear labels still take several seconds.

Fast devices target roughly 12 attempts/second, subtracting work time instead of adding a fixed post-work delay. Slower devices receive additional breathing room. Every third miss can use bounded luminance normalization and mild sharpening; occasional inverted-code recovery remains serial. A generated dim, low-contrast fixture exercises recovery. Supported continuous autofocus is requested without waiting for it or restarting the stream.

Decode coordinates use exactly the centered proportional cover crop shown in the preview. Whole-visible-view passes surround central detail attempts, so visible labels outside the reticle remain detectable. Pixels hidden by CSS cropping are deliberately excluded to prevent a neighboring invisible label stealing navigation. Video is never stretched. Mobile preview is approximately 4:5, capped by dynamic viewport height; desktop/landscape proportions and iOS safe-area handling keep controls reachable.

## Visual review

Screenshots use an isolated fixture collection. White synthetic camera backgrounds in comparison images are intentional. The colored portrait source independently checks both preview edges for filled pixels and displays an undistorted circle.

| Theme | Before | After | Portrait source / cover proof |
| --- | --- | --- | --- |
| Light | [Before](before-light.jpg) | [After](after-light.jpg) | [Portrait](portrait-light.png) |
| Dark | [Before](before-dark.jpg) | [After](after-dark.jpg) | [Portrait](portrait-dark.png) |

Browser coverage includes 320/390 px mobile, tablet, landscape and 1440 px desktop. The mobile header remains 65 px. Normal controls fit a single compact row; touch targets remain 44 px. Restart is contextual. Privacy and permission help are disclosed on demand. Native dialog focus restoration, Escape and keyboard/manual lookup remain functional. No added scanning animation or fixed success delay.

## Permissions, security and lifecycle

The camera uses the stable top-level application origin and existing camera policy. No iframe, permission boolean, retained hidden stream or global browser permission workaround was introduced. Device preference is optional local storage; an actual `getUserMedia` result determines authorization. Browser grants are reused naturally. Safari and installed PWAs can request permission again; AxilDB cannot promise permanent permission. See the [media capture API](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) and [WebKit permission-persistence report](https://bugs.webkit.org/show_bug.cgi?id=280394).

Only trusted parsed resource URLs become constructed internal routes; raw payloads never become arbitrary navigation. Canonical URLs receive fresh destination authorization. Legacy and manual lookup preserve collection scoping, origin validation, ambiguous-choice handling and indistinguishable private/missing resolver errors. No care event or photo upload occurs on scanning.

Close, background, navigation, camera switch and unmount release tracks/canvas/timer. Late permission, decoder and resolver completions cannot revive a closed scanner or stop its replacement. Decoder-load failure can recover through Restart. Unsupported torch/switch controls are hidden; track release also stops torch. Actual iOS hardware capability support is pending verification.

## Executed checks

- `npm run check:qr-scanner`: parser/security, generated symbols, photo limits, dim recovery, crop geometry, adaptive timing, async replacement and repeated camera lifecycle checks passed.
- `npm run check:qr-scanner:db`: isolated authorization and read-only resolution checks passed.
- `npm run check:qr-scanner:ui`: real canvas/video/decoder integration, direct plant/location navigation, private destination access rejection, deleted-record not-found, invalid payloads, duplicates, manual ambiguity/retry, multi-code photo choice, denial, controls, remembered camera, interruption recovery, portrait fill, responsive themes and 40 repeated scans passed; no captured browser errors.
- `npm run check:label-download`: passed; existing labels remain compatible.
- `npm run check:typography`: passed.
- TypeScript and production build passed. ESLint comparison found no new issues in changed tracked files; new scanner modules also passed. Two existing Sidebar image warnings remain.
- Collection-scope audit retains its ten preexisting unrelated findings; no new findings. This is not a claim that every repository-wide check is clean.

## Required physical follow-up and recommendations

| Environment | Status / verify |
| --- | --- |
| iPhone Safari | Pending: clear printed label recognition, remembered grant, rear lens/focus, torch capability, interruptions |
| Installed iPhone PWA | Pending: permission after full relaunch, standalone navigation, close/background recovery |
| Android Chrome / installed PWA | Pending: camera choice, focus, torch, recognition and lifecycle |
| Physical Brother labels | Pending: small/curved labels, angle, gloss/reflection, shadows, foliage and print defects |

Use the local timing option documented in [QR scanner guidance](../../QR_SCANNER.md) on the target device. Start with a flat, matte, well-lit label at a comfortable focus distance; then compare the pot-mounted label. If recognition remains slow, compare frame detail/focus and physical label density before adding a decoder or worker. A short hold-steady/distance hint appears after 2.5 seconds.

Generated labels already encode only origin, collection and record path; bulk/single previews use 256 px symbols with margin 1, while instance QR images use generator defaults. No gratuitous query parameters were found. A future short-link scheme could reduce printed density, but requires a separate compatibility design; this change preserves all existing payload bytes. Increasing physical label size/quiet space or reducing glare may help difficult pots without changing identifiers. Do not infer from a screen recording that a new decoder alone solves optical blur.

# Integrated QR scanner review — 19 November 2026

## Implemented result

One globally shared overlay is launched beside the mobile menu and desktop sidebar branding. Camera labels navigate automatically after server authorization; Photo and exact manual lookup share that resolver. Multiple photo codes or accessible record matches require selection. No scan creates care, image or audit records. Existing Quick Care remains available on the destination.

The mobile navigation header is **65 px before and after**, while both controls now provide 44 px targets. No extra header row was added. Existing QR payload bytes, PWA identity/scope and plant/location detail routes remain unchanged. A pinned jsQR dependency and its distributed Apache-2.0 license were added, without a database migration or mandatory host configuration.

## Screenshots

All captures use disposable synthetic records and a mock camera. White previews are deliberate mock camera frames, not an observed device-camera failure. The navigation tests additionally supplied actual QR-containing camera frames to the real canvas decoder.

| View | Entry before | Entry after | Scanner |
| --- | --- | --- | --- |
| Mobile light | [Before](screenshots/before-entry-light-390.jpg) | [After](screenshots/after-entry-light-390.jpg) | [Overlay](screenshots/scanner-light-390.jpg) |
| Mobile dark | [Before](screenshots/before-entry-dark-390.jpg) | [After](screenshots/after-entry-dark-390.jpg) | [Overlay](screenshots/scanner-dark-390.jpg) |
| Desktop light | [Before](screenshots/before-entry-light-1440.jpg) | [After](screenshots/after-entry-light-1440.jpg) | [Overlay](screenshots/scanner-light-1440.jpg) |
| Desktop dark | [Before](screenshots/before-entry-dark-1440.jpg) | [After](screenshots/after-entry-dark-1440.jpg) | [Overlay](screenshots/scanner-dark-1440.jpg) |

Additional captures: [permission denial](screenshots/permission-denied.jpg), [manual collection choices](screenshots/manual-choices.jpg), [multiple photo labels](screenshots/photo-choices.jpg), [320 px](screenshots/responsive-320.jpg), [tablet](screenshots/responsive-820.jpg), [landscape](screenshots/responsive-844.jpg).

## Executed checks

- Pure parser: current shared-generator plant/location URLs, pre-collection routes discovered in Git history, trusted legacy origins, relative URLs, exact machine IDs, percent encoding, whitespace and trailing slash. Foreign origins/ports, credentials, unsupported schemes/resources, controls, malformed encoding, traversal, encoded slashes and oversized payloads are rejected. Query-string redirects are discarded when constructing the canonical destination.
- Actual jsQR decoding: current bulk-label settings (256 px / margin 1), default instance QR settings, rotated QR images, JPEG compression, multiple distinct QR symbols, blank images, and supported photo header/size limits. Local 300 px fixture decode samples were approximately 11–16 ms, including bounded multi-symbol discovery; this is not a mobile-device benchmark.
- Camera-controller fixtures: 40 open/close cycles, no remaining timer work, late permission response cleanup, successful-detection cleanup, partial initialization failure, device switching, unsupported torch, overlapping-control protection and background/foreground handling. Capture requests are video-only.
- Real browser video/canvas/decoder flow: mock MediaStreams containing generated QR codes resolved and internally navigated to plant and location records. One detection produced one lookup. Same-record scans closed without reload, and the global launcher remained available after navigation. No new tab or document request was created by scanned navigation.
- Browser lifecycle: close/Escape, permission denial with manual fallback, late camera response, close during held resolution with a late server response, lookup retry after a transient failure, visibility background/foreground, and persisted pagehide/pageshow recovery. Camera switching stopped its predecessor before acquiring the replacement. Unsupported flashlight/switch controls were hidden.
- Photo/manual: local-only photo decoding, unrelated external URL rejection without a lookup, multiple-symbol choice, manual exact-ID ambiguity across accessible collections, and automatic navigation to a selected authorized record. Resolver requests contained only decoded text and a manual-mode flag, never image data.
- PostgreSQL/service/API: accessible cross-collection viewer records, public records, private/missing non-disclosure, archived specimens, archived collections, deleted records, mismatched collection/record scopes, prevention of URL-to-accession fallback collisions, invalid origin and schemes, expired sessions, and admin step-up authentication before any existence-sensitive lookup. Scan tests left care and photo counts at zero.
- Layout: light/dark at 390 and 1440 px; additional 320, 820 and 844 px portrait/landscape layouts; no horizontal overflow. Native dialog focus management, semantic controls, visible focus roles and meaningful status changes were reviewed. Hardware screen readers were not certified.

The final browser stress run completed **40 automatic decode/resolve/close cycles in about 5.5 seconds**, with exactly 40 lookups, maximum one active camera stream, zero active streams afterward, and no further canvas frame reads while closed. Across the whole test, 56 acquisition attempts yielded 55 stopped streams and one intentional permission denial. The sampled JavaScript heap was about 22 MiB. These mock-camera/local-network observations establish bounded resource behavior, not long-duration leak certification on physical phones.

The decoder chunk measured about **130 kB / 46 kB gzip**. Request observation confirmed it was absent before opening the scanner and loaded on demand. Closed scanning adds no polling or per-control requests.

TypeScript, production build, direct scanner-source lint, changed-source lint comparison, typography, label preference/download and collection-default checks pass. The broad collection-scope checker still reports ten previously documented findings outside the scanner. An existing Quick Fertilize eligibility query was made explicitly collection-scoped, removing its additional static finding without changing authorized behavior. There are no new scope-check findings from this implementation.

## Physical-device and print verification still required

| Environment / label condition | Status |
| --- | --- |
| Desktop Chrome, synthetic camera and genuine QR image fixtures | Passed automated checks |
| iPhone Safari | Physical-device verification required |
| iPhone installed PWA | Physical-device verification required |
| Android Chrome and installed PWA | Physical-device verification required |
| Desktop Safari | Manual verification required |
| Physical Brother/small accession labels, angled/obscured labels, indoor/dim light, glossy media | Physical print verification required |

On each phone, check initial permission, repeated reopen, rear-camera selection, inline preview, rotation/safe areas, background/return, flashlight when available, same-record scans, cross-collection navigation and camera release after close. Test a normal watering round: scan, view the instance, explicitly record Quick Water, scan the next label. Scanning itself must not record watering.

No iOS/Android hardware compatibility is claimed from desktop viewport emulation. Permission persistence and torch availability remain browser/device-dependent; Photo/manual alternatives are retained. Photos are limited to JPEG/PNG/WebP/GIF, 15 MB / 24 MP, with bounded multi-code discovery; dense sheets or damaged labels may require a closer/cropped photo or manual ID lookup. Native camera requests and image decoding cannot be synchronously cancelled by browser APIs, so late results are stopped/released as soon as they return and cannot navigate after cancellation.

## Deployment and architecture

See [the feature guide](../../QR_SCANNER.md) for shared services, lifecycle safeguards, supported payloads and optional legacy-origin configuration. Ordinary deployment uses **Web deployment**, with no host changes, migration, label reprint or PWA reinstall. A moved-origin installation may optionally configure an exact trusted legacy-origin list and recreate the app container; that is not needed for normal same-origin labels.

# Camera QR scanning in mobile browsers

Research for issue #1075 (map #1072, kids check-in and parent paging). Gathered 2026-11-23.

## Conclusions

- Scanning needs `getUserMedia`, which needs HTTPS (or localhost) and a user grant. Nothing else is required to open the camera.
- Native `BarcodeDetector` cannot be the only decoder. It exists on Chrome Android but not on iOS Safari (behind a flag) or Firefox.
- Safe default: a maintained JS/WASM decoder, using native `BarcodeDetector` when present. Recommended: `barcode-detector` (Sec-ant), a ponyfill over ZXing-C++ WASM.
- Always ship a typed-code fallback. It must be reachable from the first screen, not only after an error. iOS home-screen PWAs have a long-standing camera permission problem.

## Secure context and permissions

- `getUserMedia()` works only in secure contexts (HTTPS, `file:///`, `localhost`). In an insecure context `navigator.mediaDevices` is `undefined`. Source: [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) (read 2026-11-23). The dev setup in `docs` that uses `http://` on a phone over Tailscale will therefore not open the camera, except where the browser treats the origin as potentially trustworthy.
- The browser must ask at least the first time. The promise may stay pending if the user ignores the prompt, so the UI needs a visible "waiting for camera" state. Source: MDN, same page.
- Errors to handle:
  - `NotAllowedError`: the user denied, an insecure context, or a Permissions Policy block.
  - `NotFoundError`: no camera.
  - `NotReadableError`: permission granted but the hardware or OS is blocking it, for example another app holds the camera.
  - `OverconstrainedError`: raised for `exact` constraints, with no prompt.
  - `TypeError`: empty constraints or an insecure context.
  Source: MDN.
- Rear camera: `{ video: { facingMode: "environment" } }`. Plain values and `ideal` are preferences. `exact` is mandatory and can fail with `OverconstrainedError`. Use the plain value. Source: MDN.
- The Permissions API `query({name:"camera"})` is mirrored as supported in Safari iOS, Chrome Android and Firefox Android in [browser-compat-data](https://github.com/mdn/browser-compat-data/blob/main/api/Permissions.json). Whether the `camera` permission name is supported was not checked per browser. Do not rely on it. Catch the `getUserMedia` error instead.
- MDN does not document how long a denial persists. That is browser-specific. A denied user has to re-enable the camera in browser or site settings, so the denied state must tell them that.

## BarcodeDetector support

- The spec is a [WICG Draft Community Group Report](https://wicg.github.io/shape-detection-api/) (dated 2026-11-21). It is not a W3C Standard and not on the Standards Track. `qr_code` is a listed format. `getSupportedFormats()` returns the platform-dependent list, and an empty array when there is no support.
- [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API) marks it experimental and "Limited availability".
- Per [browser-compat-data](https://github.com/mdn/browser-compat-data/blob/main/api/BarcodeDetector.json) (fetched 2026-11-23):
  - Chrome Android 83 and later: supported.
  - Chrome desktop: partial. Supported on ChromeOS and macOS only.
  - Safari and iOS: version 17, behind the "Shape Detection API" preference flag. Not on by default.
  - Firefox and Firefox Android: not supported ([Bugzilla 1553738](https://bugzil.la/1553738)).
- Consequence: iOS Safari and every iOS browser need a JS/WASM decoder. Always feature-detect `"BarcodeDetector" in globalThis` and check `getSupportedFormats()` for `qr_code`.

## Decoder libraries

Maintenance facts from the GitHub API and the npm registry, fetched 2026-11-23.

| Library | Last npm release | Last push | Notes |
| --- | --- | --- | --- |
| [barcode-detector](https://github.com/Sec-ant/barcode-detector) (Sec-ant) | 3.2.4, 2026-11-15 | 2026-11-23 | MIT. Ponyfill/polyfill of the BarcodeDetector API over ZXing-C++ WASM. Active. Supports QR (models 1 and 2, micro). Needs the WASM file served or fetched from a CDN. |
| [qr-scanner](https://github.com/nimiq/qr-scanner) (nimiq) | 1.4.2, 2022-11-23 | 2024-03-30 | MIT. Uses native BarcodeDetector when present, otherwise its worker. Has camera listing, `preferredCamera` and flashlight. Not archived but stale. |
| [html5-qrcode](https://github.com/mebjas/html5-qrcode) | 2.3.8, 2023-04-15 | 2025-12-01 | Apache-2.0. README: "maintenance mode until further notice", PRs not merged, looking for new owners. Avoid. |
| [@zxing/library](https://github.com/zxing-js/library) | 0.23.0, 2026-04-29 | 2026-10-17 | Apache-2.0. Active. A lower-level JS port, so camera handling is on us. |
| [jsQR](https://github.com/cozmo/jsQR) | 1.4.0, 2021-04-24 | 2026-05-15 | Apache-2.0. Pure JS, no releases since 2021. |

Recommendation: `barcode-detector`. It is actively released, gives the standard API surface, and lets the code use the native detector where it exists. We write the video and frame loop ourselves: `getUserMedia` into a `<video>`, then `detect(video)` on an interval. `qr-scanner` is a ready-made alternative but unreleased since 2022.

## Reliability in low light and from a printed sticker

Not covered by any primary source found. The vendors publish no accuracy numbers for these conditions. Treat the points below as design guidance to verify on devices, not as findings:

- Limit `formats` to `["qr_code"]`. The spec says limiting formats is likely to improve performance.
- Request a higher video resolution (for example `ideal` 1280x720) and scan on an interval of roughly 100 to 250 ms, not every frame.
- Print the code large with a quiet zone and high error correction (level M or Q), with a matte finish.
- Torch control exists in `qr-scanner`. Whether `torch` is exposed by `MediaTrackCapabilities` on each browser was not verified. Do not depend on it.
- Test plan: run printed stickers at the real size, in dim light, on one iPhone and one Android phone.

## Installed PWA

- Android Chrome: no findings that differ from the browser tab. Not independently verified.
- iOS home-screen (standalone) web apps have a documented history of re-prompting for camera access. [WebKit bug 215884](https://bugs.webkit.org/show_bug.cgi?id=215884) (RESOLVED, "configuration changed") covers permission resets on hash navigation in standalone mode. Per the bug (last comment 2026-10-12), a maintainer said in February 2026 that persistent permission for Home Screen apps is a separate bug (327237). It is not known to be fixed.
- Workarounds reported in that bug: stop the tracks before navigating, avoid hash routing while the camera is open, and ask the user to allow the camera permanently in Safari settings.
- Apple Developer Forums reports of repeated prompts exist, for example [thread 788518](https://developer.apple.com/forums/thread/788518). These are user reports, not Apple statements.
- Implication: expect a prompt on each scan session in an installed iOS PWA. Keep the camera screen as one route and release the stream on exit with `track.stop()`.

## When permission is denied or scanning fails

1. Catch the `getUserMedia` error and map it: `NotAllowedError` gives "camera blocked, enable it in site settings"; `NotFoundError` and `NotReadableError` give "no usable camera".
2. Never leave a blank viewfinder. Show a state for "waiting for permission", "denied" and "scanning".
3. The typed-code field sits on the same screen as the viewfinder, visible from the start. A typed code goes through the same server validation as a scan.
4. Keep the printed human-readable code on the sticker or slip so the fallback has something to read.

## Open questions

- Whether `http://` over Tailscale in dev counts as a secure context on the phone browsers. It probably does not. Verify before relying on dev-phone camera tests, or use HTTPS or a tunnel.
- Low-light and torch behaviour on the real devices the church uses.
- Whether bug 327237 has a fix on current iOS.

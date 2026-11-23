# Research: Silent sticker-label printing from a browser

Issue: #1074 (map #1072, Kids check-in and parent paging). Researched 2026-11-23.
Status: research only. No printer is chosen; the model is open (hardware inventory ticket).

## 0. Summary

A page cannot silently print by itself: the web platform has no "print without asking" API. Every working route puts a trusted component outside the page's sandbox. The routes differ in where that component lives.

| Route | Needs on the desk PC | Silent? | Label formats | Offline / paper-out feedback |
|---|---|---|---|---|
| A. Chrome kiosk/silent-print mode | Chrome launched in a special mode or by policy | Yes, to the default printer only | Whatever the OS driver renders (PDF/HTML) | None to the page |
| B. CUPS/IPP print server | CUPS box on the LAN; app server (not browser) sends jobs | Yes, server-side | PDF/PWG Raster via driverless, or raw ZPL/ESC-POS | Yes, IPP printer and job state |
| C. Local helper (QZ Tray, Zebra Browser Print, DYMO, Brother b-PAC) | Vendor/third-party app on the desk PC | Yes (QZ requires signed messages) | Raw ZPL/ESC-POS or vendor templates | Depends on the helper |
| D. WebUSB / Web Serial / Web Bluetooth | Nothing to install in theory; Chromium only, one-time permission | Yes after the grant | Raw ZPL/ESC-POS bytes written by the page | Page sees raw transfer errors only |
| E. Cloud relay (PrintNode-style) | A client app on the desk PC, plus a vendor account | Yes | Raw or PDF | Yes, via the vendor's API |

Google Cloud Print is not an option: it was shut down (see section 3).

Key constraint: "parent scans a QR at the drop-off" implies the scan happens on a parent's phone or a kiosk. A parent's phone browser cannot reach a desk printer silently. The print must be triggered server-side or on the desk machine (routes B, C, E, or a page open on the desk PC that listens for check-ins). Routes A and D need the page to run on the machine that is attached to the printer.

## 1. Chromium kiosk and silent printing (route A)

- The commonly cited method is launching Chrome with `--kiosk --kiosk-printing`, which skips the print preview and prints to the OS default printer. I could not reach a primary Chromium document describing this flag. The only primary-adjacent evidence found is contradictory: a Chromium developer wrote in a chromium-dev thread that "--kiosk-print has absolutely no effect, and hasn't for some time" and that it is not officially supported (undated thread, https://groups.google.com/a/chromium.org/g/chromium-dev/c/f_VXrJAd_D0). Treat the flag as undocumented and unverified; test on the real machine.
- A newer, documented route is an enterprise policy `SilentPrintingEnabled`. A Samsung Browser policy page (mirroring the Chromium policy, https://developer.samsung.com/browser/policy/silent-printing-enabled.html) says that when enabled it closes the print preview as soon as it opens and prints to the default printer with default options, and lists Chrome on Windows since version 144. Verify the Chrome side on https://chromeenterprise.google/policies/ (that page did not render in my fetch tool).
- ChromeOS: the `chrome.printing` extension API lets kiosk apps print without confirmation starting with ChromeOS 128 (https://developers.google.com/chromeos/app-development/news/simplify-printing-experience-in-chromeos). This needs a managed Chromebox.
- Constraints: default printer and default options only, so label size comes from the driver's default paper size; no feedback to the page if the printer is offline or out of media; the browser must be started in that mode on that machine; ZPL cannot be sent (the OS driver renders the page). The page must be open on the desk PC, not on a parent's phone.

## 2. IPP and CUPS (route B)

- IPP is an HTTP-based protocol: each operation is an HTTP POST with `Content-Type: application/ipp`, default port 631 (RFC 8010, https://www.rfc-editor.org/rfc/rfc8010). RFC 8011 (https://www.rfc-editor.org/rfc/rfc8011) defines Print-Job, Get-Printer-Attributes, and the `job-state`, `printer-state` and `printer-state-reasons` attributes that report offline or media problems. I did not retrieve the exact reason keywords from the RFC text; the semantics of printer state reporting are defined there.
- A browser page should not speak IPP directly: `application/ipp` is not a CORS-safelisted content type (only `application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain` are), so every request triggers a preflight the printer will not answer (https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS). Inference: the app's server (or a small service on the LAN) should submit jobs, not the browser.
- IPP Everywhere (PWG 5100.14) lets clients print without vendor drivers; printers and servers must support IPP/2.0, DNS-SD and PWG Raster, with PDF recommended (https://www.pwg.org/ipp/everywhere.html). Many label printers do not implement it; check per model.
- CUPS: `lpadmin -m everywhere` creates a driverless queue from an IPP printer; `-m raw` makes a pass-through queue that suits ZPL/ESC-POS; `-o printer-is-shared=true` shares the queue on the LAN (https://www.cups.org/doc/man-lpadmin.html). Models other than `everywhere` are deprecated there, but raw queues remain the way to pass ZPL.
- Fit: the app server on the same LAN as a CUPS host (or a Raspberry Pi/mini PC next to the printer) can print silently, see job and printer state, and retry. Volunteer install burden is near zero after one-time setup by an admin. If the server is hosted off-site (the project uses Dokploy), it cannot reach a LAN printer without a tunnel or a poller on site. That is the main trade-off.

## 3. Local helper app on the desk computer (route C)

All of these require installing software and a browser-to-localhost connection.

- QZ Tray: cross-platform desktop app; the page connects through a local websocket, can list printers, and send raw ZPL, EPL, ESC/POS and others, plus PDF/HTML/images. Silent printing requires digitally signed messages (https://qz.io/docs/). Licensing and pricing are on the vendor site; I did not retrieve them.
- Zebra Browser Print: Zebra's tool for browser pages to reach Zebra printers over USB or network on Windows and macOS, and network or Bluetooth on Android; distributed on request via a form (https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html). Zebra-only. A developer forum reports LAN printers not showing in the device list while USB worked (https://developer.zebra.com/thread/36961, undated). Its user guide PDF could not be read by my tool.
- DYMO: the DYMO Connect framework is a JavaScript SDK that needs DYMO Connect (or DYMO Label) software installed and its local web service running (https://github.com/dymosoftware/dymo-connect-framework). A vendor-community note dated Nov 2025 says the service address moved from `localhost` to a loopback IP and that Chrome updates broke local-service connections (https://sites.google.com/site/stickitdocs/announcements). Secondary source; verify.
- Brother b-PAC: a Windows COM component; browser use goes through a "b-PAC Extension" for Chrome, Edge and Firefox (https://support.brother.com/g/s/es/dev/en/bpac/index.html, reported by search snippet; the web-application PDF was unreadable by my tool).
- Browser to localhost is getting stricter. Chrome's Local Network Access change asks the user for permission when a public HTTPS site requests loopback or private addresses; the permission prompt launches in Chrome 142 (https://developer.chrome.com/blog/local-network-access). An enterprise policy to pre-grant it is planned there. Re-check before relying on any helper; each helper must work with this prompt, and the church's desk PC may need a one-time grant or policy.
- Google Cloud Print used to fill this role and was discontinued on 2020-12-31 (Google's announcement; my fetch of the sunset page returned 404, confirm at https://support.google.com/chrome/a/answer/9633006).
- Security: a local helper is a localhost server any open web page may try to call. QZ's signing requirement is the mitigation; the others rely on origin checks. Prefer helpers that restrict by origin or signature.

## 4. WebUSB, Web Serial, Web Bluetooth (route D)

- All three require a secure context (HTTPS), and are Chromium-family only in practice (MDN marks each "limited availability"/not Baseline: https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API, https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API, https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API). I did not retrieve the compatibility tables; Firefox and Safari are widely reported as unsupported, so confirm on MDN before relying on it. Not usable from iOS.
- Permission: the first grant needs a click (transient activation) and a device chooser. After that, `getDevices()` / `getPorts()` return already-approved devices so the page can reconnect without a prompt (WebUSB spec, https://wicg.github.io/webusb/; Chrome docs, https://developer.chrome.com/docs/capabilities/usb and https://developer.chrome.com/docs/capabilities/serial). The spec keeps entries with a serial number; those without are dropped once the device is gone, so the printer's USB descriptor matters.
- The printer USB class (0x07) is not in the WebUSB protected-class list (audio, HID, mass storage, hub, smart card, video, A/V, wireless) so the page can claim it (WebUSB spec above). In practice the OS printer driver may already hold the interface; Chrome's docs note Linux needs udev rules for access (https://developer.chrome.com/docs/capabilities/usb). Windows driver conflicts are not covered in the pages I read.
- Web Serial covers USB CDC or Bluetooth serial-emulating printers (MDN). Web Bluetooth is BLE only (MDN), so classic-Bluetooth (SPP) printers need Web Serial or a helper.
- Payload: the page writes raw ZPL or ESC-POS bytes itself, so it has to know the printer language, label size and calibration. No driver, but also no spooler: if the printer is off or out of media the page sees transfer errors or silent drops, with no queue and no retry.
- Fit: zero install on a Chromium desk PC after one-time pairing, no cloud dependency. The page must stay open on that machine. It cannot be triggered from a parent's phone unless the desk page receives check-ins (websocket or polling) and prints.

## 5. Vendor browser SDKs

Covered in C: Zebra Browser Print, DYMO Connect framework, Brother b-PAC. Common pattern: JS library in the page talking to a vendor service on the desk PC. They tie the church to one vendor and one OS family (DYMO and b-PAC are Windows/macOS), and are the likeliest to break when Chrome changes local-network rules. Brother also offers an iOS app called Smooth Print using a URL scheme (search snippet only, https://apps.apple.com/us/app/-/id6504161147); unverified.

## 6. Cloud print relays (route E)

- PrintNode: a client app runs on the computer with the printers and reports to PrintNode; the app server calls `https://api.printnode.com` with an API key to create jobs (printer id plus PDF/URI or raw base64/URI). If the computer is offline the job waits and is sent when it reconnects. Printers show `online`/`offline` and computers `connected`/`disconnected`. Raw mode ignores paper-size and copy options, so use `qty` for copies. The API is limited to 10 requests per second per account (https://www.printnode.com/en/docs/api/curl, read partly; pricing and job-state list not retrieved).
- Fit: strongest failure handling and works with the app hosted off-site, but adds a paid third party, an account secret on the server, and label content (child names) crossing a third-party service. A child-data privacy review is needed.

## 7. Label formats

- ZPL (Zebra) and ESC-POS/EPL and similar are printer command languages sent as raw bytes; they need to know the label size and gap/mark calibration and must be generated by the app (QZ supports ZPL, EPL, ESC/POS, ESC/P, DPL, PGL, SBPL: https://qz.io/docs/).
- Driver-based routes (kiosk, IPP Everywhere, DYMO/Brother templates) render a page or PDF at the paper size the driver is set to; label size mismatches show up as scaled or clipped output.
- Both approaches mean the app should keep one label layout definition and produce either PDF or the printer language, depending on the final route.

## 8. Failure handling comparison

- Kiosk/policy: none visible to the app; a failed job is lost or stuck in the OS queue.
- CUPS/IPP: best open standard story. IPP exposes job and printer state; CUPS queues jobs while the printer is off and can retry.
- Helpers: depends; QZ and Browser Print return errors for unreachable printers; DYMO web service errors are mostly "service not running".
- WebUSB/Serial: only low-level transfer errors; no queue. The page must implement retry, a status display and a reprint action.
- Cloud relay: queue plus online/offline status via the API.
- For any route, the volunteer-facing design still needs a visible "reprint" action and a printer-status indicator.

## 9. Open questions for the hardware inventory ticket

1. Printer model and connections (USB, Ethernet, Wi-Fi, Bluetooth), and whether it supports IPP Everywhere or ZPL/ESC-POS.
2. What does the current setup actually use (which helper or driver does the "QR to sticker" flow run on today)?
3. Which machine sits next to the printer and what OS/browser does it run? Is a LAN mini PC acceptable?
4. Is the app hosted off-site (Dokploy)? That decides whether the server can reach a LAN printer directly.
5. Must the print trigger on a parent's phone scan, or on a volunteer's station?
6. Is third-party handling of child names acceptable (cloud relay)?

## Gaps in this research

- No primary Chromium document for `--kiosk-printing`; the evidence is a developer thread saying it does not work, plus a mirrored policy page. Test on the church PC.
- Not read: Zebra Browser Print user guide, Brother b-PAC web application PDF (both unreadable by the fetch tool); RFC 8011 job-state keyword list; WebUSB/Web Serial/Web Bluetooth browser-compat tables; DYMO's official docs beyond the README; QZ and PrintNode pricing.

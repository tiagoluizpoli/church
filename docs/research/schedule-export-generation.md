# Research: generating and sharing Schedule exports (PNG, PDF, Excel)

Ticket #1103, map #1101. Checked 2026-11-25. Research only; no application code changed.

## Recommendation

Generate all three files **in the browser**, from one data model and, for PNG and PDF, one preview DOM.

| Output | How |
| --- | --- |
| PNG | `modern-screenshot` captures the preview page node |
| PDF | `jspdf` places those same page images, one per PDF page |
| XLSX | `write-excel-file/browser` builds the sheets from the same data model |
| Share / Download | Web Share with files where `canShare` says yes (PNG, PDF); Download always |

Both heavy libraries load with a dynamic `import()` on the export screen.

Why: image and PDF match the preview because they are the preview; the server gains no browser, fonts or queue; pt-BR text is shaped by the same engine that draws the screen.

Accepted cost: the PDF is a picture. No selectable or searchable text, and nothing for screen readers (Excel is the data form). Output can differ slightly between the exporting devices' browsers. If real text in the PDF becomes a requirement, revisit server Chromium.

## The stack today

- Web: React, Vite, Tailwind v4, installable PWA (`apps/web/package.json`, `vite.config.ts`). Colors are `oklch()` (`apps/web/src/index.css`).
- Server: Fastify on `oven/bun:1.4.3`, no browser in the image (`deployment/server.Dockerfile`). `sharp` is already there.
- Logo: normalised to one PNG of at most 512 px (`apps/server/src/application/church-logo-pipeline.ts`), served from a public RustFS bucket on its own origin (`STORAGE_PUBLIC_URL`).
- Font: Atkinson Hyperlegible from a Google Fonts CSS `@import` (`apps/web/src/index.css`).
- No export, share or spreadsheet code exists yet.

## Where to generate

| Approach | Matches preview | Real PDF text | Cost | Verdict |
| --- | --- | --- | --- | --- |
| Browser: DOM capture, then image into PDF | Yes | No | Two lazy libraries | **Recommended** |
| Browser print (`window.print()` + print CSS) | Mostly | Yes | No library; yields no file to the page, so it cannot feed Share; no PNG | Not enough alone |
| Server Chromium (Playwright/Puppeteer) | Yes, if it renders the same route | Yes | Chromium in the image, an authenticated render path, more memory | Fallback |
| `@react-pdf/renderer` | No: a second layout in its own primitives | Yes | 457 kB gz; PNG still needs another path | Rejected |
| Server `satori` + `resvg` | Only if the preview is that image; CSS subset | n/a | Second layout engine, MPL-2.0 | Rejected |

Server Chromium risks:

- Playwright lists only Node.js as a supported runtime ([system requirements](https://playwright.dev/docs/intro#system-requirements)); an open Bun issue reports Playwright hanging on Bun 1.3.x ([oven-sh/bun#47956](https://github.com/oven-sh/bun/issues/47956)). Not tested on 1.4.3.
- The official image is a Node image with browsers and system libraries, with its own sandbox setup ([Playwright Docker](https://playwright.dev/docs/docker)).

## Libraries

Version, date and license from the npm registry. "gz" is `bun build --minify` + `gzip -9` of the one export used, unless marked bundlephobia.

| Library | Version (date) | License | gz | Note |
| --- | --- | --- | --- | --- |
| [modern-screenshot](https://github.com/qq15725/modern-screenshot) | 4.7.0 (2026-04) | MIT | 10 kB | The browser renders the CSS (SVG capture); `scale`, `maximumCanvasSize`, and a Safari decode workaround `drawImageInterval` ([options](https://github.com/qq15725/modern-screenshot/blob/main/src/options.ts)). Small maintainer base |
| [html-to-image](https://github.com/bubkoo/html-to-image) | 1.11.13 (2025-02) | MIT | 5 kB (bundlephobia) | Same technique; no release in 21 months, ~190 open issues and PRs |
| [snapdom](https://github.com/zumerlab/snapdom) | 3.8.3 (2026-11) | MIT | up to 114 kB (bundlephobia) | Very active; documents canvas size guards that scale output down. Second choice if the first fails on iOS |
| html2canvas / [-pro](https://github.com/yorickshan/html2canvas-pro) | 1.4.1 (2022-01) / 2.6.4 | MIT | -pro 67 kB (bundlephobia) | Re-implements CSS in JS, so fidelity risk; the original is stale |
| [jspdf](https://github.com/parallax/jsPDF) | 4.2.1 (2026-03) | MIT | 132 kB entry, 245 kB all chunks | Maintained |
| [pdf-lib](https://github.com/Hopding/pdf-lib) | 1.17.1 (2021-11) | MIT | 180 kB | Unmaintained |
| pdfmake | 0.3.15 (2026-11) | MIT | 309 kB (bundlephobia) | Own layout language; does not reuse the preview |
| [write-excel-file](https://gitlab.com/catamphetamine/write-excel-file) | 4.1.1 (2026-06) | MIT | 20 kB | One dependency (`fflate`); browser and Node; multiple sheets, column widths, `columnSpan`/`rowSpan`, fills, bold, orientation, images |
| [exceljs](https://github.com/exceljs/exceljs) | 4.4.0 (2023-10) | MIT | 256 kB (bundlephobia) | Richer, but no release in three years |
| xlsx (SheetJS) | npm 0.18.5 (2022-03) | Apache-2.0 | not measured | npm copy is out of date; current builds come from the vendor's CDN ([install docs](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/)) |

## Fonts and pt-BR text

- **Self-host Atkinson Hyperlegible** (`@fontsource/atkinson-hyperlegible`, 5.3.0, OFL-1.1). Capture must fetch and embed the font; a cross-origin stylesheet adds a failure point, and an installed PWA offline may not have it. Wait for `document.fonts.ready` before capturing, and check an exported file for á, ã, ç, é, ê, ó, õ.
- Image-in-PDF needs no PDF font. Text drawn by jsPDF would: its 14 standard fonts cover only a limited codepage and other text needs an embedded TTF ([jsPDF README](https://github.com/parallax/jsPDF#use-of-unicode-characters--utf-8)). react-pdf takes only TTF or WOFF, and variable fonts do not work well ([docs](https://react-pdf.org/fonts)).
- XLSX text is Unicode; the viewer's machine picks the font, so use a common one and do not rely on Atkinson.

## Church logo and CORS

A canvas capture can only include the logo if the page may read its bytes; modern-screenshot warns that CORS causes partial embedding.

Local RustFS 1.0.6 with a foreign `Origin` returned **no `Access-Control-Allow-Origin`**, on a preflight (200) and on a GET of a missing key (404). The repo's bucket setup applies a read policy only (`tooling/worktree/storage-buckets.ts`). Not checked: a GET of an existing object, and deployed storage. Plain `<img>` display works regardless, so the preview would look right while the export lost the logo.

Fix: **give the export screen the logo same-origin** (the API returns it as a data URL in the export data, or a small authenticated route streams it). `ObjectStorage` has no read method today, so it needs one. This avoids per-environment bucket CORS configuration. Alternative: configure bucket CORS in every environment.

## Tall and multi-page output

- Canvas has hard limits; MDN cites 4,096 x 4,096 for iOS, and an oversized canvas silently stops drawing ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas#maximum_canvas_size)). Treat about 16.7 million pixels as the budget until tested on a real iPhone: at 1080 px wide that is about 15,000 px tall, and a stricter 4,096 px per side would be much less.
- Render the export node at a **fixed width** independent of the phone (for example 540 CSS px at `scale: 2`), in the light theme. Scale only a wrapper to fit the preview on screen.
- Make pages **in the layout**: each page is its own DOM node, split at Event group or service boundaries, and captured separately. Never slice one big bitmap, which cuts through names. The preview then shows the real page breaks.
- PDF: A4 pages need their own page size or height budget; a tall phone image dropped on A4 prints tiny. Whether PNG and PDF share one page width is a layout-prototype question.
- PNG split into several files: Chromium accepts up to 10 files and 50 MB per share ([share_service_impl.h](https://github.com/chromium/chromium/blob/main/chrome/browser/webshare/share_service_impl.h)).

## Sharing

- Needs HTTPS and transient user activation; check `navigator.canShare({ files })` first; `AbortError` means the person cancelled and is not a failure ([MDN `share()`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share)).
- `share()` consumes the activation, which lasts only a short time ([WebKit](https://webkit.org/blog/13862/the-user-activation-api/)). **Build the file before the tap** (when the preview settles, or a "preparing" state that then enables Share). Do not render inside the click and then share.
- `.png` and `.pdf` are on the shareable list. **`.xlsx` is not**: it is absent from [MDN's list](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share#shareable_file_types) and from Chromium's allowlist ([share_service_impl.cc](https://github.com/chromium/chromium/blob/main/chrome/browser/webshare/share_service_impl.cc)). Excel is Download only; the person attaches it from Files. This narrows the map's "Share button on phones" for Excel.
- Android Chrome and iOS Safari support Web Share; desktop Firefox does not ([caniuse](https://caniuse.com/web-share)). Decide by `canShare`, not by user agent, and keep Download everywhere.
- Download: object URL on an `<a download>`.

## To verify when building

Device behaviour was not tested here.

1. iPhone (Safari and installed PWA): font and logo present on the **first** capture; longest realistic Schedule (10–13 people per service, whole Cycle) not blank or scaled down.
2. Android and iPhone: PNG and PDF reach WhatsApp from the share sheet; whether a tall PNG stays readable after WhatsApp recompresses it (this feeds the split thresholds).
3. Installed iOS PWA: Download of PDF and XLSX lands somewhere the person can find.
4. XLSX opens correctly in Excel, Google Sheets and a phone viewer.

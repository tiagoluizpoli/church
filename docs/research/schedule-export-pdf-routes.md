# Research: light server routes to a true-text Schedule PDF

Checked 2026-11-26. Research only; no application code changed. Follows [schedule-export-generation.md](https://github.com/tiagoluizpoli/church/blob/research/schedule-export-generation/docs/research/schedule-export-generation.md) (branch `research/schedule-export-generation`), which chose a browser image-in-PDF and said to revisit server rendering if real text became a requirement. It now is.

Target: prototype variant E (branch `prototype/schedule-export-layouts`, `prototypes/schedule-export-layouts/index.html?variant=E&data=kids`). A4 landscape grid, dates as columns, each time a vertical band spanning its Sector rows, coloured Sector markers, tinted cancelled cells, logo and title header, Atkinson Hyperlegible, pt-BR accents, rows never split, header repeated, real selectable text.

## Recommendation

**Render the PDF on the server with Typst: the CLI binary called from the Fastify process via `Bun.spawn`, the Schedule passed in as JSON, the output cached by content hash.** In the benchmark below one A4 PDF takes about 45 ms and 10–30 MB. A burst of 100 renders at once finishes in 3.3 s on 2 vCPU with a 306 MB peak, where Gotenberg needed about 60 s and timed out half of them. The output is real, tagged text with embedded subset fonts, and every layout rule here (rowspan bands, repeated header, unbreakable rows, tints, rotated labels, oklch colours) works. At this speed the server needs no queue, no worker container and no "your file is being prepared" UX. A concurrency cap equal to the core count, single-flight dedupe and a content-hash cache cover 70 leaders exporting together. The cost is that a Typst template is **a second layout next to the HTML preview**. Remove it by making the template the only layout: Typst renders the same document to SVG (about 40 ms) or PNG (about 180 ms at 200 ppi), so the export screen's preview and the PNG export can come from the template too, replacing the earlier plan to capture the DOM in the browser. Second choice: **WeasyPrint**. It reuses HTML/CSS and its tables are correct, but it costs about 1 s and 50 MB per PDF in a separate 318 MB Python service, and it has no `writing-mode`. Use it only if a single HTML layout matters more than server load. Reject the rest for this job: Chromium-based tools (Gotenberg, Vivliostyle, Paged.js CLI) are too heavy, wkhtmltopdf is archived and unsafe, Prince/DocRaptor are paid and send data out, hosted browsers send personal names outside our infrastructure, and the browser-side options are either a second layout (pdfmake) or a ~11 MB WASM download (typst.ts).

## Benchmark

Fixture: an Infantil-sized Schedule. 4 weeks; Sundays at 8h30, 10h30 and 18h30, plus Wednesday; 2 Sectors; 10–13 names per service; one cancelled time; one "Não haverá culto" date. It lays out on 2 A4 landscape pages. A long variant has 4 Sectors and 4 pages, to force page breaks mid-group. Files are in [`assets/schedule-export-pdf-routes/`](assets/schedule-export-pdf-routes/), with the PDFs in `out/`.

Method: each run is a fresh Docker container capped with `--cpus` on a 12-core host. Peak memory is the container's cgroup `memory.peak`, which covers every render process. "Burst N" starts N renders at once. "Sustained" runs 200 jobs (100 for WeasyPrint) with 10 in flight. Latency is per render, wall time is for the whole batch. The Typst CLI ran inside `oven/bun:1.4.3` (the server's base image) with the static musl binary mounted.

| Engine | vCPU | Single render | Burst 10: wall / peak mem | Burst 100: wall / max latency / peak mem | Sustained throughput |
| --- | --- | --- | --- | --- | --- |
| **Typst CLI 0.15.1** (process per PDF) | 4 | 44 ms, 11 MB | 0.13 s / 67 MB | 1.6 s / 1.5 s / 341 MB | 63 PDF/s (p50 128 ms, 74 MB) |
| | 2 | 47 ms, 10 MB | 0.30 s / 63 MB | 3.3 s / 2.9 s / 306 MB | 30 PDF/s (p50 302 ms, 68 MB) |
| **Typst in-process** (`@myriaddreamin/typst-ts-node-compiler` 0.7.0 on Bun, one worker thread per concurrent job, fresh compiler and different names per job) | 4 | 18 ms (Bun process RSS 104 MB) | 0.75 s for 100 jobs / 330 MB RSS | 1.9 s / 1.1 s / 634 MB RSS | 133 PDF/s at 10 workers |
| | 2 | 19 ms | 1.6 s for 100 jobs / 326 MB RSS | 3.8 s / 2.0 s / 607 MB RSS | 64 PDF/s at 10 workers |
| **WeasyPrint 70.0** (CLI process per PDF) | 4 | 1.03 s, 50 MB | 3.9 s / 462 MB | 41.8 s / 41.6 s / **3.9 GB** | 2.6 PDF/s (p50 3.8 s, 464 MB) |
| | 2 | 1.01 s, 50 MB | 7.9 s / 470 MB | 80.8 s / 80.7 s / **4.0 GB** | 1.4 PDF/s (p50 7.3 s, 461 MB) |
| WeasyPrint in a long-lived Python process | 4 | 328 ms warm (434 ms first), 84 MB max RSS; `import weasyprint` alone takes ~0.5 s | – | – | – |
| Gotenberg 8 / Chromium (given, not rerun; 12 cores) | 12 | 2.4 s, 172 MB | – / 482 MB | 49/100 timed out at 30 s / 634 MB | ~1.7 PDF/s |

Other measurements:

- Typst, long fixture (4 pages): 70 ms, 12 MB.
- Typst PNG at 200 ppi: 0.18 s and 90 MB for both pages. SVG: 0.04 s.
- PDF sizes: Typst 59 KB (2 pages) and 80 KB (4 pages). WeasyPrint 27 KB and 34 KB.
- Image footprint:
  - Typst CLI adds one 56 MB static binary (17.5 MB compressed) to the existing server image.
  - The napi addon adds about 101 MB of `node_modules` (52 MB of it the linux-x64 binary).
  - The WeasyPrint image built here is 318 MB.
  - Gotenberg is 2.4 GB.

Text and layout checks:

- `pdftotext` recovers á ã ç é ê ó õ from all four PDFs. Both engines embed Atkinson Hyperlegible as a subset CID TrueType font with a ToUnicode map (`pdffonts`: emb/sub/uni all yes).
- Typst output is a **tagged** PDF (`pdfinfo`: `Tagged: yes`). WeasyPrint's is not.
- Both repeat the date header on every page. Neither splits a row. A band (one time and its Sector rows) moves to the next page whole.
- Both extract the letter-spaced kicker "ESCALA" as "ESCAL A". That is `pdftotext`'s spacing heuristic on tracked text, so a search for the word may miss it. Drop the tracking on searchable words if that matters.
- WeasyPrint lost the rotated "19h30–21h00" band label. It has no `writing-mode`, and a `transform: rotate()` on a label wider than the 22 pt column did not paint. A wider column, an inline SVG or a horizontal label would fix it. Typst's `rotate(-90deg, reflow: true)` handled it.
- Peak-load arithmetic (Typst CLI, 2 vCPU): 70 simultaneous exports with nothing cached take about 2.3 s at 30 PDF/s. 1,000 across many churches take about 33 s if they all miss the cache. Within a church, the 70 leaders export only a handful of distinct Schedules, so the cache absorbs most of them.

Not measured: the Typst WASM build in a phone browser, pdfmake, the rendering services, and a real VPS. This host's 12 cores are faster per core than a typical VPS vCPU.

## Options compared

"Second layout" means a template other than the React preview has to be kept matching it.

| Route | Real text | Second layout? | Rowspan / repeat header / unbreakable rows | Font, accents | Server cost | License, status | Bun |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Typst CLI** (server) | Yes, tagged | Yes, unless the preview is Typst's SVG/PNG | `table.cell(rowspan:)`; `table.header(repeat: true)`; `set table.cell(breakable: false)` | `--font-path`, subset embedding; checked | ~45 ms / ~10–30 MB per PDF, +56 MB binary | Apache-2.0; 0.15.1 (2026-07-17); very active | Plain subprocess, no runtime coupling |
| Typst napi addon (in-process) | Yes | Same as above | Same | Same | ~18 ms; blocks the thread it runs on, so it needs workers; a crash takes the server down | Apache-2.0; 0.7.0 bundles Typst 0.14.2; one main maintainer | Ran on Bun 1.4.3 here |
| Typst WASM in the browser (typst.ts) | Yes | Same as above | Same | Fonts must be fetched by the client | None; client downloads ~10.8 MB gz WASM plus fonts | Apache-2.0; stable 0.7.0, 0.8.0-rc pending | n/a |
| **WeasyPrint** (server) | Yes, untagged | Partly: can share HTML/CSS, but print CSS differs from the browser (no `writing-mode`, no CSS grid parity) | `rowspan`; `thead` repeats; `break-inside: avoid` on `tr`/`tbody`. Rowspans across page breaks had bugs ([#1547](https://github.com/Kozea/WeasyPrint/issues/1547)) | `@font-face`, subset; checked | ~1 s / 50 MB per PDF; Python service; 318 MB image | BSD-3; 70.0 (2026-09-08); active | Separate container |
| Gotenberg / Chromium | Yes | No, if it renders the preview route | Full CSS | Full | 172 MB, 2.4 s per PDF; 2.4 GB image | MIT; active | Separate container |
| Vivliostyle CLI | Yes | No | Full CSS paged media | Full | Drives Chrome, so Chromium-class cost | AGPL-3.0; 11.6.0 (2026-11-25) | Separate container |
| Paged.js + print / pagedjs-cli | Yes | No | Polyfilled paged media | Full | CLI is puppeteer (Chromium); browser print gives no file for Web Share | MIT; npm 0.4.3 (2023-07) | – |
| wkhtmltopdf | Yes | Partly | Old QtWebKit CSS | – | Light, but no longer maintained | Archived; the project says do not use it with untrusted HTML | Rejected |
| Prince / DocRaptor | Yes | Partly (HTML) | Best-in-class paged media | Full | Prince server licence from about $2,000 a year; DocRaptor $15–149 a month for 125–5,000 docs | Commercial | DocRaptor sends names out |
| Hosted Chromium (Cloudflare Browser Rendering, Browserless, PDFShift, Api2Pdf) | Yes | No | Full CSS | Full | Cheap (Cloudflare: 10 h a month included on Workers Paid, then $0.09 per browser hour) | Commercial | Personal names leave our infrastructure (LGPD transfer, DPA); network dependency |
| pdfmake (browser) | Yes | Yes, its own document model | `rowSpan` with placeholder cells; `headerRows`; `dontBreakRows` (untested together with rowSpan) | VFS fonts | None; ~312 kB gz plus fonts | MIT; 0.3.15 (2026-11-20) | n/a |
| pdfme (browser) | Yes | Yes | No documented rowspan; styles per table/column only | – | – | MIT | Rejected |
| @react-pdf/renderer | Yes | Yes | No table primitive; rowspan by hand | TTF/WOFF | 457 kB gz | MIT | Rejected earlier |
| jspdf-autotable, satori+resvg, `window.print` | – | – | – | – | – | – | Rejected earlier; see the brief |
| OpenHTMLtoPDF, pdfkit, SILE, Tectonic, Lightpanda | – | – | – | – | JVM; manual layout; heavier stacks; Lightpanda cannot output PDF | – | Not pursued |

Sources:

- Typst:
  - [releases](https://github.com/typst/typst/releases/tag/v0.15.1)
  - [table reference](https://typst.app/docs/reference/model/table/): `header.repeat`, `cell.rowspan`, `cell.breakable`. Its `auto` default lets auto-height rows break, hence the explicit `breakable: false`.
  - [typst.ts](https://github.com/Myriad-Dreamin/typst.ts/releases)
  - [napi package](https://registry.npmjs.org/@myriaddreamin/typst-ts-node-compiler)
- WeasyPrint:
  - [releases](https://github.com/Kozea/WeasyPrint/releases)
  - [table layout](https://raw.githubusercontent.com/Kozea/WeasyPrint/main/weasyprint/layout/table.py)
  - [API reference](https://doc.courtbouillon.org/weasyprint/stable/api_reference.html)
- [Vivliostyle CLI](https://github.com/vivliostyle/vivliostyle-cli), [pagedjs-cli](https://registry.npmjs.org/pagedjs-cli/latest)
- wkhtmltopdf: [repository](https://github.com/wkhtmltopdf/wkhtmltopdf), [status page](https://wkhtmltopdf.org/status.html)
- [Prince pricing](https://www.princexml.com/purchase/), [DocRaptor plans](https://docraptor.com/signup)
- Cloudflare: [Browser Rendering pricing](https://developers.cloudflare.com/browser-rendering/pricing/), [PDF endpoint](https://developers.cloudflare.com/browser-rendering/quick-actions/pdf-endpoint/), [Data Localization compatibility](https://developers.cloudflare.com/data-localization/compatibility/) (Browser Rendering is not listed)
- [Browserless pricing](https://www.browserless.io/pricing), [PDFShift pricing](https://pdfshift.io/pricing/), [Api2Pdf pricing](https://www.api2pdf.com/pricing/)
- [pdfmake tables](https://pdfmake.github.io/docs/0.3/document-definition-object/tables/), [pdfme tables](https://pdfme.com/docs/tables)
- [Lightpanda: no PDF](https://github.com/lightpanda-io/browser/issues/941)

## Architecture levers (independent of the engine)

- **Content-hash cache.**
  - Key: hash of (template version, font version, logo hash, export options, the Schedule's export payload).
  - Store the PDF in the existing object storage (or briefly in memory, since files are ~60 KB) under that key.
  - Many leaders exporting the same unchanged Schedule then cost one render, and an edited Schedule changes the key, so there is nothing to invalidate.
  - Serve cached files through the authenticated API, never a public bucket URL, because they contain names.
- **Single-flight.** Concurrent requests for the same key await the one in-flight render.
- **Concurrency cap.** A semaphore sized to the core count around the spawn, plus a render timeout (kill after ~10 s). With Typst this bounds memory to roughly cores × 30 MB.
- **Queue (pg-boss) and a separate worker container.** Not needed with Typst: a render is shorter than a database round-trip burst, so the request can stay synchronous. They become worth it only with a Chromium-class or WeasyPrint engine:
  - pg-boss 12.40.0 (MIT) runs on Bun and Postgres 13+.
  - It has `singletonKey` for dedupe and `localConcurrency` per worker.
  - [README](https://github.com/timgit/pg-boss), [backends](https://github.com/timgit/pg-boss/blob/master/docs/database-backends.md).
  - With pg-boss, the UX becomes "your file is being prepared", and polling or a push tells the client when the file is ready.
- **Passing data.**
  - `typst compile --input payload=<json> schedule.typ -` reads the Schedule from a string input and writes the PDF to stdout, so no temporary files are needed. Template: `json(bytes(sys.inputs.payload))`.
  - Never interpolate names into Typst markup.
  - Linux caps one argv string at 128 KiB. Past that, pass a file in a per-render temp root, or use the napi addon's in-memory files.
  - The church logo must be a file inside `--root` (or bytes through the addon). Typst has no network access, which is also a security plus: a template cannot fetch anything.

## Open risks

1. **Second layout.** The Typst template will drift from the React preview unless the preview is Typst's own SVG/PNG output (a server round-trip of ~40–180 ms, in place of an instant client render). The team should decide this before building. It also changes the earlier PNG plan (DOM capture in the browser).
2. **New language.** Typst markup is a new template language for the team, and Typst is pre-1.0, so minor versions can break templates. Pin the binary version and keep a fixture-PDF regression test (for example, extract text and compare page count).
3. **Rowspan at page boundaries.** Unbreakable bands are correct here. A band taller than a page (many Sectors × many names) cannot fit anywhere, and needs a rule (allow breaking between Sector rows, or split the band). Not tested.
4. **Napi addon.** It is faster, but it has one main maintainer, bundles an older Typst (0.14.2) than the CLI, blocks the thread it runs on, and a crash in it takes down the API process. The subprocess route isolates failures for ~25 ms more per PDF.
5. **Benchmark scope.** Numbers come from a 12-core desktop capped with `--cpus`, not a shared VPS. Expect lower per-core speed there. The 2-vCPU rows are the planning figure.
6. **Extraction quirk.** Letter-spaced text extracts with gaps ("ESCAL A") in both engines.
7. **Untested here:**
   - pdfmake's `rowSpan` combined with `dontBreakRows`.
   - The Typst WASM build on iPhone.
   - Data-residency terms of PDFShift and Api2Pdf.

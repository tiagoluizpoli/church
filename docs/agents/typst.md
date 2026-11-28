# Church Typst

Load for work on Schedule export rendering: Typst templates, the render
service, or the export preview.

Typst renders every Schedule export file and the export screen's preview
(PDF, PNG, SVG) on the server, from templates kept in the repo. Why Typst over
Chromium, WeasyPrint and browser libraries, with benchmarks:
[schedule-export-pdf-routes.md](https://github.com/tiagoluizpoli/church/blob/research/schedule-export-pdf-routes/docs/research/schedule-export-pdf-routes.md)
(branch `research/schedule-export-pdf-routes`). A throwaway grid template that
already handles every layout rule below is in that branch's
`docs/research/assets/schedule-export-pdf-routes/schedule.typ`; start from it.
Decision record: map #1101, ticket "How the export files are generated".

## Version

Pinned to **Typst 0.15.1**, the static musl CLI binary
(`typst-x86_64-unknown-linux-musl` from GitHub releases). Typst is pre-1.0:
a minor release can change template syntax. Upgrade on purpose, in its own
change, with the fixture regression check green. Read the docs for the pinned
version; the website shows the latest.

## Install

```sh
bun run typst:install
```

Puts the pinned binary at `.tools/bin/typst` (gitignored), where the server
runs it. It downloads the release asset for Linux x64 or arm64, checks its
sha256, and needs `tar` and `xz` (`apt-get install xz-utils` where missing).
Rerunning it keeps an installed binary of the pinned version. The same command
runs in `bun run worktree:bootstrap`, in the CI setup action
(`.github/actions/setup-church-ci`, which also installs `poppler-utils` for
`pdftotext`/`pdffonts`) and in `deployment/server.Dockerfile`. To upgrade,
change `VERSION` and the hashes in `tooling/typst/install.ts` together with
`TYPST_VERSION` in `apps/server/src/infrastructure/typst/typst-paths.ts`;
the render integration test fails when they disagree.

## Reference

Official docs, fetched on demand. These cover everything the export uses:

- Tables: <https://typst.app/docs/reference/model/table/>
  (`table.header(repeat:)`, `table.cell(rowspan:, breakable:, fill:, stroke:)`)
- Guide to tables: <https://typst.app/docs/guides/tables/>
- Page and text setup: <https://typst.app/docs/reference/layout/page/>,
  <https://typst.app/docs/reference/text/text/>
- Blocks and page-break control: <https://typst.app/docs/reference/layout/block/>
  (`breakable`, `sticky`)
- Rotation: <https://typst.app/docs/reference/layout/rotate/> (`reflow: true`)
- Data in: <https://typst.app/docs/reference/foundations/sys/> (`sys.inputs`),
  <https://typst.app/docs/reference/data-loading/json/>
- Colour: <https://typst.app/docs/reference/visualize/color/> (`oklch()`)
- CLI: `typst compile --help`

## Template rules

- **Data comes in as JSON, never as markup.** The server passes the export
  payload with `--input payload=<json>`, or past 128 KiB as the file
  `payload.json` in the render root named by `--input payload_file=…`. Every
  template starts with
  `#let d = if "payload" in sys.inputs { json(bytes(sys.inputs.payload)) } else { json(sys.inputs.payload_file) }`.
  Never interpolate names or any user text into Typst source: that is code
  injection.
- **Fonts ship in the repo.** Atkinson Hyperlegible TTFs in
  `apps/server/typst/fonts/` (OFL), compiled with
  `--font-path <dir> --ignore-system-fonts`, so output matches on every
  machine.
- **No Typst packages** (`#import "@preview/…"`). They download from the
  network at compile time. Write the code, or vendor it inside the repo.
- **Images are files inside `--root`.** Typst cannot fetch URLs (which also
  means a template cannot leak anything). Given a `logoKey`, the renderer
  reads the logo with `ObjectStorage.get` and writes it into the render root
  as `logo.<ext>`; the template shows `image(sys.inputs.logo)` when
  `"logo" in sys.inputs` (absent when there is no logo).
- **Colours are the app's DESIGN.md tokens**, written as `oklch()`, so exports
  stay in the app's identity. Sector colour only repeats the written Sector
  name.
- **Page-break recipe** (verified on the grid):
  - `#set table.cell(breakable: false)`: a row never splits. The default
    `auto` lets tall rows break.
  - `table.header(repeat: true, …)`: the date header repeats on each page.
  - A time band is `table.cell(rowspan: n, …)` and moves to the next page whole.
    A band taller than a page has no rule yet: decide before relying on it.
  - The group title bar is `block(breakable: false, sticky: true)`, so it stays
    with its table.
  - Each split part starts on a new page with `pagebreak()`.
- **Vertical time labels** use `rotate(-90deg, reflow: true, …)`.
- **No letter-spacing (`tracking`) on words people search for.** Extraction
  then splits them ("ESCAL A").

## Rendering on the server

`TypstRenderer` (`domain/contracts/infrastructure/typst-renderer.ts`,
implemented by `infrastructure/typst/typst-cli-renderer.ts`, built in
`main/di/build-services.ts`) runs the CLI as one child process per render.
It uses `node:child_process`, not `Bun.spawn`: the dev server and Vitest run
on Node. The in-process napi addon is not used: if it crashes, the API goes
down. Its Typst version is also behind.

A template is a directory `apps/server/typst/templates/<name>/` with a
`main.typ`; the renderer copies it into a fresh temporary root for each render
and deletes the root afterwards. A failure or timeout throws
`TypstRenderError` (`reason: 'failed' | 'timeout'`) and logs only the first
`error:` line of the short diagnostic. Its test fixture is
`apps/server/tests/integration/typst/`.

```sh
typst compile --root <dir> --font-path <fonts> --ignore-system-fonts \
  --creation-timestamp <unix-seconds> --input payload=<json> \
  [--format png --ppi 200 | --format svg] [--pages <n>] <template.typ> -
```

- `-` as output writes to stdout. That works for a PDF, or for PNG and SVG
  with exactly one page (`--pages n`). A multi-page PNG or SVG to stdout fails
  with "cannot export multiple images to stdout": render page by page, or to
  `out-{p}.png`.
- Output is byte-identical for the same input only with a fixed
  `--creation-timestamp`. Otherwise the PDF embeds the current time. Use the
  Schedule's last change time; this keeps cache entries and fixture checks
  stable.
- One argument is capped at 128 KiB on Linux. A payload past that goes in a
  file under the render's root.
- On failure the exit code is 1 and stderr carries the diagnostic.
  `--diagnostic-format short` gives one-line `file:line:col: error: …` for
  logs.
- Load controls: a semaphore sized to the core count around the spawn, a
  ~10 s kill timeout, and single-flight per cache key.
- Cache by hash of (template version, Typst version, font version, logo hash,
  export options, payload). Files hold people's names: serve them through the
  authenticated API only, never a public bucket URL.
- Planning figures (2 vCPU): ~47 ms and ~10 MB per PDF, ~180 ms per PNG at
  200 ppi, ~40 ms per SVG page, ~30 PDF/s sustained.

## Working on a template

- Live edit: `typst watch <template.typ>` re-renders on save. The Tinymist VS
  Code extension adds a live preview pane.
- Judge changes at real size against the layout prototype
  (`prototype/schedule-export-layouts`, variants E grid and F cards). The
  owner signs off visual changes.
- Regression: render the fixture payloads with a fixed timestamp, then check
  page count and `pdftotext` output, including á ã ç é ê ó õ. Check
  `pdffonts` for embedded fonts.

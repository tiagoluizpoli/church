// Throwaway: prototype variant E as print HTML for WeasyPrint (and any CSS paged-media engine).
// bun html.ts [data-long.json] > out/schedule.html
const file = process.argv[2] ?? "data.json";
const d = await Bun.file(new URL(`./${file}`, import.meta.url)).json();
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

const groups = d.groups.map((g: any) => {
  const n = g.cols.length;
  const head = `<thead><tr><th class="time"></th><th class="sec"></th>${g.cols.map((c: any) => `<th><span class="wd">${c.wd}</span><span class="dn">${c.dn}</span></th>`).join("")}</tr></thead>`;
  // one <tbody> per band: WeasyPrint keeps it whole with break-inside: avoid, like Typst's unbreakable rowspan
  const bodies = g.bands.map((b: any) => `<tbody>${b.rows.map((r: any, si: number) =>
    `<tr${si ? ' class="row"' : ""}>${si === 0 ? `<th class="time" rowspan="${b.rows.length}"><span>${esc(b.time)}</span></th>` : ""}` +
    `<th class="sec s${r.color}">${esc(r.sector)}</th>` +
    r.cells.map((c: any) => c === null ? "" : "cancelled" in c ? `<td class="cx" rowspan="${c.rowspan}">${esc(c.cancelled)}</td>` : `<td>${c.names.map(esc).join("<br>")}</td>`).join("") +
    `</tr>`).join("")}</tbody>`).join("");
  return `<section class="grp"><header><h2>${esc(g.name)}</h2><span>${esc(g.subtitle)}</span></header><table><colgroup><col style="width:22pt"><col style="width:68pt">${"<col>".repeat(n)}</colgroup>${head}${bodies}</table></section>`;
}).join("");

console.log(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(d.ministry)} · ${esc(d.period)}</title><style>
@font-face { font-family: Atkinson; src: url(fonts/AtkinsonHyperlegible-Regular.ttf); }
@font-face { font-family: Atkinson; font-weight: 700; src: url(fonts/AtkinsonHyperlegible-Bold.ttf); }
@page { size: A4 landscape; margin: 11mm 12mm 10mm; background: oklch(0.992 0.002 220); }
:root { --fg: oklch(0.286 0.032 254); --mfg: oklch(0.48 0.024 250); --bd: oklch(0.885 0.012 242); --mut: oklch(0.955 0.008 236);
  --acc: oklch(0.948 0.018 247); --pri: oklch(0.378 0.09 255); --des: oklch(0.56 0.207 26); }
body { margin: 0; font: 9pt/1.3 Atkinson; color: var(--fg); }
.ehd { display: flex; align-items: center; gap: 10pt; padding-bottom: 8pt; border-bottom: .75pt solid var(--bd); }
.ehd img { width: 33pt; height: 33pt; border-radius: 7pt; }
.ehd .t { flex: 1; } .k { font-size: 8pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--mfg); }
h1 { margin: 0; font-size: 16.5pt; } .range { text-align: right; color: var(--mfg); font-size: 9.5pt; } .range b { display: block; color: var(--fg); font-size: 11pt; }
.grp { margin-top: 8pt; }
.grp > header { background: var(--pri); color: #fff; padding: 5pt 9pt; border-radius: 7pt 7pt 0 0; break-after: avoid; }
.grp h2 { display: inline; font-size: 11pt; margin-right: 6pt; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; background: #fff; border: .75pt solid var(--bd); }
th, td { padding: 3.5pt 6pt; vertical-align: top; text-align: left; font-weight: 400; }
thead th { background: var(--acc); border-bottom: .75pt solid var(--bd); } .wd { display: block; font-size: 7.5pt; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--mfg); } .dn { display: block; font-size: 10.5pt; font-weight: 700; }
td, thead th + th, th.sec { border-right: .75pt solid var(--bd); }
tbody { break-inside: avoid; } tr { break-inside: avoid; }
tbody + tbody tr:first-child > * { border-top: 1.5pt solid var(--pri); } tr.row > * { border-top: .75pt solid var(--mut); }
thead th.time { background: var(--acc) !important; } thead th.sec::before { display: none; }
th.time { background: var(--pri); color: #fff; padding: 0; text-align: center; vertical-align: middle; border-top-color: #fff !important; }
th.time span { display: inline-block; transform: rotate(-90deg); white-space: nowrap; font-weight: 700; font-size: 10pt; }
th.sec { font-weight: 700; font-size: 8.5pt; } th.sec::before { content: ""; display: inline-block; width: 5pt; height: 5pt; border-radius: 1.5pt; background: currentColor; margin-right: 4pt; }
.s0 { color: oklch(0.45 0.13 255); } .s1 { color: oklch(0.5 0.1 190); } .s2 { color: oklch(0.5 0.12 145); } .s3 { color: oklch(0.5 0.13 300); }
td.cx { background: oklch(0.97 0.015 26); color: var(--des); font-weight: 700; text-align: center; vertical-align: middle; }
</style></head><body>
<div class="ehd"><img src="logo.png" alt=""><div class="t"><div class="k">${esc(d.kicker)}</div><h1>${esc(d.ministry)}</h1></div><div class="range"><b>${esc(d.period)}</b>${esc(d.range)}</div></div>
${groups}</body></html>`);

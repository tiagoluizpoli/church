# Research: Schedule export layouts for phone and paper

Status: research only, for [#1102](https://github.com/tiagoluizpoli/church/issues/1102) (map [#1101](https://github.com/tiagoluizpoli/church/issues/1101)). Checked 2026-11-25. Web pages were read through a summarising fetch tool, so re-open the source before relying on exact wording.

Labels: **[source]** backed by the cited owner of the fact; **[estimate]** my arithmetic or design judgement; **[unverified]** third-party or not confirmed.

## Short answer

- Phone image: a single-column agenda (date, then time, then Sector heading, then names). A date x time grid with 10-13 full names per cell cannot be read at phone width. **[estimate]**
- Paper: a grid works on A4 landscape, with dates as columns and times as rows. **[estimate]**
- Distinguish Sectors by a written label and separators; color only repeats it. **[source]**
- One tall image for a whole month will probably not survive a standard-quality WhatsApp photo. Split the PNG by date or week, or send the PDF as a document. **[estimate, resting on unverified WhatsApp numbers]**

The last point conflicts with the map's assumption "a taller image to scroll is fine; split only when really large": "really large" arrives at about two services. The prototype should settle this with a real send.

## 1. WhatsApp image handling

What WhatsApp itself says:

- Media quality "may be lower than the original" because files are usually compressed when shared; the sender can pick standard or HD quality; documents can be up to 2 GB. **[source]** [Help Center: send media](https://faq.whatsapp.com/453914586839706/?cms_platform=android)
- Standard is the default; HD is chosen per send or in settings; quality cannot be changed after sending. **[source]** [Help Center: HD photos](https://faq.whatsapp.com/759301289012856/?cms_platform=android)
- The pages read give **no pixel dimensions, quality factor or aspect-ratio rule**, and do not state that the document route is uncompressed.

What third parties say (all **[unverified]**):

- Standard: longest edge cut to about 1600 px, JPEG quality about 50-60; PNG is re-encoded as JPEG. HD: longest edge about 5120 px, quality 70-80, still lossy. Document: byte-for-byte. Source: [Phasm](https://phasm.app/blog/how-15-platforms-process-your-photos), a mix of reverse engineering and observation, data as of February 2026. Other blogs give different HD caps (3000 px, 4096 px).
- Nothing found measures **tall** images specifically. Also unconfirmed: how the chat bubble crops a tall preview, and what happens to a PNG handed over by the phone's share sheet (the planned Share button).

Why it matters: if the cap is on the longest edge, a tall image loses **width**. **[estimate]** For a 1080 px wide PNG under a 1600 px cap:

| Original | Aspect | Width after |
|---|---|---|
| 1080 x 1600 | 1:1.5 | 1080 |
| 1080 x 2160 | 1:2 | 800 |
| 1080 x 3200 | 1:3 | 540 |
| 1080 x 8640 | 1:8 | 200 (unreadable) |

Suggested budget **[estimate]**: 1080 px wide, height at most about 2160 px (1:2). Design it as 360-400 layout units wide rendered at about 3x.

Verification still needed (cheap, human): send test PNGs of 1:2, 1:3 and 1:6 as standard photo, HD photo and document, from Android and iPhone, through the share sheet too; compare received dimensions and look at them on a phone.

If the PNG is drawn on an HTML canvas in the browser: iOS limits canvas to 4096 x 4096, and exceeding the limit makes it unusable. **[source]** [MDN canvas](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas)

## 2. Grid, list or agenda

- Reflow requires no two-way scrolling at 320 CSS px. Data tables are excepted, but each cell must still reflow. **[source]** [WCAG 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). It governs web pages, not PNGs; the width is a useful yardstick for the live preview.
- Horizontal scrolling on mobile tables is only "somewhat acceptable"; it relies on a locked first column and sticky headers. **[source]** [NN/g mobile tables](https://www.nngroup.com/articles/mobile-tables/). A flat image has neither.
- Prefer less data per table; split a large one into several. **[source]** [GOV.UK table](https://design-system.service.gov.uk/components/table/), [W3C WAI multi-level tables](https://www.w3.org/WAI/tutorials/tables/multi-level/)
- Borders or zebra striping help readers keep their row; put related data next to each other. **[source]** [NN/g data tables](https://www.nngroup.com/articles/data-tables/)

| Form | Phone image | A4 paper | Notes **[estimate]** |
|---|---|---|---|
| Agenda: date > time > Sector > names | Good | Long, many pages | Handles 13 names and irregular events |
| Grid: dates x times | Poor | Good, landscape | Fast "when am I on?" for weekly services |
| Flat table: date, event, Sector, name | Poor (repeats) | Acceptable | Suits Excel and the "Outros" group |

So PNG and PDF should not share one layout: agenda for PNG; grid for regular Event groups in the PDF, agenda or list for "Outros". If one layout is required for both, the agenda is the safe one.

## 3. Telling Sectors apart without color

- "Color is not used as the only visual means of conveying information"; add text or pattern. **[source]** [WCAG 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
- Text contrast at least 4.5:1, or 3:1 for large text (18 pt, or 14 pt bold). **[source]** [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- Browsers may drop background images and adjust colors when printing; `print-color-adjust: exact` asks them not to, with no guarantee. **[source]** [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/print-color-adjust)

Recommendation **[estimate]**:

1. Sector name as a written subheading above its names, in the same order in every service.
2. A rule or gap between Sectors, a heavier one between services and dates.
3. Color only as a repeat (bar or tint beside the label). It must survive grayscale printing.
4. No color-only legend, and no colored name text (the current spreadsheet's method).
5. The church accent color is arbitrary: check contrast and fall back to dark text.

Repo fact: `sector` has `name` but no color or short label (`packages/db/src/schema/core.ts`); `church` has `accentColor` and `logoKey` (`packages/db/src/schema/church.ts`). Per-Sector colors would need to be derived or added.

## 4. Long names

- Allow enough room to display long names; Brazilians "may even have three or four family names"; do not derive a short form from the full name, ask the person if one is needed. **[source]** [W3C: personal names](https://www.w3.org/International/questions/qa-personal-names)

Recommendation **[estimate]**: one name per line, wrap with a hanging indent, never truncate, ellipsize, auto-abbreviate or shrink the font for one name. On a phone image use one name column; two columns of about 180 units will wrap many full names. Test with the longest real names and with two people sharing a first name. Real name lengths were not measured.

## 5. Text size

- Consensus critical print size for normally sighted readers: 0.2 degrees x-height; at 40 cm that is an x-height of 1.4 mm. Body size in points depends on the typeface. **[source]** [Legge & Bigelow 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3428264/)

That is a floor, not a comfort target. **[estimate]** Paper: names 10-11 pt, never below 9. Phone image 400 units wide: names at least 14 units, preferably 16 (assumes a screen about 68 mm wide and x-height near half the font size). Older readers and JPEG softening argue for the larger value.

## 6. Splitting and dimensions

All **[estimate]**, with 13 names across about 4 Sectors per service.

**Phone PNG.** One service block is about 400 units tall (header, 4 Sector labels, 13 names at about 22 units per line). A 400 x 800 unit image (1080 x 2160 px) therefore holds about **2 services**, one Sunday with two times. A month of 8 Sunday services is about 3200 units, 1:8.

- Split on date boundaries, never inside a service; group short days together.
- Repeat title, Event group, date range, *Rascunho* stamp and "2/5" on every image.
- Order: Event group, date, time.
- Alternative if one file matters more: PDF sent as a document.
- Services with fewer names fit more per image, so split by measured height, not by a fixed count.

**A4** (210 x 297 mm; 10 mm margins leave 190 x 277 mm).

- Landscape, 5 Sundays as columns (about 55 mm each), 2 times as rows (about 75 mm each): about 150 mm of 190 mm, one page. Three times need two pages.
- Portrait, dates as rows: 4-5 rows of about 75 mm exceed 277 mm, two pages.
- Start each Event group on a new page only if it does not fit on the current one.
- Print user agents *may* repeat table header rows on each page. **[source]** [CSS 2.1 tables](https://www.w3.org/TR/CSS2/tables.html). `break-inside: avoid` is a request to keep a block whole. **[source]** [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/break-inside)
- If the PDF comes from Playwright: paper defaults to Letter, `printBackground` defaults to `false`, and print CSS applies, so set A4 and backgrounds explicitly. **[source]** [Playwright page.pdf](https://playwright.dev/docs/api/class-page#page-pdf)

## 7. Not covered or not verified

- WhatsApp dimensions, tall-image behaviour, share-sheet behaviour (section 1).
- No prototype rendered; every height, width and capacity figure is arithmetic.
- No user study of volunteer rotas or church timetables was found or searched for in depth; sections 2-6 apply general accessibility and table guidance.
- Excel layout and where files are generated belong to other tickets.

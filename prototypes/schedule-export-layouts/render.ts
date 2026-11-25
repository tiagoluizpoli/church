// PROTOTYPE, throwaway: renders every layout to real-size files in ./out for a WhatsApp send test.
// Run from the repo root: bun prototypes/schedule-export-layouts/render.ts
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const dir = new URL(".", import.meta.url).pathname;
const out = `${dir}out`;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 700, height: 900 }, deviceScaleFactor: 2 });
const open = async (qs: string) => {
  await page.goto(`file://${dir}index.html?chrome=0&${qs}`);
  await page.evaluate(() => document.fonts.ready);
};
const report: string[] = [];
for (const data of ["kids", "proj"]) {
  for (const variant of ["A", "B", "C"]) {
    for (const [split, n] of [["all", 1], ["group", 3], ["week", 4]] as const) {
      for (let part = 0; part < n; part++) {
        await open(`variant=${variant}&data=${data}&split=${split}&part=${part}`);
        const file = `${data}-${variant}-${split}${n > 1 ? part + 1 : ""}.png`;
        const box = (await page.locator("#sheet").boundingBox())!;
        await page.locator("#sheet").screenshot({ path: `${out}/${file}` });
        report.push(`${file}\t${box.width * 2}x${Math.round(box.height * 2)}\t1:${(box.height / box.width).toFixed(1)}`);
      }
    }
  }
  await open(`variant=D&data=${data}`);
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: `${out}/${data}-D.pdf`, format: "A4", landscape: true, printBackground: true, margin: { top: "0", bottom: "0", left: "0", right: "0" } });
  await page.emulateMedia({ media: "screen" });
}
await open("variant=A&data=kids&draft=1");
await page.locator("#sheet").screenshot({ path: `${out}/kids-A-all-draft.png` });
await browser.close();
console.log(report.join("\n"));

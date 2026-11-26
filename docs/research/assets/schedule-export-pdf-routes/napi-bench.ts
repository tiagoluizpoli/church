// Throwaway: Typst in-process on Bun via @myriaddreamin/typst-ts-node-compiler (napi).
// Copy into a scratch dir, bun add @myriaddreamin/typst-ts-node-compiler@0.7.0, then:
// ASSETS=<this folder>/ bun napi-bench.ts <concurrency> <jobs>
// The compiler is synchronous on the calling thread, so "concurrency" here is N Bun workers.
import { isMainThread, Worker, parentPort, workerData } from "node:worker_threads";
import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";

const dir = process.env.ASSETS ?? new URL(".", import.meta.url).pathname; // folder with schedule.typ, data.json, fonts/
if (!isMainThread) {
  const base = await Bun.file(`${dir}data.json`).json();
  for (let i = 0; i < workerData.jobs; i++) {
    const t = performance.now();
    // fresh compiler per job: Typst memoizes identical inputs, and real exports differ per Schedule
    const c = NodeCompiler.create({ workspace: dir, fontArgs: [{ fontPaths: [`${dir}fonts`] }] });
    // every job gets different names (rotated per cell), so Typst's memoization cannot reuse a layout
    const k = workerData.seed + i;
    for (const g of base.groups) for (const b of g.bands) for (const r of b.rows) for (const cell of r.cells) if (cell?.names) cell.names.push(...cell.names.splice(0, k % cell.names.length));
    base.ministry = `Ministério Infantil ${k}`;
    const pdf = c.pdf({ mainFilePath: `${dir}schedule.typ`, inputs: { payload: JSON.stringify(base) } });
    parentPort!.postMessage({ ms: performance.now() - t, bytes: pdf.length });
  }
} else {
  const [conc, jobs] = [Number(process.argv[2] ?? 1), Number(process.argv[3] ?? 20)];
  const lat: number[] = [];
  let peak = 0;
  const tick = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 5);
  const t0 = performance.now();
  await Promise.all(Array.from({ length: conc }, (_, w) => new Promise<void>((done) => {
    const wk = new Worker(new URL(import.meta.url), { workerData: { jobs: Math.ceil(jobs / conc), seed: w * 1000 } });
    wk.on("message", (m) => lat.push(m.ms));
    wk.on("exit", () => done());
  })));
  const wall = performance.now() - t0;
  clearInterval(tick);
  lat.sort((a, b) => a - b);
  console.log(`napi conc=${conc} jobs=${lat.length} wall_ms=${wall.toFixed(0)} pdf_per_s=${((lat.length * 1000) / wall).toFixed(1)} max_ms=${lat.at(-1)!.toFixed(0)} p50_ms=${lat[lat.length >> 1]!.toFixed(0)} rss_peak_mb=${(peak / 1048576).toFixed(0)}`);
}

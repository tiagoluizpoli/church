import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';
import { TYPST_VERSION } from './typst-paths';
import type { ObjectStorage } from '@/domain/contracts/infrastructure/object-storage';
import type {
  TypstCliRendererDependencies,
  TypstDirectoryInput,
  TypstPageCountInput,
  TypstRenderer,
  TypstRenderInput,
  TypstRenderRoot,
  TypstSpawnInput,
} from '@/domain/contracts/infrastructure/typst-renderer';
import { TypstRenderError } from '@/domain/errors/typst-render';

/** Linux caps one argument at 128 KiB (MAX_ARG_STRLEN, with its NUL). */
const MAX_ARGUMENT_BYTES = 128 * 1024 - 1;
const DEFAULT_PPI = 200;
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;
const execFileAsync = promisify(execFile);
/** The PDF's page tree root, as the pinned Typst writes it. */
const PDF_PAGE_COUNT = /\/Type\/Pages\/Count (\d+)\//;

/**
 * `TypstRenderer` over the pinned CLI: one CLI process per render in a fresh
 * temporary root, behind a semaphore, a kill timeout, single-flight per cache
 * key and an in-memory LRU. Files hold people's names, so nothing is written
 * anywhere but the temporary root.
 */
export class TypstCliRenderer implements TypstRenderer {
  private readonly objectStorage: ObjectStorage;
  private readonly binary: string;
  private readonly fontsDir: string;
  private readonly templatesDir: string;
  private readonly timeoutMs: number;
  private readonly cacheBytes: number;
  private readonly concurrency: number;

  /** Insertion order is recency order: the first entry is evicted first. */
  private readonly cache = new Map<string, Uint8Array>();
  private cachedBytes = 0;
  private readonly inFlight = new Map<string, Promise<Uint8Array>>();
  private readonly directoryHashes = new Map<string, Promise<string>>();
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor({ objectStorage, config }: TypstCliRendererDependencies) {
    this.objectStorage = objectStorage;
    this.binary = config.binary;
    this.fontsDir = config.fontsDir;
    this.templatesDir = config.templatesDir;
    this.timeoutMs = config.timeoutMs;
    this.cacheBytes = config.cacheBytes;
    this.concurrency = config.concurrency;
  }

  async render(input: TypstRenderInput): Promise<Uint8Array> {
    const key = await this.cacheKey(input);
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const render = (async () => {
      if (this.running >= this.concurrency) {
        await new Promise<void>((resolve) => this.waiting.push(resolve));
      }
      this.running += 1;
      try {
        const file = await this.compile(input);
        if (file.byteLength <= this.cacheBytes) {
          this.cache.set(key, file);
          this.cachedBytes += file.byteLength;
          for (const [oldest, evicted] of this.cache) {
            if (this.cachedBytes <= this.cacheBytes) break;
            this.cache.delete(oldest);
            this.cachedBytes -= evicted.byteLength;
          }
        }
        return file;
      } finally {
        this.running -= 1;
        this.waiting.shift()?.();
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, render);
    return render;
  }

  async countPages(input: TypstPageCountInput): Promise<number> {
    // The PDF holds every page and is the cheapest render; it is cached too.
    const pdf = await this.render({ ...input, format: 'pdf' });
    const [, count] =
      PDF_PAGE_COUNT.exec(Buffer.from(pdf).toString('latin1')) ?? [];
    if (!count) throw new TypstRenderError({ reason: 'failed' });
    return Number(count);
  }

  private async cacheKey(input: TypstRenderInput): Promise<string> {
    const [template, fonts] = await Promise.all([
      this.directoryHash({ dir: join(this.templatesDir, input.template) }),
      this.directoryHash({ dir: this.fontsDir }),
    ]);
    return createHash('sha256')
      .update(
        JSON.stringify([
          TYPST_VERSION,
          template,
          fonts,
          input.template,
          input.format,
          input.page ?? 1,
          input.ppi ?? DEFAULT_PPI,
          input.creationTimestamp.getTime(),
          input.logoKey ?? null,
          input.payload,
        ]),
      )
      .digest('hex');
  }

  /** Content hash of a directory's files, read once per process. */
  private directoryHash({ dir }: TypstDirectoryInput): Promise<string> {
    let hash = this.directoryHashes.get(dir);
    if (!hash) {
      hash = (async () => {
        const digest = createHash('sha256');
        const files = (
          await readdir(dir, { recursive: true, withFileTypes: true })
        )
          .filter((entry) => entry.isFile())
          .map((entry) => join(entry.parentPath, entry.name))
          .sort();
        for (const file of files) {
          digest.update(file.slice(dir.length)).update(await readFile(file));
        }
        return digest.digest('hex');
      })();
      this.directoryHashes.set(dir, hash);
    }
    return hash;
  }

  private async compile(input: TypstRenderInput): Promise<Uint8Array> {
    const root = await mkdtemp(join(tmpdir(), 'church-typst-'));
    try {
      await cp(join(this.templatesDir, input.template), root, {
        recursive: true,
      });
      const args = [
        'compile',
        '--root',
        root,
        '--font-path',
        this.fontsDir,
        '--ignore-system-fonts',
        '--creation-timestamp',
        String(Math.floor(input.creationTimestamp.getTime() / 1000)),
        '--diagnostic-format',
        'short',
        '--format',
        input.format,
        ...(await this.payloadInput({ root, input })),
        ...(await this.logoInput({ root, input })),
      ];
      if (input.format !== 'pdf') args.push('--pages', String(input.page ?? 1));
      if (input.format === 'png') {
        args.push('--ppi', String(input.ppi ?? DEFAULT_PPI));
      }
      return await this.spawn({
        root,
        input,
        args: [...args, join(root, 'main.typ'), '-'],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  private async payloadInput({
    root,
    input,
  }: TypstRenderRoot): Promise<string[]> {
    const json = JSON.stringify(input.payload);
    const argument = `payload=${json}`;
    if (Buffer.byteLength(argument) <= MAX_ARGUMENT_BYTES) {
      return ['--input', argument];
    }
    await writeFile(join(root, 'payload.json'), json);
    return ['--input', 'payload_file=payload.json'];
  }

  private async logoInput({ root, input }: TypstRenderRoot): Promise<string[]> {
    const { logoKey } = input;
    if (!logoKey) return [];
    const logo = await this.objectStorage.get({ key: logoKey });
    if (!logo) return [];
    const file = `logo${extname(logoKey)}`;
    await writeFile(join(root, file), logo);
    return ['--input', `logo=${file}`];
  }

  private async spawn({
    root,
    input,
    args,
  }: TypstSpawnInput): Promise<Uint8Array> {
    let stderr = '';
    let reason: TypstRenderError['reason'] = 'failed';
    try {
      // node:child_process, not Bun.spawn: dev and Vitest run on Node.
      const { stdout } = await execFileAsync(this.binary, args, {
        encoding: 'buffer',
        timeout: this.timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: MAX_OUTPUT_BYTES,
      });
      return new Uint8Array(stdout);
    } catch (error) {
      if (error instanceof Error && 'stderr' in error) {
        stderr = String(error.stderr);
      }
      if (error instanceof Error && 'killed' in error && error.killed) {
        reason = 'timeout';
      }
    }
    // ADR-0014: the first diagnostic line only (`file:line:col: error: …`),
    // with the temporary root cut, so no payload text reaches the log.
    const diagnostic =
      stderr.split('\n').find((line) => line.includes('error:')) ?? '';
    console.error('[Typst] render failed', {
      template: input.template,
      format: input.format,
      reason,
      diagnostic: diagnostic.replaceAll(`${root}/`, '').slice(0, 300),
    });
    throw new TypstRenderError({ reason });
  }
}

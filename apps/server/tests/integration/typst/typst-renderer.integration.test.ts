import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TypstRenderError } from '@/domain/errors/typst-render';
import { TypstCliRenderer } from '@/infrastructure/typst/typst-cli-renderer';
import {
  TYPST_BINARY,
  TYPST_FONTS_DIR,
  TYPST_VERSION,
} from '@/infrastructure/typst/typst-paths';
import { InMemoryObjectStorage } from '@/tests/test-support/in-memory-object-storage';

const TEMPLATES_DIR = resolve(import.meta.dirname, 'templates');
const ACCENTS = 'á ã ç é ê ó õ';
const creationTimestamp = new Date('2026-03-01T12:00:00Z');

interface RendererInput {
  binary?: string;
  timeoutMs?: number;
  cacheBytes?: number;
}

function renderer(input: RendererInput = {}) {
  const objectStorage = new InMemoryObjectStorage();
  return {
    objectStorage,
    renderer: new TypstCliRenderer({
      objectStorage,
      config: {
        binary: input.binary ?? TYPST_BINARY,
        fontsDir: TYPST_FONTS_DIR,
        templatesDir: TEMPLATES_DIR,
        timeoutMs: input.timeoutMs ?? 10_000,
        cacheBytes: input.cacheBytes ?? 100 * 1024 * 1024,
        concurrency: 2,
      },
    }),
  };
}

function poppler(tool: string, pdf: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), 'typst-test-'));
  const path = join(dir, 'out.pdf');
  writeFileSync(path, pdf);
  const args = { pdftotext: [path, '-'], pdfimages: ['-list', path] }[tool];
  return execFileSync(tool, args ?? [path], {
    encoding: 'utf8',
  });
}

/** A Typst wrapper that counts its runs, to observe the cache. */
function countingBinary(): { binary: string; runs: () => number } {
  const dir = mkdtempSync(join(tmpdir(), 'typst-count-'));
  const binary = join(dir, 'typst');
  const log = join(dir, 'runs');
  writeFileSync(log, '');
  writeFileSync(
    binary,
    `#!/bin/sh\necho run >> '${log}'\nexec '${TYPST_BINARY}' "$@"\n`,
    { mode: 0o755 },
  );
  return {
    binary,
    runs: () => readFileSync(log, 'utf8').split('\n').filter(Boolean).length,
  };
}

const payload = { title: `Escala ${ACCENTS}`, names: ['João Conceição'] };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Typst CLI renderer', () => {
  it('runs the pinned Typst version', () => {
    expect(
      execFileSync(TYPST_BINARY, ['--version'], { encoding: 'utf8' }),
    ).toMatch(new RegExp(`^typst ${TYPST_VERSION.replaceAll('.', '\\.')} `));
  });

  it('renders a PDF with the payload text and the embedded repo font', async () => {
    const pdf = await renderer().renderer.render({
      template: 'fixture',
      format: 'pdf',
      payload,
      creationTimestamp,
    });

    expect(poppler('pdftotext', pdf)).toContain(`Escala ${ACCENTS}`);
    expect(poppler('pdftotext', pdf)).toContain('João Conceição');
    expect(poppler('pdffonts', pdf)).toMatch(
      /AtkinsonHyperlegible-Bold\s.*yes/,
    );
    expect(poppler('pdffonts', pdf)).toMatch(
      /AtkinsonHyperlegible-Regular\s.*yes/,
    );
  });

  it('keeps user text as data, never as Typst markup', async () => {
    const pdf = await renderer().renderer.render({
      template: 'fixture',
      format: 'pdf',
      payload: { title: '#panic("x") *bold* $x$', names: [] },
      creationTimestamp,
    });

    expect(poppler('pdftotext', pdf)).toContain('#panic("x") *bold* $x$');
  });

  it('gives byte-identical output for identical input from separate renderers', async () => {
    const input = {
      template: 'fixture',
      format: 'pdf' as const,
      payload,
      creationTimestamp,
    };

    const first = await renderer().renderer.render(input);
    const second = await renderer().renderer.render(input);

    expect(Buffer.from(second).equals(Buffer.from(first))).toBe(true);
  });

  it('renders one PNG or SVG page', async () => {
    const { renderer: typst } = renderer();
    const twoPages = { ...payload, extraPages: 1 };

    const png = await typst.render({
      template: 'fixture',
      format: 'png',
      page: 2,
      ppi: 144,
      payload: twoPages,
      creationTimestamp,
    });
    const svg = await typst.render({
      template: 'fixture',
      format: 'svg',
      page: 1,
      payload: twoPages,
      creationTimestamp,
    });

    // 120 mm at 144 ppi.
    expect((await sharp(png).metadata()).width).toBe(680);
    expect(new TextDecoder().decode(svg)).toMatch(/^<svg /);
  });

  it('writes the church logo into the render root', async () => {
    const { renderer: typst, objectStorage } = renderer();
    const logo = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#123456' },
    })
      .png()
      .toBuffer();
    await objectStorage.put({
      key: 'public/churches/c1/logo/abc.png',
      body: new Uint8Array(logo),
      contentType: 'image/png',
      cacheControl: 'immutable',
    });

    const withLogo = await typst.render({
      template: 'fixture',
      format: 'pdf',
      payload,
      creationTimestamp,
      logoKey: 'public/churches/c1/logo/abc.png',
    });
    const without = await typst.render({
      template: 'fixture',
      format: 'pdf',
      payload,
      creationTimestamp,
    });

    expect(poppler('pdfimages', withLogo)).toMatch(
      /\n\s*1\s+0\s+image\s+8\s+8/,
    );
    expect(poppler('pdfimages', without)).not.toMatch(/image/);
  });

  it('passes a payload past 128 KiB through a file in the render root', async () => {
    const names = Array.from({ length: 4000 }, (_, i) => `Pessoa ${i} ção`);

    const pdf = await renderer().renderer.render({
      template: 'fixture',
      format: 'pdf',
      payload: { title: 'Grande', names },
      creationTimestamp,
    });

    expect(poppler('pdftotext', pdf)).toContain('Pessoa 3999 ção');
  });

  it('kills a render past the timeout with a typed error', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const started = Date.now();

    const failure = await renderer({ timeoutMs: 500 })
      .renderer.render({
        template: 'fixture',
        format: 'pdf',
        payload: { ...payload, spin: 1_000_000_000 },
        creationTimestamp,
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(TypstRenderError);
    expect(failure).toMatchObject({ reason: 'timeout' });
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(log).toHaveBeenCalledOnce();
  });

  it('surfaces a template error as a typed error and logs one diagnostic line without the payload', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const failure = await renderer()
      .renderer.render({
        template: 'fixture',
        format: 'pdf',
        payload: { title: 'Maria Silva' },
        creationTimestamp,
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(TypstRenderError);
    expect(failure).toMatchObject({ reason: 'failed' });
    expect(log).toHaveBeenCalledOnce();
    const logged = JSON.stringify(log.mock.calls[0]);
    expect(logged).toMatch(/main\.typ:\d+:\d+: error: /);
    expect(logged).not.toContain('Maria Silva');
    expect(logged).not.toContain('\\n');
  });

  it('shares one process between identical concurrent renders and caches the result', async () => {
    const counting = countingBinary();
    const { renderer: typst } = renderer({ binary: counting.binary });
    const input = {
      template: 'fixture',
      format: 'pdf' as const,
      payload,
      creationTimestamp,
    };

    const [first, second] = await Promise.all([
      typst.render(input),
      typst.render(input),
    ]);
    const third = await typst.render(input);
    await typst.render({ ...input, payload: { ...payload, title: 'Outra' } });

    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(counting.runs()).toBe(2);
  });

  it('evicts the least recently used file past the cache size', async () => {
    const counting = countingBinary();
    const { renderer: typst } = renderer({
      binary: counting.binary,
      cacheBytes: 1,
    });
    const input = {
      template: 'fixture',
      format: 'pdf' as const,
      payload,
      creationTimestamp,
    };

    await typst.render(input);
    await typst.render(input);

    expect(counting.runs()).toBe(2);
  });
});

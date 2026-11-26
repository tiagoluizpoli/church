import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'bun:test';
import {
  FIRST_PAINT_CONFIG_MARKER,
  FIRST_PAINT_CSS_MARKER,
  minifyCss,
  transformFirstPaintHtml,
} from '../../vite/first-paint';

const dir = mkdtempSync(path.join(tmpdir(), 'first-paint-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const cssFile = path.join(dir, 'first-paint.css');
writeFileSync(cssFile, '/* note */\n:root {\n  --background: red;\n}\n');
writeFileSync(
  path.join(dir, 'en.json'),
  JSON.stringify({ title: 'Welcome', greet: 'Hi {name}' }),
);
writeFileSync(
  path.join(dir, 'pt-BR.json'),
  JSON.stringify({ title: 'Bem-vindo' }),
);

const options = {
  cssFile,
  locale: {
    locales: ['en', 'pt-BR'],
    defaultLocale: 'pt-BR',
    cookieName: 'church_locale',
    queryParam: 'lang',
    messagesFile: (locale: string) => path.join(dir, `${locale}.json`),
  },
};
const page = `${FIRST_PAINT_CSS_MARKER}<script>const config = ${FIRST_PAINT_CONFIG_MARKER};</script><h1 data-m="title"></h1>`;

describe('transformFirstPaintHtml', () => {
  it('inlines the stylesheet and the locale settings with the copy of every data-m key', () => {
    const html = transformFirstPaintHtml({ html: page, options });
    expect(html).toContain('<style>:root{--background: red;}</style>');
    expect(html).toContain(
      'const config = {"locales":["en","pt-BR"],"defaultLocale":"pt-BR","cookieName":"church_locale","queryParam":"lang","messages":{"en":{"title":"Welcome"},"pt-BR":{"title":"Bem-vindo"}}};',
    );
  });

  it('fails when a marker is missing', () => {
    expect(() =>
      transformFirstPaintHtml({
        html: page.replace(FIRST_PAINT_CSS_MARKER, ''),
        options,
      }),
    ).toThrow(FIRST_PAINT_CSS_MARKER);
    expect(() =>
      transformFirstPaintHtml({
        html: page.replace(FIRST_PAINT_CONFIG_MARKER, '{}'),
        options,
      }),
    ).toThrow(FIRST_PAINT_CONFIG_MARKER);
  });

  it('fails when a locale lacks a key or the copy takes parameters', () => {
    expect(() =>
      transformFirstPaintHtml({
        html: `${page}<p data-m="greet"></p>`,
        options,
      }),
    ).toThrow('"greet" in en must be plain text');
  });
});

describe('minifyCss', () => {
  it('drops comments and whitespace but keeps media query ranges intact', () => {
    expect(
      minifyCss('@media (width >= 40rem) {\n  .a { padding: 1rem 2rem; }\n}'),
    ).toBe('@media (width >= 40rem){.a{padding: 1rem 2rem;}}');
  });
});

import { readFileSync } from 'node:fs';
import type { IndexHtmlPlugin } from './plugin';

/** Where index.html takes the first-paint stylesheet, inlined. */
export const FIRST_PAINT_CSS_MARKER = '<!-- first-paint.css -->';
/** Where index.html's boot script takes its locale settings and copy. */
export const FIRST_PAINT_CONFIG_MARKER = '{} /* first-paint:config */';

export interface FirstPaintLocales {
  locales: readonly string[];
  defaultLocale: string;
  cookieName: string;
  queryParam: string;
  /** The message file of one locale: a flat key → text JSON object. */
  messagesFile: (locale: string) => string;
}

export interface FirstPaintOptions {
  cssFile: string;
  locale: FirstPaintLocales;
}

/** Comments and runs of whitespace out: the head carries it on every page. */
export function minifyCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,])\s*/g, '$1')
    .trim();
}

function readMessages(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

/**
 * The boot script's settings: how the app resolves the locale (initLocale and
 * the Paraglide strategy), and, per locale, the copy of every `data-m` key the
 * page shows before the app loads.
 */
export function firstPaintConfig({
  html,
  locale,
}: {
  html: string;
  locale: FirstPaintLocales;
}) {
  const keys = [
    ...new Set(
      [...html.matchAll(/data-m="([^"]+)"/g)].map((match) => match[1] ?? ''),
    ),
  ];
  const messages = Object.fromEntries(
    locale.locales.map((code) => {
      const all = readMessages(locale.messagesFile(code));
      return [
        code,
        Object.fromEntries(
          keys.map((key) => {
            const text = all[key];
            if (typeof text !== 'string' || /[{}]/.test(text)) {
              throw new Error(
                `first-paint: message "${key}" in ${code} must be plain text, found ${JSON.stringify(text)}`,
              );
            }
            return [key, text];
          }),
        ),
      ];
    }),
  );
  return {
    locales: locale.locales,
    defaultLocale: locale.defaultLocale,
    cookieName: locale.cookieName,
    queryParam: locale.queryParam,
    messages,
  };
}

function replaceOnce(html: string, marker: string, value: string): string {
  const at = html.indexOf(marker);
  if (at === -1 || html.indexOf(marker, at + 1) !== -1) {
    throw new Error(`first-paint: index.html must hold ${marker} exactly once`);
  }
  return html.slice(0, at) + value + html.slice(at + marker.length);
}

export function transformFirstPaintHtml({
  html,
  options,
}: {
  html: string;
  options: FirstPaintOptions;
}): string {
  const config = JSON.stringify(
    firstPaintConfig({ html, locale: options.locale }),
  ).replace(/</g, '\\u003c');
  const css = minifyCss(readFileSync(options.cssFile, 'utf8'));
  return replaceOnce(
    replaceOnce(html, FIRST_PAINT_CONFIG_MARKER, config),
    FIRST_PAINT_CSS_MARKER,
    `<style>${css}</style>`,
  );
}

/**
 * Inlines the first-paint stylesheet (also imported by the app's CSS) and the
 * boot script's locale settings into index.html, in dev and build alike, so
 * the boot shell paints with the app's own rules and copy before any request.
 */
export function firstPaint(options: FirstPaintOptions): IndexHtmlPlugin {
  const sources = [
    options.cssFile,
    ...options.locale.locales.map(options.locale.messagesFile),
  ];
  return {
    name: 'first-paint',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return transformFirstPaintHtml({ html, options });
      },
    },
    configureServer(server) {
      // The inlined copy is index.html's, which only a reload refreshes.
      server.watcher.add(sources);
      server.watcher.on('change', (file) => {
        if (sources.includes(file)) server.ws.send({ type: 'full-reload' });
      });
    },
  };
}

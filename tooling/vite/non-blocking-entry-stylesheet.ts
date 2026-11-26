import type { IndexHtmlPlugin } from './plugin';

/** Resolves once the entry stylesheet applies (or failed); at once in dev, where JS injects the CSS. */
export const ENTRY_STYLESHEET_MODULE = 'virtual:entry-stylesheet';
const RESOLVED_MODULE = `\0${ENTRY_STYLESHEET_MODULE}`;

const ENTRY_LINK = /<link rel="stylesheet" crossorigin href="([^"]+\.css)">/g;

// onerror swaps media too, so a failed stylesheet never holds the app.
const MODULE_SOURCE = `const link = document.querySelector('link[data-entry-stylesheet]');
export const entryStylesheetLoaded =
  link && link.media === 'print'
    ? new Promise((resolve) => {
        link.addEventListener('load', () => resolve(), { once: true });
        link.addEventListener('error', () => resolve(), { once: true });
      })
    : Promise.resolve();
`;

/**
 * The built index.html's entry stylesheet loads as print (applied on load), so
 * it never holds index.html's boot shell off the screen; a preload keeps it at
 * the top of the network queue. Fails the build when the link is not exactly
 * once where expected, rather than shipping a page that blocks again.
 */
export function rewriteEntryStylesheet(html: string): string {
  const links = [...html.matchAll(ENTRY_LINK)];
  if (links.length !== 1) {
    throw new Error(
      `non-blocking-entry-stylesheet: expected one entry stylesheet link in index.html, found ${links.length}`,
    );
  }
  return html.replace(
    ENTRY_LINK,
    `<link rel="preload" as="style" crossorigin href="$1"><link rel="stylesheet" crossorigin href="$1" media="print" data-entry-stylesheet onload="this.media='all'" onerror="this.media='all'">`,
  );
}

/** The rewrite and the wait the app renders behind, in one place: main.tsx awaits `entryStylesheetLoaded`. */
export function nonBlockingEntryStylesheet(): IndexHtmlPlugin {
  return {
    name: 'non-blocking-entry-stylesheet',
    resolveId(id) {
      return id === ENTRY_STYLESHEET_MODULE ? RESOLVED_MODULE : undefined;
    },
    load(id) {
      return id === RESOLVED_MODULE ? MODULE_SOURCE : undefined;
    },
    transformIndexHtml: {
      order: 'post',
      // Only the build links the stylesheet from index.html.
      handler(html, context) {
        return context.bundle ? rewriteEntryStylesheet(html) : html;
      },
    },
  };
}

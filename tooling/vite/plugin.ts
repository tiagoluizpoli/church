/**
 * The part of Vite's plugin API the plugins here use. tooling/ resolves no
 * `vite` of its own; apps/web/vite.config.ts checks these against Vite's types.
 */
export interface IndexHtmlPlugin {
  name: string;
  transformIndexHtml: {
    order: 'pre' | 'post';
    handler(html: string, context: { bundle?: unknown }): string;
  };
  resolveId?(id: string): string | undefined;
  load?(id: string): string | undefined;
  configureServer?(server: {
    watcher: {
      add(paths: string[]): unknown;
      on(event: 'change', listener: (file: string) => void): unknown;
    };
    ws: { send(payload: { type: 'full-reload' }): void };
  }): void;
}

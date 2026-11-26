/** The deployed web app: its public origin and the SPA's built `index.html`. */
export interface WebShell {
  /** Origin visitors open, e.g. `https://app.example.org`; absolute head URLs start here. */
  readonly publicOrigin: string;
  /** The current `index.html`, read per call so a web redeploy is never stale. */
  readIndexHtml(): Promise<string>;
}

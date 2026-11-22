import type { WebShell } from '../../domain/contracts/infrastructure';

interface HttpWebShellInput {
  publicOrigin: string;
  /** Where the server reaches the web container, e.g. `http://church-web:8080`. */
  internalUrl: string;
}

/** Reads `index.html` from the web container over the Compose network. */
export class HttpWebShell implements WebShell {
  readonly publicOrigin: string;
  private readonly indexUrl: string;

  constructor({ publicOrigin, internalUrl }: HttpWebShellInput) {
    this.publicOrigin = publicOrigin;
    this.indexUrl = new URL('/index.html', internalUrl).href;
  }

  async readIndexHtml(): Promise<string> {
    const response = await fetch(this.indexUrl);
    if (!response.ok) {
      throw new Error(`Web index ${this.indexUrl} answered ${response.status}`);
    }
    return response.text();
  }
}

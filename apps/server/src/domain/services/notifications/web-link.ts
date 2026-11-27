import type { WebLinkInput } from './web-link.types';

/** The one place a deep link into the web app is built from its base URL. */
export function webLink({ baseUrl, path }: WebLinkInput): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

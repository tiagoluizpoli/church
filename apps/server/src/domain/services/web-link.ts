interface WebLinkInput {
  baseUrl: string;
  /** Starts with `/`; may carry a query. */
  path: string;
}

/** The one place a deep link into the web app is built from its base URL. */
export function webLink({ baseUrl, path }: WebLinkInput): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`;
}

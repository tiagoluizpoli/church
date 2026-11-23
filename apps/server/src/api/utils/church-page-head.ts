import type { MainAddressArea } from '../../domain/church-address';

/** What the `/{slug}` head says about the Church. */
export interface ChurchPageHeadChurch {
  slug: string;
  name: string;
  logoUrl: string | null;
  mainAddressArea: MainAddressArea | null;
}

export interface ChurchPageHeadInput {
  indexHtml: string;
  appName: string;
  publicOrigin: string;
  church: ChurchPageHeadChurch;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/** The SPA's `index.html` with its `<title>` replaced by the Church's title, description, canonical, Open Graph and Twitter tags. */
export function renderChurchPageHead({
  indexHtml,
  appName,
  publicOrigin,
  church: { slug, name, logoUrl, mainAddressArea },
}: ChurchPageHeadInput): string {
  const title = escapeHtml(`${name} | ${appName}`);
  const description = escapeHtml(
    mainAddressArea
      ? `${name} · ${mainAddressArea.city}/${mainAddressArea.uf}`
      : name,
  );
  const url = escapeHtml(new URL(`/${slug}`, publicOrigin).href);
  const image = escapeHtml(logoUrl ?? new URL('/logo.png', publicOrigin).href);
  const head = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${image}" />`,
    '<meta name="twitter:card" content="summary" />',
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
  ].join('');
  // A function replacement, so `$` in a Church name is never a replace pattern.
  return indexHtml.replace(/<title>[^<]*<\/title>/, () => head);
}

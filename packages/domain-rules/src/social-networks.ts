/** One supported network: the hosts a link may use (a leading `www.` is ignored), an optional path prefix, and the address start the menu pre-fills. */
interface SocialNetworkEntry {
  label: string;
  hosts: readonly string[];
  pathPrefix?: string;
  prefix: string;
}

/** The one data table behind Social Link detection; the menu, the row selector and the server all read it. */
export const SOCIAL_NETWORKS = {
  instagram: {
    label: 'Instagram',
    hosts: ['instagram.com'],
    prefix: 'https://instagram.com/',
  },
  youtube: {
    label: 'YouTube',
    hosts: ['youtube.com', 'm.youtube.com', 'youtu.be'],
    prefix: 'https://youtube.com/@',
  },
  facebook: {
    label: 'Facebook',
    hosts: ['facebook.com', 'm.facebook.com', 'fb.com'],
    prefix: 'https://facebook.com/',
  },
  tiktok: {
    label: 'TikTok',
    hosts: ['tiktok.com'],
    prefix: 'https://tiktok.com/@',
  },
  spotify: {
    label: 'Spotify',
    hosts: ['open.spotify.com'],
    prefix: 'https://open.spotify.com/',
  },
  x: {
    label: 'X',
    hosts: ['x.com', 'twitter.com'],
    prefix: 'https://x.com/',
  },
  threads: {
    label: 'Threads',
    hosts: ['threads.net', 'threads.com'],
    prefix: 'https://threads.com/@',
  },
  telegram: {
    label: 'Telegram',
    hosts: ['t.me', 'telegram.me'],
    prefix: 'https://t.me/',
  },
  whatsappChannel: {
    label: 'Canal do WhatsApp',
    hosts: ['whatsapp.com'],
    pathPrefix: '/channel/',
    prefix: 'https://whatsapp.com/channel/',
  },
  whatsappGroup: {
    label: 'Grupo do WhatsApp',
    hosts: ['chat.whatsapp.com'],
    prefix: 'https://chat.whatsapp.com/',
  },
  linkedin: {
    label: 'LinkedIn',
    hosts: ['linkedin.com'],
    prefix: 'https://linkedin.com/company/',
  },
  applePodcasts: {
    label: 'Apple Podcasts',
    hosts: ['podcasts.apple.com'],
    prefix: 'https://podcasts.apple.com/',
  },
  deezer: {
    label: 'Deezer',
    hosts: ['deezer.com'],
    prefix: 'https://deezer.com/',
  },
  kwai: {
    label: 'Kwai',
    hosts: ['kwai.com', 'kw.ai'],
    prefix: 'https://kwai.com/@',
  },
} as const satisfies Record<string, SocialNetworkEntry>;

export type SocialNetwork = keyof typeof SOCIAL_NETWORKS;
export const SOCIAL_NETWORK_KEYS = Object.keys(
  SOCIAL_NETWORKS,
) as SocialNetwork[];

/** Phone numbers belong with Contacts, not Social Links. */
const CONTACT_HOSTS: readonly string[] = ['wa.me', 'api.whatsapp.com'];
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

export type SocialLinkRefusal = 'INVALID' | 'UNSUPPORTED' | 'USE_CONTACT';

export type SocialNetworkDetection =
  | { network: SocialNetwork }
  | { refusal: SocialLinkRefusal };

interface DetectInput {
  url: string;
}

/** The network a link belongs to, or why it is refused. A bare address is read as `https://…`. */
export function detectSocialNetwork({
  url,
}: DetectInput): SocialNetworkDetection {
  const trimmed = url.trim();
  const full = SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (trimmed === '' || /\s/.test(trimmed) || !URL.canParse(full)) {
    return { refusal: 'INVALID' };
  }
  const { protocol, hostname, pathname } = new URL(full);
  if (protocol !== 'https:' && protocol !== 'http:') {
    return { refusal: 'INVALID' };
  }
  const host = hostname.replace(/^www\./, '');
  if (CONTACT_HOSTS.includes(host)) return { refusal: 'USE_CONTACT' };
  for (const network of SOCIAL_NETWORK_KEYS) {
    const entry: SocialNetworkEntry = SOCIAL_NETWORKS[network];
    const pathMatches = pathname.startsWith(entry.pathPrefix ?? '/');
    if (entry.hosts.includes(host) && pathMatches) return { network };
  }
  return { refusal: 'UNSUPPORTED' };
}

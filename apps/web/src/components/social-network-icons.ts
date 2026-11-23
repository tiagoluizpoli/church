import {
  Facebook,
  Instagram,
  Linkedin,
  Link as LinkIcon,
  type LucideIcon,
  MessageCircle,
  Music,
  Twitter,
  Youtube,
} from 'lucide-react';

const NETWORK_ICONS: Record<string, LucideIcon> = {
  instagram: Instagram,
  youtube: Youtube,
  facebook: Facebook,
  linkedin: Linkedin,
  x: Twitter,
  threads: MessageCircle,
  telegram: MessageCircle,
  spotify: Music,
  deezer: Music,
};

interface NetworkIconInput {
  network: string;
}

/** The icon of a Social Link's network, the plain link icon for a network without one; the settings and the public page share it. */
export function networkIcon({ network }: NetworkIconInput): LucideIcon {
  return NETWORK_ICONS[network] ?? LinkIcon;
}

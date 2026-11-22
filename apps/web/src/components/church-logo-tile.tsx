import { cn } from '@/lib/utils';

/** The platform logo, read from here only so a brand swap is one change. */
export const PLATFORM_LOGO_SRC = '/logo.png';

interface ChurchLogoTileProps {
  name: string;
  logoUrl: string | null;
  /** `collapsed`: the 64 px sidebar, so a wide logo narrows instead of being cut off. */
  size: 'desktop' | 'mobile' | 'collapsed';
  className?: string;
}

/**
 * A Church's logo on a near-white tile with a hairline border, in light and
 * dark mode alike, so dark, transparent or loud logos stay legible. The logo
 * is contained at a fixed height — never cropped, stretched or recoloured —
 * and a Church without one shows the platform logo on the same tile.
 */
export function ChurchLogoTile({
  name,
  logoUrl,
  size,
  className,
}: ChurchLogoTileProps) {
  return (
    <span
      data-testid="church-logo-tile"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border border-black/10 bg-white p-1',
        className,
      )}
    >
      <img
        src={logoUrl ?? PLATFORM_LOGO_SRC}
        // The Church's name even on the platform fallback: the collapsed sidebar shows no name beside it.
        alt={name}
        className={cn(
          'w-auto object-contain',
          size === 'collapsed' ? 'max-w-9' : 'max-w-32',
          size === 'mobile' ? 'h-7' : 'h-8',
        )}
      />
    </span>
  );
}

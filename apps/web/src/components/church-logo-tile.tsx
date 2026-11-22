import { cn } from '@/lib/utils';

/** The platform logo, read from here only so a brand swap is one change. */
export const PLATFORM_LOGO_SRC = '/logo.png';

interface ChurchLogoTileProps {
  name: string;
  logoUrl: string | null;
  size: 'desktop' | 'mobile';
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
        // The name is written beside the tile, so the platform fallback adds nothing for a screen reader.
        alt={logoUrl ? name : ''}
        className={cn(
          'w-auto max-w-32 object-contain',
          size === 'desktop' ? 'h-8' : 'h-7',
        )}
      />
    </span>
  );
}

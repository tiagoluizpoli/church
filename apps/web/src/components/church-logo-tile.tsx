import { cn } from '@/lib/utils';

/** The platform logo, read from here only so a brand swap is one change. */
export const PLATFORM_LOGO_SRC = '/logo.png';

interface ChurchLogoTileProps {
  name: string;
  logoUrl: string | null;
  /** `collapsed`: the 64 px sidebar, so the 4:3 box stays inside it. */
  size: 'desktop' | 'mobile' | 'collapsed';
  className?: string;
}

/**
 * A Church's logo on a near-white tile with a hairline border, in light and
 * dark mode alike, so dark, transparent or loud logos stay legible. The tile is
 * always a 4:3 box (uploads are 1:1 to 4:3); the logo is contained inside it —
 * never cropped, stretched or recoloured — so a legacy logo outside that range
 * is letterboxed, never a strip. A Church without one shows the platform logo.
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
        'inline-flex aspect-[4/3] shrink-0 items-center justify-center rounded-md border border-black/10 bg-white p-1',
        size === 'desktop' ? 'h-10' : 'h-9',
        className,
      )}
    >
      <img
        src={logoUrl ?? PLATFORM_LOGO_SRC}
        // The Church's name even on the platform fallback: the collapsed sidebar shows no name beside it.
        alt={name}
        className="size-full object-contain"
      />
    </span>
  );
}

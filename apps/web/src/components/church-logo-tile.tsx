import { m } from '@church/i18n/messages';
import { cn } from '@/lib/utils';
import { formatVolunteerInitials } from '@/utils/format-volunteer-initials';

/**
 * THE framing rule, in one place. `false` (the trial): the frame follows the
 * logo's own shape, 1:1 to 4:3 by its natural aspect. `true`: every logo sits in
 * a fixed 4:3 frame, cover-cropped.
 */
const FIXED_4_3_FRAME = false;

interface ChurchLogoTileProps {
  name: string;
  logoUrl: string | null;
  /** `collapsed`: the 64 px sidebar; `card`: the settings logo card. */
  size: 'desktop' | 'mobile' | 'collapsed' | 'card';
  className?: string;
}

/** Fixed height per size, with the width bounds 1:1 (min) to 4:3 (max) of it. */
const SIZES = {
  desktop: { height: 'h-10', width: 'min-w-10 max-w-[3.33rem]' },
  mobile: { height: 'h-9', width: 'min-w-9 max-w-[3rem]' },
  collapsed: { height: 'h-9', width: 'min-w-9 max-w-[3rem]' },
  card: { height: 'h-32', width: 'min-w-32 max-w-[10.67rem]' },
} as const;

/**
 * A Church's logo as itself: no tile, border or padding, rounded corners, and
 * cover-fit so a logo outside 1:1..4:3 is trimmed, never letterboxed. A Church
 * without one shows its initials on a neutral surface.
 */
export function ChurchLogoTile({
  name,
  logoUrl,
  size,
  className,
}: ChurchLogoTileProps) {
  const { height, width } = SIZES[size];
  const frame = cn(
    'radius-control inline-flex shrink-0 overflow-hidden',
    height,
    FIXED_4_3_FRAME ? 'aspect-[4/3]' : null,
    className,
  );
  if (!logoUrl) {
    return (
      <span
        data-testid="church-logo-tile"
        role="img"
        aria-label={name || m.church_settings_logo_alt()}
        className={cn(
          frame,
          'aspect-square items-center justify-center bg-muted font-semibold text-muted-foreground text-sm',
        )}
      >
        {formatVolunteerInitials({ volunteerName: name })}
      </span>
    );
  }
  return (
    <span data-testid="church-logo-tile" className={frame}>
      <img
        src={logoUrl}
        // The Church's name: the collapsed sidebar shows no name beside it.
        alt={name}
        className={cn(
          'h-full object-cover',
          FIXED_4_3_FRAME ? 'size-full' : cn('w-auto', width),
        )}
      />
    </span>
  );
}

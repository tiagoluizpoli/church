interface AccentTextColorInput {
  accentColor: string;
}

// WCAG 2 relative luminance and contrast (sRGB transfer and channel weights).
const CHANNEL_MAX = 255;
const SRGB_LINEAR_CUTOFF = 0.03928;
const SRGB_LINEAR_SLOPE = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;
const RED_WEIGHT = 0.2126;
const GREEN_WEIGHT = 0.7152;
const BLUE_WEIGHT = 0.0722;
const CONTRAST_FLARE = 0.05;
const WHITE_LUMINANCE = 1;
/** Where `#rrggbb` holds the red, green and blue pairs. */
const CHANNEL_OFFSETS = [1, 3, 5];
const HEX_PAIR = 2;
const HEX_RADIX = 16;

function channelLuminance(channel: number): number {
  const value = channel / CHANNEL_MAX;
  return value <= SRGB_LINEAR_CUTOFF
    ? value / SRGB_LINEAR_SLOPE
    : ((value + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
}

/**
 * White or near-black text on the accent, whichever contrasts more. Mirrors the
 * server's `accentTextColor` (apps/server/src/domain/church-settings.ts) for the live preview.
 */
export function accentTextColor({
  accentColor,
}: AccentTextColorInput): '#ffffff' | '#111111' {
  const [red = 0, green = 0, blue = 0] = CHANNEL_OFFSETS.map((start) => {
    const pair = accentColor.slice(start, start + HEX_PAIR);
    return channelLuminance(Number.parseInt(pair, HEX_RADIX));
  });
  const luminance =
    RED_WEIGHT * red + GREEN_WEIGHT * green + BLUE_WEIGHT * blue;
  const onWhite =
    (WHITE_LUMINANCE + CONTRAST_FLARE) / (luminance + CONTRAST_FLARE);
  const onBlack = (luminance + CONTRAST_FLARE) / CONTRAST_FLARE;
  return onWhite >= onBlack ? '#ffffff' : '#111111';
}

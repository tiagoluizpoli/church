interface AccentTextColorInput {
  accentColor: string;
}

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/**
 * White or near-black text on the accent, whichever contrasts more. Mirrors the
 * server's `accentTextColor` (apps/server/src/domain/church-settings.ts) for the live preview.
 */
export function accentTextColor({
  accentColor,
}: AccentTextColorInput): '#ffffff' | '#111111' {
  const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((start) =>
    channelLuminance(Number.parseInt(accentColor.slice(start, start + 2), 16)),
  );
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  return 1.05 / (luminance + 0.05) >= (luminance + 0.05) / 0.05
    ? '#ffffff'
    : '#111111';
}

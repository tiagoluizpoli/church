/** Accent colours for email, as `#rrggbb`. Pure; the layout draws with them. */

const MIN_RULE_CONTRAST = 3;
const TINT_SHARE = 0.1;
const DARKEN_FACTOR = 0.9;
const CHANNEL_MAX = 255;
const SRGB_LINEAR_CUTOFF = 0.03928;

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const channel = (start: number) =>
    Number.parseInt(hex.slice(start, start + 2), 16);
  return [channel(1), channel(3), channel(5)];
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(rgb: Rgb): number {
  const [red, green, blue] = rgb.map((value) => {
    const share = value / CHANNEL_MAX;
    return share <= SRGB_LINEAR_CUTOFF
      ? share / 12.92
      : ((share + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

/** WCAG contrast ratio of a colour against white. */
export function contrastOnWhite(hex: string): number {
  return 1.05 / (luminance(toRgb(hex)) + 0.05);
}

/** The accent as a line on white: darkened until it reaches 3:1. */
export function emailAccentRule(accent: string): string {
  let rgb = toRgb(accent);
  while (contrastOnWhite(toHex(rgb)) < MIN_RULE_CONTRAST) {
    rgb = rgb.map((value) => value * DARKEN_FACTOR) as Rgb;
  }
  return toHex(rgb);
}

/** 10% of the accent over white: always light enough for dark text. */
export function emailAccentTint(accent: string): string {
  return toHex(
    toRgb(accent).map(
      (value) => CHANNEL_MAX - (CHANNEL_MAX - value) * TINT_SHARE,
    ) as Rgb,
  );
}

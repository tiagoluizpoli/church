import { describe, expect, it } from 'vitest';
import { accentTextColor } from '@/features/church-settings/accent-text-color';

// The same cases pin the server's `accentTextColor` (apps/server tests/domain/church-settings.test.ts).
describe('Text on the accent colour', () => {
  it.each([
    ['#000000', '#ffffff'],
    ['#1d4ed8', '#ffffff'],
    ['#334155', '#ffffff'],
    ['#b91c1c', '#ffffff'],
    ['#ffffff', '#111111'],
    ['#facc15', '#111111'],
    ['#22d3ee', '#111111'],
  ])('puts readable text on %s', (accentColor, text) => {
    expect(accentTextColor({ accentColor })).toBe(text);
  });
});

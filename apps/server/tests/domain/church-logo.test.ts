import { describe, expect, it } from 'vitest';
import { ChurchId } from '@/domain/branded-ids';
import {
  churchLogoKey,
  detectLogoFormat,
  isChurchLogoKey,
  logoDimensionRefusal,
} from '@/domain/church-logo';

const CHURCH = ChurchId.from('11111111-1111-4111-8111-111111111111');
const HASH = 'a'.repeat(64);

function bytes(...values: (number | string)[]): Uint8Array {
  return Uint8Array.from(
    values.flatMap((value) =>
      typeof value === 'string'
        ? [...value].map((char) => char.charCodeAt(0))
        : [value],
    ),
  );
}

describe('detectLogoFormat', () => {
  it.each([
    ['png', bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0)],
    ['jpeg', bytes(0xff, 0xd8, 0xff, 0xe0)],
    ['webp', bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 ')],
  ])('recognises %s by its magic bytes', (format, input) => {
    expect(detectLogoFormat({ bytes: input })).toBe(format);
  });

  it.each([
    ['GIF', bytes('GIF89a')],
    ['SVG', bytes('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['a RIFF that is not WebP', bytes('RIFF', 0, 0, 0, 0, 'WAVE')],
    ['nothing', bytes()],
  ])('refuses %s', (_label, input) => {
    expect(detectLogoFormat({ bytes: input })).toBeNull();
  });
});

describe('logoDimensionRefusal', () => {
  it.each([
    [128, 128, null],
    [512, 384, null],
    [400, 300, null],
    [127, 100, 'LOGO_TOO_SMALL'],
    [100, 127, 'LOGO_TOO_SMALL'],
    [401, 300, 'LOGO_BAD_ASPECT_RATIO'],
    [300, 301, 'LOGO_BAD_ASPECT_RATIO'],
    [512, 128, 'LOGO_BAD_ASPECT_RATIO'],
  ])('%i×%i → %s', (width, height, refusal) => {
    expect(logoDimensionRefusal({ width, height })).toBe(refusal);
  });
});

describe('Church logo keys', () => {
  it('lives under the Church folder, named by the content hash', () => {
    expect(churchLogoKey({ churchId: CHURCH, sha256: HASH })).toBe(
      `public/churches/${CHURCH}/logo/${HASH}.png`,
    );
  });

  it.each([
    [`public/churches/${CHURCH}/logo/${HASH}.png`, true],
    [
      `public/churches/22222222-2222-4222-8222-222222222222/logo/${HASH}.png`,
      false,
    ],
    [`public/churches/${CHURCH}/logo/../other/${HASH}.png`, false],
    [`public/churches/${CHURCH}/logo/${HASH}.svg`, false],
  ])('%s is the Church’s logo key: %s', (key, expected) => {
    expect(isChurchLogoKey({ churchId: CHURCH, key })).toBe(expected);
  });
});

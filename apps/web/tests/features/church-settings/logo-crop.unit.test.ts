import { describe, expect, it } from 'vitest';
import {
  cropRect,
  initialCrop,
  isLogoShape,
  outputSize,
  settleCrop,
} from '@/features/church-settings/logo-crop';

const WIDE = { width: 1000, height: 500 };

describe('initialCrop', () => {
  it.each([
    ['a 2:1 image', WIDE, 4 / 3],
    ['a tall image', { width: 300, height: 600 }, 1],
    ['an image already 5:4', { width: 500, height: 400 }, 5 / 4],
  ])('frames %s at the nearest allowed shape, whole height or width in view', (_label, image, aspect) => {
    const crop = initialCrop({ image });

    expect(crop.aspect).toBeCloseTo(aspect);
    const rect = cropRect({ image, crop });
    expect(rect.x).toBeCloseTo((image.width - rect.width) / 2);
    expect(rect.y).toBeCloseTo((image.height - rect.height) / 2);
    expect(Math.max(rect.width / image.width, rect.height / image.height)).toBe(
      1,
    );
  });
});

describe('settleCrop', () => {
  it('keeps the shape between square and 4:3', () => {
    const crop = initialCrop({ image: WIDE });

    expect(
      settleCrop({ image: WIDE, crop: { ...crop, aspect: 2 } }).aspect,
    ).toBe(4 / 3);
    expect(
      settleCrop({ image: WIDE, crop: { ...crop, aspect: 0.5 } }).aspect,
    ).toBe(1);
  });

  it('never pans past the image edge', () => {
    const crop = initialCrop({ image: WIDE });

    const rect = cropRect({
      image: WIDE,
      crop: settleCrop({ image: WIDE, crop: { ...crop, centerX: 5000 } }),
    });

    expect(rect.x + rect.width).toBeCloseTo(1000);
  });

  it('zooms from the whole fit up to 4×, never under a 128 px wide crop', () => {
    const crop = initialCrop({ image: WIDE });

    expect(settleCrop({ image: WIDE, crop: { ...crop, zoom: 0.5 } }).zoom).toBe(
      1,
    );
    expect(settleCrop({ image: WIDE, crop: { ...crop, zoom: 9 } }).zoom).toBe(
      4,
    );
    const small = { width: 200, height: 200 };
    expect(
      settleCrop({
        image: small,
        crop: { ...initialCrop({ image: small }), zoom: 4 },
      }).zoom,
    ).toBeCloseTo(200 / 128);
  });
});

describe('outputSize', () => {
  it('caps the longest side at 512 px and stays within 1:1–4:3 after rounding', () => {
    expect(
      outputSize({ rect: { x: 0, y: 0, width: 666.67, height: 500 } }),
    ).toEqual({ width: 512, height: 384 });
    for (let width = 128; width <= 700; width += 7.3) {
      for (const aspect of [1, 1.1, 1.25, 4 / 3]) {
        const size = outputSize({
          rect: { x: 0, y: 0, width, height: width / aspect },
        });
        expect(isLogoShape(size)).toBe(true);
        expect(size.width).toBeLessThanOrEqual(512);
      }
    }
  });
});

describe('isLogoShape', () => {
  it.each([
    [400, 300, true],
    [300, 300, true],
    [401, 300, false],
    [300, 301, false],
  ])('%i×%i → %s', (width, height, expected) => {
    expect(isLogoShape({ width, height })).toBe(expected);
  });
});

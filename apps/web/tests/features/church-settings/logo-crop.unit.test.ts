import { describe, expect, it } from 'vitest';
import {
  cropRect,
  fillColor,
  hasTransparency,
  initialCrop,
  LOGO_SHAPES,
  logoLayout,
  maxZoom,
  nearestShape,
  outputSize,
  type Size,
  settleCrop,
  stageLayout,
} from '@/features/church-settings/logo-crop';

const WIDE = { width: 1000, height: 500 };

/** The server's rule: square to 4:3 landscape. */
function isLogoShape({ width, height }: Size): boolean {
  return width >= height && 3 * width <= 4 * height;
}

describe('nearestShape', () => {
  it.each([
    ['a 2:1 image', WIDE, 'landscape'],
    ['a 4:3 image', { width: 400, height: 300 }, 'landscape'],
    ['a 5:4 image', { width: 500, height: 400 }, 'landscape'],
    ['an image just wider than square', { width: 110, height: 100 }, 'square'],
    ['a tall image', { width: 300, height: 600 }, 'square'],
  ] as const)('picks %s → %s', (_label, image, shape) => {
    expect(nearestShape({ image })).toBe(shape);
  });
});

describe('initialCrop', () => {
  it.each([
    ['a 2:1 image at 4:3', WIDE, 'landscape'],
    ['a tall image square', { width: 300, height: 600 }, 'square'],
    ['a 5:4 image at 4:3', { width: 500, height: 400 }, 'landscape'],
  ] as const)('frames %s, centred, whole height or width in view', (_label, image, shape) => {
    const crop = initialCrop({ image, shape });

    expect(crop.aspect).toBe(LOGO_SHAPES[shape]);
    expect(crop.zoom).toBe(1);
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
    const crop = initialCrop({ image: WIDE, shape: 'landscape' });

    expect(
      settleCrop({ image: WIDE, crop: { ...crop, aspect: 2 } }).aspect,
    ).toBe(4 / 3);
    expect(
      settleCrop({ image: WIDE, crop: { ...crop, aspect: 0.5 } }).aspect,
    ).toBe(1);
  });

  it('never pans past the image edge', () => {
    const crop = initialCrop({ image: WIDE, shape: 'landscape' });

    const rect = cropRect({
      image: WIDE,
      crop: settleCrop({ image: WIDE, crop: { ...crop, centerX: 5000 } }),
    });

    expect(rect.x + rect.width).toBeCloseTo(1000);
  });

  it('zooms from the whole fit up to 4×, never under a 128 px wide crop', () => {
    const crop = initialCrop({ image: WIDE, shape: 'landscape' });

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
        crop: { ...initialCrop({ image: small, shape: 'square' }), zoom: 4 },
      }).zoom,
    ).toBeCloseTo(200 / 128);
  });
});

describe('maxZoom', () => {
  it('is 1 for an image too small to zoom', () => {
    const tiny = { width: 120, height: 100 };

    expect(
      maxZoom({
        image: tiny,
        crop: initialCrop({ image: tiny, shape: 'landscape' }),
      }),
    ).toBe(1);
  });
});

describe('outputSize', () => {
  it('caps the longest side at 512 px and stays within 1:1–4:3 after rounding', () => {
    expect(outputSize({ rect: { width: 666.67, height: 500 } })).toEqual({
      width: 512,
      height: 384,
    });
    for (let width = 128; width <= 700; width += 7.3) {
      for (const aspect of [1, 1.1, 1.25, 4 / 3]) {
        const size = outputSize({ rect: { width, height: width / aspect } });
        expect(isLogoShape(size)).toBe(true);
        expect(size.width).toBeLessThanOrEqual(512);
      }
    }
  });

  it('caps at a smaller side for previews', () => {
    expect(
      outputSize({ rect: { width: 666.67, height: 500 }, maxSide: 128 }),
    ).toEqual({ width: 128, height: 96 });
  });
});

describe('logoLayout', () => {
  it('covers: the crop fills the whole canvas', () => {
    const crop = initialCrop({ image: WIDE, shape: 'landscape' });

    const layout = logoLayout({ image: WIDE, crop, letterbox: false });

    expect(layout.size).toEqual({ width: 512, height: 384 });
    expect(layout.source.width).toBeCloseTo(500 * (4 / 3));
    expect(layout.target).toEqual({ x: 0, y: 0, width: 512, height: 384 });
  });

  it('letterboxes a wide wordmark: the whole image, bars above and below', () => {
    const banner = { width: 1600, height: 400 };
    const crop = initialCrop({ image: banner, shape: 'landscape' });

    const layout = logoLayout({ image: banner, crop, letterbox: true });

    expect(layout.size).toEqual({ width: 512, height: 384 });
    expect(layout.source).toEqual({ x: 0, y: 0, width: 1600, height: 400 });
    expect(layout.target.x).toBe(0);
    expect(layout.target.width).toBe(512);
    expect(layout.target.height).toBe(128);
    expect(layout.target.y).toBe(128);
  });

  it('letterboxes a tall image: bars left and right, in a square', () => {
    const portrait = { width: 300, height: 600 };
    const crop = initialCrop({ image: portrait, shape: 'square' });

    const layout = logoLayout({ image: portrait, crop, letterbox: true });

    expect(layout.size).toEqual({ width: 512, height: 512 });
    expect(layout.target).toEqual({ x: 128, y: 0, width: 256, height: 512 });
  });

  it('ignores zoom and pan when letterboxed', () => {
    const crop = {
      ...initialCrop({ image: WIDE, shape: 'landscape' }),
      zoom: 3,
      centerX: 100,
    };

    const layout = logoLayout({ image: WIDE, crop, letterbox: true });

    expect(layout.source).toEqual({ x: 0, y: 0, ...WIDE });
    expect(layout.target.width).toBe(512);
  });

  it('keeps a small image at its own pixels, within the shape', () => {
    const tiny = { width: 160, height: 130 };
    const crop = initialCrop({ image: tiny, shape: 'landscape' });

    const layout = logoLayout({ image: tiny, crop, letterbox: true });

    expect(isLogoShape(layout.size)).toBe(true);
    expect(layout.size.height).toBe(130);
    expect(layout.target.height).toBeCloseTo(130);
  });
});

describe('fillColor', () => {
  it.each([
    ['white', '#c2410c', '#ffffff'],
    ['accent', '#c2410c', '#c2410c'],
    ['accent', null, null],
    ['transparent', '#c2410c', null],
  ] as const)('%s with accent %s → %s', (fill, accentColor, expected) => {
    expect(fillColor({ fill, accentColor })).toBe(expected);
  });
});

describe('hasTransparency', () => {
  it('finds a pixel under full opacity', () => {
    expect(
      hasTransparency({
        data: new Uint8ClampedArray([0, 0, 0, 255, 9, 9, 9, 254]),
      }),
    ).toBe(true);
    expect(
      hasTransparency({
        data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]),
      }),
    ).toBe(false);
  });
});

describe('stageLayout', () => {
  it('shows the whole wide image at zoom 1, the frame centred over its middle', () => {
    const crop = initialCrop({ image: WIDE, shape: 'landscape' });

    const { frame, image } = stageLayout({
      image: WIDE,
      crop,
      letterbox: false,
      stageAspect: 4 / 3,
    });

    expect(image.x).toBeCloseTo(0);
    expect(image.width).toBeCloseTo(1);
    expect(image.y).toBeCloseTo(frame.y);
    expect(image.height).toBeCloseTo(frame.height);
    expect(frame.x + frame.width / 2).toBeCloseTo(0.5);
  });

  it('keeps the frame size while zooming; the image grows behind it', () => {
    const crop = initialCrop({ image: WIDE, shape: 'landscape' });

    const unzoomed = stageLayout({
      image: WIDE,
      crop,
      letterbox: false,
      stageAspect: 4 / 3,
    });
    const zoomed = stageLayout({
      image: WIDE,
      crop: settleCrop({ image: WIDE, crop: { ...crop, zoom: 2 } }),
      letterbox: false,
      stageAspect: 4 / 3,
    });

    expect(zoomed.frame).toEqual(unzoomed.frame);
    expect(zoomed.image.width).toBeCloseTo(unzoomed.image.width * 2);
  });

  it('never lets the frame fill the stage or shrink under 40 %', () => {
    const fits = { width: 400, height: 300 };
    const banner = { width: 4000, height: 300 };

    const full = stageLayout({
      image: fits,
      crop: initialCrop({ image: fits, shape: 'landscape' }),
      letterbox: false,
      stageAspect: 4 / 3,
    });
    const narrow = stageLayout({
      image: banner,
      crop: initialCrop({ image: banner, shape: 'landscape' }),
      letterbox: false,
      stageAspect: 4 / 3,
    });

    expect(full.frame.width).toBeCloseTo(0.8);
    expect(narrow.frame.width).toBeCloseTo(0.4);
  });
});

describe('stageLayout, letterboxed', () => {
  it('holds the whole wide image inside the largest frame, centred', () => {
    const banner = { width: 1600, height: 400 };
    const crop = initialCrop({ image: banner, shape: 'landscape' });

    const { frame, image } = stageLayout({
      image: banner,
      crop,
      letterbox: true,
      stageAspect: 4 / 3,
    });

    expect(frame.width).toBeCloseTo(0.8);
    expect(frame.height).toBeCloseTo(0.8);
    expect(image.x).toBeCloseTo(frame.x);
    expect(image.width).toBeCloseTo(frame.width);
    expect(image.y + image.height / 2).toBeCloseTo(0.5);
    expect(image.height).toBeLessThan(frame.height);
  });
});

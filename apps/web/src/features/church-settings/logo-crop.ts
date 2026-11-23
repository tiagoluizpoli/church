/** Framing a logo in the browser: square to 4:3 landscape, the server's rule (owner, 2026-11-22). */
export const MIN_ASPECT = 1;
export const MAX_ASPECT = 4 / 3;
const MAX_ZOOM = 4;
/** The server's minimum longest side: zooming never frames less. */
const MIN_CROP_WIDTH = 128;
/** The server stores at most 512 px; sending more only costs bandwidth. */
const OUTPUT_MAX_SIDE = 512;

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/** Shape (width/height), zoom (1 = the largest crop that fits) and centre in image pixels. */
export interface Crop {
  aspect: number;
  zoom: number;
  centerX: number;
  centerY: number;
}

interface ImageInput {
  image: Size;
}

interface CropInput extends ImageInput {
  crop: Crop;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** The source rectangle a crop takes from the image, always inside it. */
export function cropRect({ image, crop }: CropInput): Rect {
  const fitWidth = Math.min(image.width, image.height * crop.aspect);
  const width = fitWidth / crop.zoom;
  const height = width / crop.aspect;
  return {
    x: clamp(crop.centerX - width / 2, 0, image.width - width),
    y: clamp(crop.centerY - height / 2, 0, image.height - height),
    width,
    height,
  };
}

/** Brings shape and zoom into range and the centre back inside the image. */
export function settleCrop({ image, crop }: CropInput): Crop {
  const aspect = clamp(crop.aspect, MIN_ASPECT, MAX_ASPECT);
  const fitWidth = Math.min(image.width, image.height * aspect);
  const maxZoom = clamp(fitWidth / MIN_CROP_WIDTH, 1, MAX_ZOOM);
  const settled = { ...crop, aspect, zoom: clamp(crop.zoom, 1, maxZoom) };
  const rect = cropRect({ image, crop: settled });
  return {
    ...settled,
    centerX: rect.x + rect.width / 2,
    centerY: rect.y + rect.height / 2,
  };
}

/** The image's own shape when allowed, else the nearest one, centred and whole. */
export function initialCrop({ image }: ImageInput): Crop {
  return settleCrop({
    image,
    crop: {
      aspect: image.width / image.height,
      zoom: 1,
      centerX: image.width / 2,
      centerY: image.height / 2,
    },
  });
}

export function isLogoShape({ width, height }: Size): boolean {
  return width >= height && 3 * width <= 4 * height;
}

interface OutputSizeInput {
  rect: Rect;
}

/** Whole pixels, longest side ≤512, still within 1:1–4:3 after rounding. */
export function outputSize({ rect }: OutputSizeInput): Size {
  const scale = Math.min(1, OUTPUT_MAX_SIDE / rect.width);
  const width = Math.round(rect.width * scale);
  const height = Math.min(width, Math.round(rect.height * scale));
  return { width: Math.min(width, Math.floor((4 * height) / 3)), height };
}

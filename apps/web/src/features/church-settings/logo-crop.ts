/** Framing a logo in the browser: square to 4:3 landscape, the server's rule (owner, 2026-11-22). */
export const MIN_ASPECT = 1;
export const MAX_ASPECT = 4 / 3;
/** The two frames the admin picks from (owner, 2026-11-24). */
export const LOGO_SHAPES = { square: MIN_ASPECT, landscape: MAX_ASPECT };
export type LogoShape = keyof typeof LOGO_SHAPES;
/** Shapes nearer square than this (the geometric midpoint) start square. */
const SHAPE_MIDPOINT = Math.sqrt(MIN_ASPECT * MAX_ASPECT);
const MAX_ZOOM = 4;
/** The server's minimum longest side: zooming never frames less. */
const MIN_CROP_WIDTH = 128;
/** The server stores at most 512 px; sending more only costs bandwidth. */
export const OUTPUT_MAX_SIDE = 512;
/** The crop frame's largest share of the editor stage, leaving dimmed room around it. */
const FRAME_MAX_SHARE = 0.8;
/** Below this share a very wide image overflows the stage instead of shrinking the frame further. */
const FRAME_MIN_SHARE = 0.4;
const WHITE = '#ffffff';
/** RGBA: every fourth byte, from index 3, is alpha. */
const RGBA_CHANNELS = 4;
const ALPHA_INDEX = 3;
const OPAQUE = 255;

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

/** What paints the frame behind the logo: letterbox bars and any transparent pixels. */
export type LogoFill = 'transparent' | 'white' | 'accent';

interface ImageInput {
  image: Size;
}

interface CropInput extends ImageInput {
  crop: Crop;
}

interface ClampInput {
  value: number;
  min: number;
  max: number;
}

const clamp = ({ value, min, max }: ClampInput) =>
  Math.min(max, Math.max(min, value));

/** The source rectangle a crop takes from the image, always inside it. */
export function cropRect({ image, crop }: CropInput): Rect {
  const fitWidth = Math.min(image.width, image.height * crop.aspect);
  const width = fitWidth / crop.zoom;
  const height = width / crop.aspect;
  return {
    x: clamp({
      value: crop.centerX - width / 2,
      min: 0,
      max: image.width - width,
    }),
    y: clamp({
      value: crop.centerY - height / 2,
      min: 0,
      max: image.height - height,
    }),
    width,
    height,
  };
}

/** The deepest zoom a shape allows: 1 when the image is too small to zoom at all. */
export function maxZoom({ image, crop }: CropInput): number {
  const fitWidth = Math.min(image.width, image.height * crop.aspect);
  return clamp({ value: fitWidth / MIN_CROP_WIDTH, min: 1, max: MAX_ZOOM });
}

/** Brings shape and zoom into range and the centre back inside the image. */
export function settleCrop({ image, crop }: CropInput): Crop {
  const aspect = clamp({
    value: crop.aspect,
    min: MIN_ASPECT,
    max: MAX_ASPECT,
  });
  const deepest = maxZoom({ image, crop: { ...crop, aspect } });
  const settled = {
    ...crop,
    aspect,
    zoom: clamp({ value: crop.zoom, min: 1, max: deepest }),
  };
  const rect = cropRect({ image, crop: settled });
  return {
    ...settled,
    centerX: rect.x + rect.width / 2,
    centerY: rect.y + rect.height / 2,
  };
}

/** The frame nearest the image's own shape. */
export function nearestShape({ image }: ImageInput): LogoShape {
  return image.width / image.height >= SHAPE_MIDPOINT ? 'landscape' : 'square';
}

interface InitialCropInput extends ImageInput {
  shape: LogoShape;
}

/** The whole fit of a shape, centred, unzoomed: the start and the reset. */
export function initialCrop({ image, shape }: InitialCropInput): Crop {
  return settleCrop({
    image,
    crop: {
      aspect: LOGO_SHAPES[shape],
      zoom: 1,
      centerX: image.width / 2,
      centerY: image.height / 2,
    },
  });
}

interface OutputSizeInput {
  rect: Size;
  maxSide?: number;
}

/** Whole pixels, longest side ≤ `maxSide` (512), still within 1:1–4:3 after rounding. */
export function outputSize({
  rect,
  maxSide = OUTPUT_MAX_SIDE,
}: OutputSizeInput): Size {
  const scale = Math.min(1, maxSide / rect.width);
  const width = Math.round(rect.width * scale);
  const height = Math.min(width, Math.round(rect.height * scale));
  return { width: Math.min(width, Math.floor((4 * height) / 3)), height };
}

interface LogoLayoutInput extends CropInput {
  /** "Mostrar o logo inteiro": the whole image, padded to the frame's shape. */
  letterbox: boolean;
  maxSide?: number;
}

/** How the PNG is drawn: canvas size, the image part taken, and where it lands. */
export interface LogoLayout {
  size: Size;
  source: Rect;
  target: Rect;
}

interface CentreInput {
  size: Size;
  outer: Size;
}

const centre = ({ size, outer }: CentreInput): Rect => ({
  x: (outer.width - size.width) / 2,
  y: (outer.height - size.height) / 2,
  ...size,
});

interface ContainInput {
  inner: Size;
  outer: Size;
}

/** `inner`'s shape scaled to fit inside `outer`, centred. */
function contain({ inner, outer }: ContainInput): Rect {
  const scale = Math.min(
    outer.width / inner.width,
    outer.height / inner.height,
  );
  const size = { width: inner.width * scale, height: inner.height * scale };
  return centre({ size, outer });
}

/**
 * Cover (the default) draws the crop over the whole canvas. Letterbox draws
 * the whole image contained in a frame of the crop's shape, centred, so the
 * bars (painted with the fill) sit on the two sides the image does not reach.
 */
export function logoLayout({
  image,
  crop,
  letterbox,
  maxSide,
}: LogoLayoutInput): LogoLayout {
  if (!letterbox) {
    const source = cropRect({ image, crop });
    const size = outputSize({ rect: source, maxSide });
    return { size, source, target: { x: 0, y: 0, ...size } };
  }
  const frame =
    image.width / image.height > crop.aspect
      ? { width: image.width, height: image.width / crop.aspect }
      : { width: image.height * crop.aspect, height: image.height };
  const size = outputSize({ rect: frame, maxSide });
  return {
    size,
    source: { x: 0, y: 0, ...image },
    target: contain({ inner: image, outer: size }),
  };
}

interface FillColorInput {
  fill: LogoFill;
  /** The Church's accent as `#rrggbb`, or null when it has none. */
  accentColor: string | null;
}

/** The colour painted under the logo, or null to keep it transparent. */
export function fillColor({
  fill,
  accentColor,
}: FillColorInput): string | null {
  if (fill === 'white') return WHITE;
  if (fill === 'accent') return accentColor;
  return null;
}

interface PixelsInput {
  /** RGBA bytes, as `ImageData.data`. */
  data: Uint8ClampedArray;
}

/** Whether any pixel is less than fully opaque. */
export function hasTransparency({ data }: PixelsInput): boolean {
  for (let index = ALPHA_INDEX; index < data.length; index += RGBA_CHANNELS)
    if ((data[index] ?? OPAQUE) < OPAQUE) return true;
  return false;
}

/** Frame and image as shares (0–1) of the editor stage's width and height. */
export interface StageLayout {
  frame: Rect;
  image: Rect;
}

interface StageLayoutInput extends CropInput {
  letterbox: boolean;
  /** The stage's width/height. */
  stageAspect: number;
}

interface StageFrameInput extends CropInput {
  stage: Size;
}

/**
 * The frame, in stage-width units: one size while zooming (the image grows
 * behind it), sized so the whole image fits the stage at zoom 1, between 40 %
 * and 80 % of the stage so it neither swamps nor vanishes.
 */
function stageFrame({ image, crop, stage }: StageFrameInput): Rect {
  const fit = cropRect({ image, crop: { ...crop, zoom: 1 } });
  const wholeImage =
    contain({ inner: image, outer: stage }).width / image.width;
  const largest = contain({ inner: fit, outer: stage }).width / fit.width;
  const scale = clamp({
    value: wholeImage,
    min: largest * FRAME_MIN_SHARE,
    max: largest * FRAME_MAX_SHARE,
  });
  const size = { width: fit.width * scale, height: fit.height * scale };
  return centre({ size, outer: stage });
}

/**
 * The editor stage: the frame fixed in the middle, the whole image around it
 * (dimmed by the editor where the crop leaves it out). Letterboxed, the frame
 * takes the largest share and holds the whole image, centred.
 */
export function stageLayout({
  image,
  crop,
  letterbox,
  stageAspect,
}: StageLayoutInput): StageLayout {
  const stage = { width: 1, height: 1 / stageAspect };
  let frame: Rect;
  let shown: Rect;
  if (letterbox) {
    const largest = contain({
      inner: { width: crop.aspect, height: 1 },
      outer: stage,
    });
    const size = {
      width: largest.width * FRAME_MAX_SHARE,
      height: largest.height * FRAME_MAX_SHARE,
    };
    frame = centre({ size, outer: stage });
    const inside = contain({ inner: image, outer: frame });
    shown = { ...inside, x: frame.x + inside.x, y: frame.y + inside.y };
  } else {
    frame = stageFrame({ image, crop, stage });
    const rect = cropRect({ image, crop });
    const pixel = frame.width / rect.width;
    shown = {
      x: frame.x - rect.x * pixel,
      y: frame.y - rect.y * pixel,
      width: image.width * pixel,
      height: image.height * pixel,
    };
  }
  const toShares = ({ x, y, width, height }: Rect): Rect => ({
    x,
    y: y / stage.height,
    width,
    height: height / stage.height,
  });
  return { frame: toShares(frame), image: toShares(shown) };
}

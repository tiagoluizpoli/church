import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import { m } from '@church/i18n/messages';
import { Info, Minus, Plus, RotateCcw } from 'lucide-react';
import * as React from 'react';
import { ChurchLogoTile } from '@/components/church-logo-tile';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { EmailHeaderPreview } from '@/features/church-settings/components/email-header-preview';
import {
  type Crop,
  cropRect,
  fillColor,
  hasTransparency,
  initialCrop,
  LOGO_SHAPES,
  type LogoFill,
  type LogoLayout,
  type LogoShape,
  logoLayout,
  maxZoom,
  nearestShape,
  type Rect,
  type Size,
  settleCrop,
  stageLayout,
} from '@/features/church-settings/logo-crop';
import { useControlSizes } from '@/features/church-settings/use-control-sizes';
import { cn } from '@/lib/utils';

const ZOOM_STEP = 1.2;
/** One arrow press moves the image by this share of the frame. */
const PAN_STEP = 0.05;
/** Wheel zoom: one notch (~100 px of deltaY) is about one +/− press. */
const WHEEL_ZOOM_RATE = 0.0018;
/** The editor stage's width/height. */
const STAGE_ASPECT = 4 / 3;
/** The mini-previews are drawn small: they redraw on every drag move. */
const PREVIEW_MAX_SIDE = 160;
/** Transparency is probed on a thumbnail: enough to find a transparent area. */
const PROBE_MAX_SIDE = 64;
const SHAPES: LogoShape[] = ['square', 'landscape'];
const PERCENT = 100;

interface LogoCropDialogProps {
  /** The picked image; the dialog is open while there is one. */
  file: File | null;
  /** The Church's name as the form stands, for the previews. */
  churchName: string;
  /** The Church's accent as `#rrggbb`, or null: the accent fill and the email preview. */
  accentColor: string | null;
  /** The framed PNG. */
  onConfirm: (file: File) => void;
  onCancel: () => void;
}

/**
 * Frames a picked logo before upload: the admin picks a square or 4:3 frame,
 * drags (pointer, arrow keys) and zooms (wheel, pinch, +/−, buttons or
 * slider) with the cut-away part dimmed around the frame, or shows the whole
 * logo padded with a chosen fill; the browser draws the result to a PNG. The
 * plain `Dialog` on every width: a bottom-sheet drawer would read a vertical
 * drag as swipe-to-close.
 */
export function LogoCropDialog({
  file,
  churchName,
  accentColor,
  onConfirm,
  onCancel,
}: LogoCropDialogProps) {
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{m.church_settings_logo_crop_title()}</DialogTitle>
          <DialogDescription>
            {m.church_settings_logo_crop_description()}
          </DialogDescription>
        </DialogHeader>
        {file ? (
          <CropEditor
            file={file}
            churchName={churchName}
            accentColor={accentColor}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface Offset {
  dx: number;
  dy: number;
}

interface Point {
  x: number;
  y: number;
}

type CropEditorProps = Omit<LogoCropDialogProps, 'file'> & { file: File };

interface DrawLogoInput {
  source: HTMLImageElement;
  layout: LogoLayout;
  /** Painted under the logo first, or null to keep it transparent. */
  color: string | null;
}

/** Draws a layout to a fresh canvas: the fill, then the image. */
function drawLogo({ source, layout, color }: DrawLogoInput): HTMLCanvasElement {
  const { size, source: from, target } = layout;
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (context) {
    if (color) {
      context.fillStyle = color;
      context.fillRect(0, 0, size.width, size.height);
    }
    context.drawImage(
      source,
      from.x,
      from.y,
      from.width,
      from.height,
      target.x,
      target.y,
      target.width,
      target.height,
    );
  }
  return canvas;
}

interface ProbeInput {
  source: HTMLImageElement;
  image: Size;
}

/** Whether a decoded image has any transparent pixel, read from a thumbnail. */
function probeTransparency({ source, image }: ProbeInput): boolean {
  const scale = Math.min(
    1,
    PROBE_MAX_SIDE / Math.max(image.width, image.height),
  );
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(source, 0, 0, width, height);
  return hasTransparency({
    data: context.getImageData(0, 0, width, height).data,
  });
}

/** A rect of shares (0–1) as absolute CSS percentages. */
function placed({ x, y, width, height }: Rect): React.CSSProperties {
  return {
    left: `${x * PERCENT}%`,
    top: `${y * PERCENT}%`,
    width: `${width * PERCENT}%`,
    height: `${height * PERCENT}%`,
  };
}

interface DistanceInput {
  a: Point;
  b: Point;
}

const distance = ({ a, b }: DistanceInput) => Math.hypot(a.x - b.x, a.y - b.y);

function CropEditor({
  file,
  churchName,
  accentColor,
  onConfirm,
  onCancel,
}: CropEditorProps) {
  const imageRef = React.useRef<HTMLImageElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  /** Pointers down on the stage: one drags, two pinch. */
  const pointers = React.useRef(new Map<number, Point>());
  const [url, setUrl] = React.useState<string | null>(null);
  const [image, setImage] = React.useState<Size | null>(null);
  const [crop, setCrop] = React.useState<Crop | null>(null);
  const [letterbox, setLetterbox] = React.useState(false);
  const [fill, setFill] = React.useState<LogoFill>('white');
  const [transparent, setTransparent] = React.useState(false);
  const [preview, setPreview] = React.useState<string | null>(null);
  const sizes = useControlSizes();
  const hintId = React.useId();
  const zoomId = React.useId();
  const shapeId = React.useId();
  const fillId = React.useId();
  const wholeId = React.useId();

  React.useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const color = fillColor({ fill, accentColor });
  const showFill = letterbox || transparent;
  const paint = showFill ? color : null;

  React.useEffect(() => {
    const source = imageRef.current;
    if (!source || !image || !crop) return;
    const layout = logoLayout({
      image,
      crop,
      letterbox,
      maxSide: PREVIEW_MAX_SIDE,
    });
    setPreview(drawLogo({ source, layout, color: paint }).toDataURL());
  }, [image, crop, letterbox, paint]);

  const rect = image && crop ? cropRect({ image, crop }) : null;
  const deepest = image && crop ? maxZoom({ image, crop }) : 1;
  const canZoom = !letterbox && deepest > 1;
  const shape: LogoShape =
    crop?.aspect === LOGO_SHAPES.square ? 'square' : 'landscape';
  const update = (changes: Partial<Crop>) => {
    if (image && crop)
      setCrop(settleCrop({ image, crop: { ...crop, ...changes } }));
  };
  const reset = () => {
    if (image) setCrop(initialCrop({ image, shape }));
  };
  const resetCrop = image ? initialCrop({ image, shape }) : null;
  const isReset =
    !crop ||
    (crop.zoom === resetCrop?.zoom &&
      crop.centerX === resetCrop.centerX &&
      crop.centerY === resetCrop.centerY);
  /** Moves the image by source pixels (the crop moves the other way). */
  const moveImage = ({ dx, dy }: Offset) => {
    if (crop && !letterbox)
      update({ centerX: crop.centerX - dx, centerY: crop.centerY - dy });
  };
  const zoomBy = (factor: number) => {
    if (crop && !letterbox) update({ zoom: crop.zoom * factor });
  };
  // The latest zoom for the native wheel listener, registered once.
  const zoomByRef = React.useRef(zoomBy);
  zoomByRef.current = zoomBy;

  React.useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomByRef.current(Math.exp(-event.deltaY * WHEEL_ZOOM_RATE));
    };
    // Not React's onWheel: that one is passive and cannot stop the dialog scrolling.
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, []);

  const layout =
    image && crop
      ? stageLayout({ image, crop, letterbox, stageAspect: STAGE_ASPECT })
      : null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!rect) return;
    const step = rect.width * PAN_STEP;
    const moves: Record<string, Offset> = {
      ArrowLeft: { dx: -step, dy: 0 },
      ArrowRight: { dx: step, dy: 0 },
      ArrowUp: { dx: 0, dy: -step },
      ArrowDown: { dx: 0, dy: step },
    };
    const move = moves[event.key];
    if (move) moveImage(move);
    else if (event.key === '+' || event.key === '=') zoomBy(ZOOM_STEP);
    else if (event.key === '-' || event.key === '_') zoomBy(1 / ZOOM_STEP);
    else return;
    event.preventDefault();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const down = pointers.current;
    const previous = down.get(event.pointerId);
    const stageWidth = event.currentTarget.clientWidth;
    if (!previous || !rect || !layout || !stageWidth) return;
    const next = { x: event.clientX, y: event.clientY };
    const other = [...down].find(([id]) => id !== event.pointerId)?.[1];
    down.set(event.pointerId, next);
    if (other) {
      const before = distance({ a: previous, b: other });
      if (before > 0) zoomBy(distance({ a: next, b: other }) / before);
      return;
    }
    const scale = rect.width / (layout.frame.width * stageWidth);
    moveImage({
      dx: (next.x - previous.x) * scale,
      dy: (next.y - previous.y) * scale,
    });
  };
  const onPointerEnd = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
  };

  const confirmCrop = () => {
    const source = imageRef.current;
    if (!source || !image || !crop) return;
    const canvas = drawLogo({
      source,
      layout: logoLayout({ image, crop, letterbox }),
      color: paint,
    });
    canvas.toBlob((blob) => {
      if (blob) onConfirm(new File([blob], 'logo.png', { type: 'image/png' }));
    }, 'image/png');
  };

  const fills: LogoFill[] = accentColor
    ? ['white', 'accent', 'transparent']
    : ['white', 'transparent'];
  const fillLabels: Record<LogoFill, string> = {
    white: m.church_settings_logo_crop_fill_white(),
    accent: m.church_settings_logo_crop_fill_accent(),
    transparent: m.church_settings_logo_crop_fill_transparent(),
  };
  const shapeLabels: Record<LogoShape, string> = {
    square: m.church_settings_logo_crop_square(),
    landscape: m.church_settings_logo_crop_landscape(),
  };

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid content-start gap-3">
          <div
            ref={stageRef}
            role="application"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: a pan/zoom surface with its own keys (arrows, +/−), named in its label.
            tabIndex={0}
            aria-label={m.church_settings_logo_crop_area()}
            aria-describedby={hintId}
            data-testid="logo-crop-stage"
            className={cn(
              'radius-surface relative w-full touch-none select-none overflow-hidden bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              letterbox
                ? 'cursor-default'
                : 'cursor-grab active:cursor-grabbing',
            )}
            style={{ aspectRatio: STAGE_ASPECT }}
            onKeyDown={onKeyDown}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              pointers.current.set(event.pointerId, {
                x: event.clientX,
                y: event.clientY,
              });
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            {layout && paint ? (
              <div
                className="absolute"
                style={{ ...placed(layout.frame), background: paint }}
              />
            ) : null}
            {url ? (
              <img
                ref={imageRef}
                src={url}
                alt=""
                draggable={false}
                data-testid="logo-crop-image"
                className="pointer-events-none absolute max-w-none"
                style={layout ? placed(layout.image) : { visibility: 'hidden' }}
                onLoad={(event) => {
                  const source = event.currentTarget;
                  const loaded = {
                    width: source.naturalWidth,
                    height: source.naturalHeight,
                  };
                  const seeThrough =
                    file.type !== 'image/jpeg' &&
                    probeTransparency({ source, image: loaded });
                  setImage(loaded);
                  setCrop(
                    initialCrop({
                      image: loaded,
                      shape: nearestShape({ image: loaded }),
                    }),
                  );
                  setTransparent(seeThrough);
                  setFill(seeThrough ? 'transparent' : 'white');
                }}
              />
            ) : null}
            {layout ? (
              // The cut-away part stays visible, dimmed by the frame's spread shadow.
              <div
                data-testid="logo-crop-frame"
                className="pointer-events-none absolute shadow-[0_0_0_9999px_rgb(0_0_0/0.55)] outline-2 outline-white ring-1 ring-black/40"
                style={placed(layout.frame)}
              />
            ) : null}
          </div>
          <p id={hintId} className="text-muted-foreground text-xs">
            {m.church_settings_logo_crop_hint()}
          </p>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={zoomId}>
                {m.church_settings_logo_crop_zoom()}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size={sizes.small}
                disabled={letterbox || isReset}
                onClick={reset}
              >
                <RotateCcw aria-hidden />
                {m.church_settings_logo_crop_reset()}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size={sizes.icon}
                disabled={!canZoom || !crop || crop.zoom <= 1}
                onClick={() => zoomBy(1 / ZOOM_STEP)}
                aria-label={m.church_settings_logo_crop_zoom_out()}
              >
                <Minus aria-hidden />
              </Button>
              <input
                id={zoomId}
                type="range"
                min={1}
                max={deepest}
                step="any"
                disabled={!canZoom}
                value={crop?.zoom ?? 1}
                onChange={(event) =>
                  update({ zoom: Number(event.target.value) })
                }
                className="h-11 min-w-0 flex-1 accent-primary md:h-8"
              />
              <Button
                type="button"
                variant="outline"
                size={sizes.icon}
                disabled={!canZoom || !crop || crop.zoom >= deepest}
                onClick={() => zoomBy(ZOOM_STEP)}
                aria-label={m.church_settings_logo_crop_zoom_in()}
              >
                <Plus aria-hidden />
              </Button>
            </div>
            {image && deepest <= 1 && !letterbox ? (
              <p className="text-muted-foreground text-xs">
                {m.church_settings_logo_crop_zoom_small({
                  width: String(image.width),
                  height: String(image.height),
                })}
              </p>
            ) : null}
          </div>
        </div>
        <div className="grid content-start gap-4">
          <div className="grid gap-1.5">
            <span id={shapeId} className="font-medium text-xs">
              {m.church_settings_logo_crop_shape()}
            </span>
            <Segmented
              labelledBy={shapeId}
              value={shape}
              disabled={!crop}
              options={SHAPES.map((value) => ({
                value,
                label: shapeLabels[value],
              }))}
              onChange={(value) => update({ aspect: LOGO_SHAPES[value] })}
            />
          </div>
          <div className="grid gap-1.5">
            <label
              htmlFor={wholeId}
              className="flex min-h-11 items-center justify-between gap-3 font-medium text-xs md:min-h-8"
            >
              {m.church_settings_logo_crop_whole()}
              <Switch
                id={wholeId}
                checked={letterbox}
                disabled={!crop}
                onCheckedChange={setLetterbox}
              />
            </label>
            {letterbox ? (
              <p
                data-testid="logo-crop-whole-notice"
                className="flex items-start gap-1.5 text-muted-foreground text-xs"
              >
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {m.church_settings_logo_crop_whole_notice()}
              </p>
            ) : null}
          </div>
          {showFill ? (
            <div className="grid gap-1.5">
              <span id={fillId} className="font-medium text-xs">
                {m.church_settings_logo_crop_fill()}
              </span>
              <Segmented
                labelledBy={fillId}
                value={fill}
                options={fills.map((value) => ({
                  value,
                  label: fillLabels[value],
                }))}
                onChange={setFill}
              />
              {transparent ? (
                <p className="text-muted-foreground text-xs">
                  {m.church_settings_logo_crop_fill_hint()}
                </p>
              ) : null}
            </div>
          ) : null}
          <LogoPreviews
            churchName={churchName}
            accentColor={accentColor}
            logoUrl={preview}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {m.church_settings_logo_crop_cancel()}
        </Button>
        <Button type="button" disabled={!rect} onClick={confirmCrop}>
          {m.church_settings_logo_crop_confirm()}
        </Button>
      </DialogFooter>
    </>
  );
}

interface SegmentedOption<Value extends string> {
  value: Value;
  label: string;
}

interface SegmentedProps<Value extends string> {
  labelledBy: string;
  value: Value;
  options: SegmentedOption<Value>[];
  disabled?: boolean;
  onChange: (value: Value) => void;
}

/** The house segmented choice (as the availability roster's): a radio group of equal segments. */
function Segmented<Value extends string>({
  labelledBy,
  value,
  options,
  disabled,
  onChange,
}: SegmentedProps<Value>) {
  return (
    <RadioGroup
      aria-labelledby={labelledBy}
      value={value}
      disabled={disabled}
      onValueChange={(next) => {
        const picked = options.find((option) => option.value === next);
        if (picked) onChange(picked.value);
      }}
      className="radius-control grid auto-cols-fr grid-flow-col gap-1 bg-muted p-[3px]"
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className="radius-control inline-flex min-h-11 items-center justify-center border border-transparent px-2 font-medium text-muted-foreground text-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-checked:border-border data-checked:bg-background data-checked:text-foreground md:min-h-8"
        >
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}

interface LogoPreviewsProps {
  churchName: string;
  accentColor: string | null;
  /** The in-progress result as a data URL. */
  logoUrl: string | null;
}

/** The result where it lands: the sidebar header (light and dark) and the email header, with the real components. */
function LogoPreviews({ churchName, accentColor, logoUrl }: LogoPreviewsProps) {
  return (
    <section
      data-testid="logo-crop-previews"
      aria-label={m.church_settings_logo_crop_preview()}
      className="grid gap-2"
    >
      <span className="font-medium text-xs">
        {m.church_settings_logo_crop_preview()}
      </span>
      <SidebarPreview name={churchName} logoUrl={logoUrl} dark={false} />
      <SidebarPreview name={churchName} logoUrl={logoUrl} dark />
      <figure className="grid gap-1">
        <div className="radius-control overflow-hidden border">
          <EmailHeaderPreview
            name={churchName}
            logoUrl={logoUrl}
            accentColor={accentColor}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {m.church_settings_logo_crop_preview_email()}
        </figcaption>
      </figure>
    </section>
  );
}

interface SidebarPreviewProps {
  name: string;
  logoUrl: string | null;
  dark: boolean;
}

/** The sidebar header's row (app-shell): the logo tile beside the name, on the sidebar surface. */
function SidebarPreview({ name, logoUrl, dark }: SidebarPreviewProps) {
  return (
    // Already dark, the app's own sidebar is the dark preview: the forced one hides.
    <figure className={cn('grid gap-1', dark && 'dark:hidden')}>
      <div className={cn('sidebar-preview', dark && 'dark')}>
        <div className="radius-control flex h-14 items-center gap-3 border border-sidebar-border bg-sidebar px-3 text-sidebar-foreground">
          <ChurchLogoTile name={name} logoUrl={logoUrl} size="desktop" />
          <span className="block truncate font-semibold text-sm tracking-tight">
            {name}
          </span>
        </div>
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {dark
          ? m.church_settings_logo_crop_preview_sidebar_dark()
          : m.church_settings_logo_crop_preview_sidebar()}
      </figcaption>
    </figure>
  );
}

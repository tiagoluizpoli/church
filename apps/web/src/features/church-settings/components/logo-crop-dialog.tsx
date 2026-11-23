import { m } from '@church/i18n/messages';
import { Minus, Plus } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  type Crop,
  cropRect,
  initialCrop,
  isLogoShape,
  MAX_ASPECT,
  MIN_ASPECT,
  outputSize,
  type Size,
  settleCrop,
} from '@/features/church-settings/logo-crop';

const ZOOM_STEP = 1.2;
/** One arrow press moves the image by this share of the frame. */
const PAN_STEP = 0.05;

interface LogoCropDialogProps {
  /** The picked image; the dialog is open while there is one. */
  file: File | null;
  /** The cropped PNG, or the picked file itself when sent uncropped. */
  onConfirm: (file: File) => void;
  onCancel: () => void;
}

/**
 * Frames a picked logo before upload: the admin drags (or uses the arrow
 * keys) and zooms (+/−, buttons or slider) inside a square-to-4:3 frame, and
 * the browser draws that crop to a PNG. The plain `Dialog` on every width: a
 * bottom-sheet drawer would read a vertical drag as swipe-to-close.
 */
export function LogoCropDialog({
  file,
  onConfirm,
  onCancel,
}: LogoCropDialogProps) {
  return (
    <Dialog open={file !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{m.church_settings_logo_crop_title()}</DialogTitle>
          <DialogDescription>
            {m.church_settings_logo_crop_description()}
          </DialogDescription>
        </DialogHeader>
        {file ? (
          <CropEditor file={file} onConfirm={onConfirm} onCancel={onCancel} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface Offset {
  dx: number;
  dy: number;
}

interface CropEditorProps {
  file: File;
  onConfirm: (file: File) => void;
  onCancel: () => void;
}

function CropEditor({ file, onConfirm, onCancel }: CropEditorProps) {
  const imageRef = React.useRef<HTMLImageElement>(null);
  const drag = React.useRef<{ x: number; y: number } | null>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [image, setImage] = React.useState<Size | null>(null);
  const [crop, setCrop] = React.useState<Crop | null>(null);
  const hintId = React.useId();
  const shapeId = React.useId();

  React.useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  const rect = image && crop ? cropRect({ image, crop }) : null;
  const update = (changes: Partial<Crop>) => {
    if (image && crop)
      setCrop(settleCrop({ image, crop: { ...crop, ...changes } }));
  };
  /** Moves the image by source pixels (the crop moves the other way). */
  const moveImage = ({ dx, dy }: Offset) => {
    if (crop)
      update({ centerX: crop.centerX - dx, centerY: crop.centerY - dy });
  };
  const zoomBy = (factor: number) => {
    if (crop) update({ zoom: crop.zoom * factor });
  };

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
    const width = event.currentTarget.clientWidth;
    if (!drag.current || !rect || !width) return;
    const scale = rect.width / width;
    moveImage({
      dx: (event.clientX - drag.current.x) * scale,
      dy: (event.clientY - drag.current.y) * scale,
    });
    drag.current = { x: event.clientX, y: event.clientY };
  };

  const confirmCrop = () => {
    const source = imageRef.current;
    if (!source || !rect) return;
    const size = outputSize({ rect });
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    canvas
      .getContext('2d')
      ?.drawImage(
        source,
        rect.x,
        rect.y,
        rect.width,
        rect.height,
        0,
        0,
        size.width,
        size.height,
      );
    canvas.toBlob((blob) => {
      if (blob) onConfirm(new File([blob], 'logo.png', { type: 'image/png' }));
    }, 'image/png');
  };

  const maxZoom =
    image && crop
      ? settleCrop({ image, crop: { ...crop, zoom: Number.POSITIVE_INFINITY } })
          .zoom
      : 1;

  return (
    <>
      <div className="flex justify-center">
        <div
          role="application"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a pan/zoom surface with its own keys (arrows, +/−), named in its label.
          tabIndex={0}
          aria-label={m.church_settings_logo_crop_area()}
          aria-describedby={hintId}
          className="relative w-full max-w-xs cursor-grab touch-none select-none overflow-hidden rounded-md border bg-white outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:cursor-grabbing"
          style={{ aspectRatio: crop?.aspect ?? MAX_ASPECT }}
          onKeyDown={onKeyDown}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture?.(event.pointerId);
            drag.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerMove={onPointerMove}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          {url ? (
            <img
              ref={imageRef}
              src={url}
              alt=""
              draggable={false}
              data-testid="logo-crop-image"
              className="pointer-events-none absolute max-w-none"
              style={
                image && rect
                  ? {
                      width: `${(image.width / rect.width) * 100}%`,
                      height: `${(image.height / rect.height) * 100}%`,
                      left: `${(-rect.x / rect.width) * 100}%`,
                      top: `${(-rect.y / rect.height) * 100}%`,
                    }
                  : { visibility: 'hidden' }
              }
              onLoad={(event) => {
                const loaded = {
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                };
                setImage(loaded);
                setCrop(initialCrop({ image: loaded }));
              }}
            />
          ) : null}
        </div>
      </div>
      <p id={hintId} className="sr-only">
        {m.church_settings_logo_crop_description()}
      </p>
      <div className="grid gap-3">
        <div className="grid gap-1 text-sm">
          <span id={shapeId} className="font-medium">
            {m.church_settings_logo_crop_shape()}
          </span>
          <input
            type="range"
            aria-labelledby={shapeId}
            min={MIN_ASPECT}
            max={MAX_ASPECT}
            step="any"
            disabled={!crop}
            value={crop?.aspect ?? MAX_ASPECT}
            onChange={(event) => update({ aspect: Number(event.target.value) })}
            className="h-11 accent-primary"
          />
          <span className="flex justify-between text-muted-foreground text-xs">
            <span>{m.church_settings_logo_crop_square()}</span>
            <span>{m.church_settings_logo_crop_landscape()}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-touch"
            disabled={!crop || crop.zoom <= 1}
            onClick={() => zoomBy(1 / ZOOM_STEP)}
            aria-label={m.church_settings_logo_crop_zoom_out()}
          >
            <Minus aria-hidden />
          </Button>
          <input
            type="range"
            aria-label={m.church_settings_logo_crop_zoom()}
            min={1}
            max={maxZoom}
            step="any"
            disabled={!crop}
            value={crop?.zoom ?? 1}
            onChange={(event) => update({ zoom: Number(event.target.value) })}
            className="h-11 min-w-0 flex-1 accent-primary"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-touch"
            disabled={!crop || crop.zoom >= maxZoom}
            onClick={() => zoomBy(ZOOM_STEP)}
            aria-label={m.church_settings_logo_crop_zoom_in()}
          >
            <Plus aria-hidden />
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
          {m.church_settings_logo_crop_cancel()}
        </Button>
        {image && isLogoShape(image) ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => onConfirm(file)}
          >
            {m.church_settings_logo_crop_original()}
          </Button>
        ) : null}
        <Button type="button" size="lg" disabled={!rect} onClick={confirmCrop}>
          {m.church_settings_logo_crop_confirm()}
        </Button>
      </DialogFooter>
    </>
  );
}

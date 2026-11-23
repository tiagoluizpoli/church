import { m } from '@church/i18n/messages';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogoCropDialog } from '@/features/church-settings/components/logo-crop-dialog';

const drawImage = vi.fn();
let canvasSizes: [number, number][] = [];

beforeEach(() => {
  canvasSizes = [];
  drawImage.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:logo');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    canvasSizes.push([this.width, this.height]);
    callback(new Blob(['png'], { type: 'image/png' }));
  });
});

afterEach(() => vi.restoreAllMocks());

const file = new File([new Uint8Array(8)], 'logo.jpg', { type: 'image/jpeg' });

function renderDialog() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <LogoCropDialog file={file} onConfirm={onConfirm} onCancel={onCancel} />,
  );
  return { onConfirm, onCancel };
}

/** jsdom never decodes images: give the preview its natural size and fire load. */
function loadImage(width: number, height: number) {
  const image = screen.getByTestId('logo-crop-image');
  Object.defineProperty(image, 'naturalWidth', { value: width });
  Object.defineProperty(image, 'naturalHeight', { value: height });
  fireEvent.load(image);
}

function frame() {
  return screen.getByLabelText(m.church_settings_logo_crop_area());
}

async function confirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole('button', { name: m.church_settings_logo_crop_confirm() }),
  );
}

/** The source rectangle drawn: [x, y, width, height]. */
function drawnSource(): number[] {
  return drawImage.mock.calls.at(-1)?.slice(1, 5) ?? [];
}

describe('LogoCropDialog', () => {
  it('frames a wide image at 4:3, centred, and sends a 512×384 PNG', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();
    loadImage(1000, 500);

    await confirm(user);

    expect(canvasSizes).toEqual([[512, 384]]);
    const [x, y, width, height] = drawnSource();
    expect(x).toBeCloseTo(1000 / 2 - (500 * (4 / 3)) / 2);
    expect(y).toBe(0);
    expect(width).toBeCloseTo(500 * (4 / 3));
    expect(height).toBe(500);
    const sent = onConfirm.mock.calls[0]?.[0] as File;
    expect(sent).toBeInstanceOf(File);
    expect(sent.type).toBe('image/png');
  });

  it('keeps the frame between square and 4:3', async () => {
    const user = userEvent.setup();
    renderDialog();
    loadImage(1000, 500);
    const shape = screen.getByRole('slider', {
      name: m.church_settings_logo_crop_shape(),
    });

    expect(shape).toHaveAttribute('min', '1');
    expect(Number(shape.getAttribute('max'))).toBeCloseTo(4 / 3);
    fireEvent.change(shape, { target: { value: '1' } });
    await confirm(user);

    expect(canvasSizes).toEqual([[500, 500]]);
  });

  it('pans with the arrow keys and zooms with + and −, inside the image', async () => {
    const user = userEvent.setup();
    renderDialog();
    loadImage(1000, 500);
    frame().focus();

    await user.keyboard('{ArrowRight}');
    await confirm(user);
    const [movedX] = drawnSource();
    expect(movedX).toBeLessThan(1000 / 2 - (500 * (4 / 3)) / 2);

    frame().focus();
    await user.keyboard('++');
    await confirm(user);
    const [, , zoomedWidth, zoomedHeight] = drawnSource();
    expect(zoomedWidth).toBeLessThan(500 * (4 / 3));
    expect((zoomedWidth ?? 0) / (zoomedHeight ?? 1)).toBeCloseTo(4 / 3);

    frame().focus();
    await user.keyboard('{ArrowUp>40/}');
    await confirm(user);
    const [, panY = -1] = drawnSource();
    expect(panY).toBeGreaterThanOrEqual(0);

    frame().focus();
    await user.keyboard('------');
    await confirm(user);
    expect(drawnSource()[2]).toBeCloseTo(500 * (4 / 3));
    for (const [width, height] of canvasSizes) {
      expect(width).toBeGreaterThanOrEqual(height);
      expect(3 * width).toBeLessThanOrEqual(4 * height);
    }
  });

  it('drags the image with the pointer', async () => {
    const user = userEvent.setup();
    renderDialog();
    loadImage(1000, 500);
    Object.defineProperty(frame(), 'clientWidth', { value: 320 });

    fireEvent.pointerDown(frame(), {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(frame(), {
      clientX: 140,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerUp(frame(), { pointerId: 1 });
    await confirm(user);

    // 40 screen px over a 320 px frame showing 666.7 source px.
    expect(drawnSource()[0]).toBeCloseTo(
      1000 / 2 - (500 * (4 / 3)) / 2 - (40 * 500 * (4 / 3)) / 320,
    );
  });

  it('offers to send an image already square-to-4:3 as it is', async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();
    loadImage(400, 320);

    await user.click(
      screen.getByRole('button', {
        name: m.church_settings_logo_crop_original(),
      }),
    );

    expect(onConfirm).toHaveBeenCalledWith(file);
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('offers no uncropped send for an image outside the shape', () => {
    renderDialog();
    loadImage(1000, 500);

    expect(
      screen.queryByRole('button', {
        name: m.church_settings_logo_crop_original(),
      }),
    ).not.toBeInTheDocument();
  });

  it('cancels without sending', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();
    loadImage(1000, 500);

    await user.click(
      screen.getByRole('button', {
        name: m.church_settings_logo_crop_cancel(),
      }),
    );

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

import { m } from '@church/i18n/messages';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogoCropDialog } from '@/features/church-settings/components/logo-crop-dialog';

const PREVIEW_URL = 'data:image/png;base64,preview';
const ACCENT = '#c2410c';
const drawImage = vi.fn();
/** The colour painted by each fillRect, in order. */
let fills: string[] = [];
let canvasSizes: [number, number][] = [];
/** The alpha the transparency probe reads. */
let probedAlpha = 255;

beforeEach(() => {
  canvasSizes = [];
  fills = [];
  probedAlpha = 255;
  drawImage.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:logo');
  URL.revokeObjectURL = vi.fn();
  const context = {
    fillStyle: '',
    drawImage,
    fillRect: () => fills.push(context.fillStyle),
    getImageData: () => ({
      data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, probedAlpha]),
    }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as never,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    PREVIEW_URL,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
  ) {
    canvasSizes.push([this.width, this.height]);
    callback(new Blob(['png'], { type: 'image/png' }));
  });
});

afterEach(() => vi.restoreAllMocks());

const jpeg = new File([new Uint8Array(8)], 'logo.jpg', { type: 'image/jpeg' });
const png = new File([new Uint8Array(8)], 'logo.png', { type: 'image/png' });

function renderDialog(file = jpeg, accentColor: string | null = ACCENT) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <LogoCropDialog
      file={file}
      churchName="Igreja Semente"
      accentColor={accentColor}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />,
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

function button(name: string) {
  return screen.getByRole('button', { name });
}

async function confirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button(m.church_settings_logo_crop_confirm()));
}

/** The source rectangle drawn: [x, y, width, height]. */
function drawnSource(): number[] {
  return drawImage.mock.calls.at(-1)?.slice(1, 5) ?? [];
}

/** Where the image landed on the canvas: [x, y, width, height]. */
function drawnTarget(): number[] {
  return drawImage.mock.calls.at(-1)?.slice(5, 9) ?? [];
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
    expect(fills).toEqual([]);
    const sent = onConfirm.mock.calls[0]?.[0] as File;
    expect(sent).toBeInstanceOf(File);
    expect(sent.type).toBe('image/png');
  });

  it('switches between the square and 4:3 frames', async () => {
    const user = userEvent.setup();
    renderDialog();
    loadImage(1000, 500);
    const shape = screen.getByRole('radiogroup', {
      name: m.church_settings_logo_crop_shape(),
    });
    expect(
      within(shape).getByRole('radio', {
        name: m.church_settings_logo_crop_landscape(),
      }),
    ).toBeChecked();

    await user.click(
      within(shape).getByRole('radio', {
        name: m.church_settings_logo_crop_square(),
      }),
    );
    await confirm(user);

    expect(canvasSizes).toEqual([[500, 500]]);
  });

  it('starts a tall image square', () => {
    renderDialog();
    loadImage(300, 600);

    expect(
      screen.getByRole('radio', { name: m.church_settings_logo_crop_square() }),
    ).toBeChecked();
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

    // The whole 1000 px image spans the 320 px stage, so 40 screen px = 125 source px.
    expect(drawnSource()[0]).toBeCloseTo(
      1000 / 2 - (500 * (4 / 3)) / 2 - (40 * 1000) / 320,
    );
  });

  it('zooms with a two-finger pinch', async () => {
    const user = userEvent.setup();
    renderDialog();
    loadImage(1000, 500);
    Object.defineProperty(frame(), 'clientWidth', { value: 320 });

    fireEvent.pointerDown(frame(), {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerDown(frame(), {
      clientX: 200,
      clientY: 100,
      pointerId: 2,
    });
    fireEvent.pointerMove(frame(), {
      clientX: 300,
      clientY: 100,
      pointerId: 2,
    });
    fireEvent.pointerUp(frame(), { pointerId: 2 });
    fireEvent.pointerUp(frame(), { pointerId: 1 });
    await confirm(user);

    expect(drawnSource()[2]).toBeCloseTo((500 * (4 / 3)) / 2);
  });

  it('zooms with the mouse wheel', async () => {
    const user = userEvent.setup();
    renderDialog();
    loadImage(1000, 500);

    fireEvent.wheel(frame(), { deltaY: -100 });
    await confirm(user);

    expect(drawnSource()[2]).toBeLessThan(500 * (4 / 3));
  });

  it('resets the zoom and position', async () => {
    const user = userEvent.setup();
    renderDialog();
    loadImage(1000, 500);
    const reset = button(m.church_settings_logo_crop_reset());
    expect(reset).toBeDisabled();

    await user.click(button(m.church_settings_logo_crop_zoom_in()));
    frame().focus();
    await user.keyboard('{ArrowLeft}');
    await user.click(reset);
    await confirm(user);

    expect(reset).toBeDisabled();
    const [x, , width] = drawnSource();
    expect(width).toBeCloseTo(500 * (4 / 3));
    expect(x).toBeCloseTo(1000 / 2 - (500 * (4 / 3)) / 2);
  });

  it('explains why a tiny image cannot zoom', () => {
    renderDialog();
    loadImage(120, 100);

    expect(
      screen.getByText(
        m.church_settings_logo_crop_zoom_small({ width: '120', height: '100' }),
      ),
    ).toBeInTheDocument();
    expect(button(m.church_settings_logo_crop_zoom_in())).toBeDisabled();
    expect(
      screen.getByLabelText(m.church_settings_logo_crop_zoom()),
    ).toBeDisabled();
  });

  it('shows the whole wide logo on demand: bars in the chosen fill, with a notice', async () => {
    const user = userEvent.setup();
    renderDialog();
    loadImage(1600, 400);
    expect(
      screen.queryByTestId('logo-crop-whole-notice'),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('switch', { name: m.church_settings_logo_crop_whole() }),
    );
    expect(screen.getByTestId('logo-crop-whole-notice')).toHaveTextContent(
      m.church_settings_logo_crop_whole_notice(),
    );
    await confirm(user);

    expect(canvasSizes).toEqual([[512, 384]]);
    expect(drawnSource()).toEqual([0, 0, 1600, 400]);
    expect(drawnTarget()).toEqual([0, 128, 512, 128]);
    expect(fills.at(-1)).toBe('#ffffff');

    await user.click(
      screen.getByRole('radio', {
        name: m.church_settings_logo_crop_fill_accent(),
      }),
    );
    await confirm(user);
    expect(fills.at(-1)).toBe(ACCENT);

    await user.click(
      screen.getByRole('radio', {
        name: m.church_settings_logo_crop_fill_transparent(),
      }),
    );
    fills = [];
    await confirm(user);
    expect(fills).toEqual([]);
  });

  it('offers no accent fill to a Church without an accent', async () => {
    const user = userEvent.setup();
    renderDialog(jpeg, null);
    loadImage(1600, 400);

    await user.click(
      screen.getByRole('switch', { name: m.church_settings_logo_crop_whole() }),
    );

    expect(
      screen.queryByRole('radio', {
        name: m.church_settings_logo_crop_fill_accent(),
      }),
    ).not.toBeInTheDocument();
  });

  it('offers a fill for a transparent PNG, kept transparent until picked', async () => {
    const user = userEvent.setup();
    probedAlpha = 0;
    renderDialog(png);
    loadImage(400, 300);

    expect(
      screen.getByText(m.church_settings_logo_crop_fill_hint()),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', {
        name: m.church_settings_logo_crop_fill_transparent(),
      }),
    ).toBeChecked();
    await user.click(
      screen.getByRole('radio', {
        name: m.church_settings_logo_crop_fill_white(),
      }),
    );
    await confirm(user);

    expect(fills.at(-1)).toBe('#ffffff');
  });

  it('offers no fill for an opaque image in the default frame', () => {
    renderDialog(png);
    loadImage(400, 300);

    expect(
      screen.queryByRole('radiogroup', {
        name: m.church_settings_logo_crop_fill(),
      }),
    ).not.toBeInTheDocument();
  });

  it('previews the result in the sidebar (light and dark) and the email header', () => {
    renderDialog();
    loadImage(1000, 500);

    const previews = screen.getByRole('region', {
      name: m.church_settings_logo_crop_preview(),
    });
    // Every logo, named or decorative (the email preview's may be alt="").
    const logos = [...previews.querySelectorAll('img')];
    expect(logos).toHaveLength(3);
    for (const logo of logos) expect(logo).toHaveAttribute('src', PREVIEW_URL);
    expect(
      within(previews).getByText(m.church_settings_logo_crop_preview_sidebar()),
    ).toBeInTheDocument();
    expect(
      within(previews).getByText(
        m.church_settings_logo_crop_preview_sidebar_dark(),
      ),
    ).toBeInTheDocument();
    expect(
      within(previews).getByText(m.church_settings_logo_crop_preview_email()),
    ).toBeInTheDocument();
  });

  it('cancels without sending', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();
    loadImage(1000, 500);

    await user.click(button(m.church_settings_logo_crop_cancel()));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

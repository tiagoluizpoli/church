import { afterEach, describe, expect, it, vi } from 'vitest';

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

// Long enough for two of jsdom's own ~16ms frames to have run.
const TWO_REAL_FRAMES_MS = 34;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('animation frames in the component project', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs a requested frame later, with a timestamp', async () => {
    const frame = vi.fn();
    const id = window.requestAnimationFrame(frame);

    expect(typeof id).toBe('number');
    expect(frame).not.toHaveBeenCalled();
    await nextFrame();
    expect(frame).toHaveBeenCalledExactlyOnceWith(expect.any(Number));
  });

  it('runs frames slow, so a test has to wait on UI state', async () => {
    const frame = vi.fn();
    requestAnimationFrame(frame);

    await wait(TWO_REAL_FRAMES_MS);
    expect(frame).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(frame).toHaveBeenCalledOnce());
  });

  it('skips a frame that fires once the window is gone', async () => {
    const frame = vi.fn();
    requestAnimationFrame(frame);
    vi.stubGlobal('window', undefined);
    try {
      await wait(TWO_REAL_FRAMES_MS * 3);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(frame).not.toHaveBeenCalled();
  });

  it('never runs a cancelled frame', async () => {
    const frame = vi.fn();
    cancelAnimationFrame(requestAnimationFrame(frame));

    await nextFrame();
    expect(frame).not.toHaveBeenCalled();
  });

  it('keeps running frames while only setTimeout is faked', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await expect(nextFrame()).resolves.toEqual(expect.any(Number));
  });

  it('hands frames to the fake clock when every timer is faked', () => {
    vi.useFakeTimers();
    const frame = vi.fn();
    requestAnimationFrame(frame);

    expect(frame).not.toHaveBeenCalled();
    vi.advanceTimersToNextFrame();
    expect(frame).toHaveBeenCalledOnce();
  });
});

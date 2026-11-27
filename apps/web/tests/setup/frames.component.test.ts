import { afterEach, describe, expect, it, vi } from 'vitest';

function nextFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
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

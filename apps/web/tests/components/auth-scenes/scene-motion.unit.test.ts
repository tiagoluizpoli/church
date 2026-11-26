import { describe, expect, it } from 'vitest';
import {
  type SceneDeviceSignals,
  shouldAnimateScene,
} from '@/components/auth-scenes/scene-motion';

const CAPABLE: SceneDeviceSignals = {
  reducedMotion: false,
  webgl2: true,
  saveData: false,
  effectiveType: '4g',
  deviceMemory: 8,
  hardwareConcurrency: 8,
};

describe('shouldAnimateScene', () => {
  it('loads the live scene on a capable device', () => {
    expect(shouldAnimateScene(CAPABLE)).toBe(true);
  });

  it('loads it when the browser exposes no network or memory hints (Safari, Firefox)', () => {
    expect(
      shouldAnimateScene({
        reducedMotion: false,
        webgl2: true,
        hardwareConcurrency: 8,
      }),
    ).toBe(true);
  });

  it.each<[string, Partial<SceneDeviceSignals>]>([
    ['reduced motion', { reducedMotion: true }],
    ['no WebGL2', { webgl2: false }],
    ['Save-Data', { saveData: true }],
    ['a 3g connection', { effectiveType: '3g' }],
    ['a 2g connection', { effectiveType: '2g' }],
    ['a slow-2g connection', { effectiveType: 'slow-2g' }],
    ['under 4 GB of memory', { deviceMemory: 2 }],
    ['fewer than 4 CPU cores', { hardwareConcurrency: 2 }],
  ])('keeps the still with %s', (_, signal) => {
    expect(shouldAnimateScene({ ...CAPABLE, ...signal })).toBe(false);
  });

  it('treats exactly 4 GB and 4 cores as capable', () => {
    expect(
      shouldAnimateScene({
        ...CAPABLE,
        deviceMemory: 4,
        hardwareConcurrency: 4,
      }),
    ).toBe(true);
  });
});

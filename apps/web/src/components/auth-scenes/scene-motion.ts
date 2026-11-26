/** What the browser tells us about the device before any scene code loads. */
export interface SceneDeviceSignals {
  reducedMotion: boolean;
  webgl2: boolean;
  saveData?: boolean;
  effectiveType?: string;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

const SLOW_CONNECTIONS = new Set(['slow-2g', '2g', '3g']);
// Below these the bake and the 30fps composite compete with the form for a weak CPU/GPU.
const MIN_DEVICE_MEMORY_GB = 4;
const MIN_CPU_CORES = 4;

/** Whether the live scene may load at all; otherwise its still image stays. */
export function shouldAnimateScene(signals: SceneDeviceSignals): boolean {
  if (signals.reducedMotion || !signals.webgl2 || signals.saveData) {
    return false;
  }
  if (signals.effectiveType && SLOW_CONNECTIONS.has(signals.effectiveType)) {
    return false;
  }
  if (
    signals.deviceMemory !== undefined &&
    signals.deviceMemory < MIN_DEVICE_MEMORY_GB
  ) {
    return false;
  }
  return !(
    signals.hardwareConcurrency !== undefined &&
    signals.hardwareConcurrency < MIN_CPU_CORES
  );
}

interface NavigatorHints {
  connection?: { saveData?: boolean; effectiveType?: string };
  deviceMemory?: number;
}

/** Reads the signals from this browser; absent hints (Safari, Firefox) never block. */
export function readSceneDeviceSignals(): SceneDeviceSignals {
  const hints = navigator as Navigator & NavigatorHints;
  return {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches,
    webgl2: typeof WebGL2RenderingContext !== 'undefined',
    saveData: hints.connection?.saveData,
    effectiveType: hints.connection?.effectiveType,
    deviceMemory: hints.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
  };
}

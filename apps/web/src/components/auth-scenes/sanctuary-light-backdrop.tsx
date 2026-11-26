import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  readSceneDeviceSignals,
  shouldAnimateScene,
} from '@/components/auth-scenes/scene-motion';

// Its own chunk: the WebGL scene never delays the form's first paint.
const SanctuaryLightScene = lazy(() =>
  import('@/components/auth-scenes/sanctuary-light-scene').then((module) => ({
    default: module.SanctuaryLightScene,
  })),
);

/** The scene must download and draw its first frame within this, or the still stays. */
const READY_TIMEOUT_MS = 4000;

type Phase = 'still' | 'loading' | 'live';

/**
 * The sanctuary light scene's backdrop: a still of the scene's real first
 * frame paints with the page; on a capable device the live scene then loads
 * and crossfades in over it once it has drawn that same frame. Weak or slow
 * devices, reduced motion and a scene that is not ready in time keep the
 * still. Fills its positioned parent.
 */
export function SanctuaryLightBackdrop() {
  const [phase, setPhase] = useState<Phase>('still');
  const markLive = useCallback(() => setPhase('live'), []);
  const stillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const still = stillRef.current;
    if (!still || !shouldAnimateScene(readSceneDeviceSignals())) return;
    let cancelled = false;
    let timeout = 0;
    const start = () => {
      if (cancelled) return;
      setPhase('loading');
      timeout = window.setTimeout(
        () => setPhase((current) => (current === 'live' ? current : 'still')),
        READY_TIMEOUT_MS,
      );
    };
    // Only once the still is on screen and the page is idle, so the scene's
    // download and shader compile never compete with the form or the still.
    const image = new Image();
    image.src =
      /url\("?(.+?)"?\)/.exec(getComputedStyle(still).backgroundImage)?.[1] ??
      '';
    void image
      .decode()
      .catch(() => undefined)
      .then(() =>
        // Safari has no requestIdleCallback.
        typeof window.requestIdleCallback === 'function'
          ? window.requestIdleCallback(start)
          : window.setTimeout(start),
      );
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="sanctuary-light-backdrop absolute inset-0 -z-10"
    >
      <div ref={stillRef} className="sanctuary-light-still absolute inset-0" />
      {phase !== 'still' && (
        <Suspense fallback={null}>
          <SanctuaryLightScene onReady={markLive} />
        </Suspense>
      )}
    </div>
  );
}

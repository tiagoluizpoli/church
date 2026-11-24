import { useEffect, useRef } from 'react';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const DURATION_MS = 700;
// Exponential ease-out: the count settles instead of stopping dead.
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

interface AnimatedNumberInput {
  value: number;
  format: (value: number) => string;
}

/**
 * Counts a number from its previous value to the new one, only when it
 * changes after first paint. The count runs in an `aria-hidden` twin while
 * the real text already holds the new value, so assistive tech never hears
 * an intermediate number. Reduced motion, or no Web Animations API, is instant.
 */
export function useAnimatedNumber({ value, format }: AnimatedNumberInput) {
  const textRef = useRef<HTMLSpanElement>(null);
  const motionRef = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    const text = textRef.current;
    const twin = motionRef.current;
    if (
      from === value ||
      !text ||
      !twin ||
      typeof twin.animate !== 'function' ||
      window.matchMedia(REDUCED_MOTION).matches
    )
      return;
    // The animation only drives the timing curve; each frame reads its progress.
    const animation = twin.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration: DURATION_MS,
      easing: EASE_OUT,
    });
    let frame = 0;
    const tick = () => {
      const progress = animation.effect?.getComputedTiming().progress ?? 1;
      twin.textContent = formatRef.current(
        Math.round(from + (value - from) * progress),
      );
      if (animation.playState === 'running')
        frame = requestAnimationFrame(tick);
    };
    const settle = () => {
      cancelAnimationFrame(frame);
      twin.textContent = '';
      twin.hidden = true;
      text.style.opacity = '';
    };
    text.style.opacity = '0';
    twin.hidden = false;
    tick();
    animation.finished.then(settle, settle);
    return () => animation.cancel();
  }, [value]);

  return { textRef, motionRef };
}

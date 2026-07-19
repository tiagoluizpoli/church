// PROTOTYPE ONLY — floating variant switcher. Hidden in production builds so a
// stray merge can never ship it. Dies with the prototype.
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useEffect } from 'react';
import type { RailVariant } from './rail-variants';

interface PrototypeSwitcherProps {
  variants: RailVariant[];
  current: string;
  onChange: (key: string) => void;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: PrototypeSwitcherProps) {
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );
  const active = variants[index];
  const step = (delta: number) => {
    const next = (index + delta + variants.length) % variants.length;
    onChange(variants[next].key);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-foreground px-2 py-1.5 text-background shadow-2xl">
      <button
        type="button"
        aria-label="Previous variant"
        onClick={() => step(-1)}
        className="rounded-full p-1.5 hover:bg-background/20"
      >
        <ChevronLeftIcon className="size-4" />
      </button>
      <span className="min-w-44 px-2 text-center font-medium text-xs">
        {active.key} — {active.name}
        <span className="ml-1 opacity-60">
          ({index + 1}/{variants.length})
        </span>
      </span>
      <button
        type="button"
        aria-label="Next variant"
        onClick={() => step(1)}
        className="rounded-full p-1.5 hover:bg-background/20"
      >
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  );
}

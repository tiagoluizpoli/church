// PROTOTYPE, throwaway: floating variant switcher. Never rendered in production builds.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

interface PrototypeSwitcherProps {
  variants: { key: string; name: string }[];
  current: string;
  onChange: (key: string) => void;
  extra?: React.ReactNode;
}

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
  extra,
}: PrototypeSwitcherProps) {
  const index = Math.max(
    0,
    variants.findIndex((v) => v.key === current),
  );
  const go = React.useCallback(
    (delta: number) =>
      onChange(
        variants[(index + delta + variants.length) % variants.length]?.key ??
          current,
      ),
    [index, variants, onChange, current],
  );
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);
  if (import.meta.env.PROD) return null;
  const v = variants[index];
  return (
    <div className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-neutral-900 p-1 text-sm text-white shadow-xl ring-2 ring-fuchsia-500">
      <button
        type="button"
        className="rounded-full p-1.5 hover:bg-white/15"
        onClick={() => go(-1)}
        aria-label="Variante anterior"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-2 font-medium">
        {v?.key} ({v?.name})
      </span>
      <button
        type="button"
        className="rounded-full p-1.5 hover:bg-white/15"
        onClick={() => go(1)}
        aria-label="Próxima variante"
      >
        <ChevronRight className="size-4" />
      </button>
      {extra ? (
        <span className="flex items-center gap-1 border-white/20 border-l pl-1">
          {extra}
        </span>
      ) : null}
    </div>
  );
}

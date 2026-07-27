import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface PrototypeVariant {
  key: string;
  label: string;
}

interface PrototypeSwitcherProps {
  variants: PrototypeVariant[];
  current: string;
  onChange: (variant: string) => void;
}

interface CycleVariantInput {
  direction: -1 | 1;
}

export function PrototypeSwitcher({
  variants,
  current,
  onChange,
}: PrototypeSwitcherProps) {
  const currentIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const cycleVariant = useCallback(
    ({ direction }: CycleVariantInput) => {
      const nextIndex =
        (currentIndex + direction + variants.length) % variants.length;
      const nextVariant = variants[nextIndex];
      if (nextVariant) {
        onChange(nextVariant.key);
      }
    },
    [currentIndex, onChange, variants],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, [contenteditable="true"]')
      ) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        cycleVariant({ direction: -1 });
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        cycleVariant({ direction: 1 });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cycleVariant]);

  if (import.meta.env.PROD) {
    return null;
  }

  const currentVariant = variants[currentIndex];

  return (
    <div className="fixed bottom-5 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-700 bg-slate-950 px-2 py-1.5 text-white shadow-2xl">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="rounded-full text-white hover:bg-white/15 hover:text-white"
        aria-label="Previous prototype variant"
        onClick={() => cycleVariant({ direction: -1 })}
      >
        <ChevronLeft />
      </Button>
      <span className="min-w-48 text-center font-medium text-sm">
        {currentVariant?.key} — {currentVariant?.label}
      </span>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="rounded-full text-white hover:bg-white/15 hover:text-white"
        aria-label="Next prototype variant"
        onClick={() => cycleVariant({ direction: 1 })}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

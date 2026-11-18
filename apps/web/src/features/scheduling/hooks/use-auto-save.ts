import { useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface MutationLike {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
}

/**
 * Derives a single auto-save status from one or more mutations.
 * - any pending  → 'saving'
 * - any error    → 'error' (persistent until next save attempt)
 * - just settled → 'saved', auto-resets to 'idle' after 2s
 */
export function useAutoSave(mutations: MutationLike[]): SaveStatus {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const wasPending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const anyPending = mutations.some((m) => m.isPending);
  const anyError = mutations.some((m) => m.isError);

  useEffect(() => {
    if (anyPending) {
      wasPending.current = true;
      if (timer.current) clearTimeout(timer.current);
      setStatus('saving');
      return;
    }

    if (anyError) {
      setStatus('error');
      wasPending.current = false;
      return;
    }

    if (wasPending.current) {
      wasPending.current = false;
      setStatus('saved');
      timer.current = setTimeout(() => setStatus('idle'), 2000);
    }
  }, [anyPending, anyError]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return status;
}

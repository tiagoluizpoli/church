import { apiClient } from '@/utils/api-client';

const READINESS_PATH = '/api/health';
const FIRST_PROBE_DELAY_MS = 1000;
const MAX_PROBE_DELAY_MS = 30_000;

/**
 * Probes readiness with capped backoff (and at once on focus or reconnect)
 * until it answers OK, then calls `onReady` once. Returns the cancel function.
 */
export function watchReadiness(
  onReady: () => void | Promise<void>,
): () => void {
  let delay = FIRST_PROBE_DELAY_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const probe = async () => {
    clearTimeout(timer);
    try {
      await apiClient({ url: READINESS_PATH });
    } catch {
      if (stopped) return;
      timer = setTimeout(probe, delay);
      delay = Math.min(delay * 2, MAX_PROBE_DELAY_MS);
      return;
    }
    if (stopped) return;
    await onReady();
  };

  timer = setTimeout(probe, delay);
  window.addEventListener('focus', probe);
  window.addEventListener('online', probe);
  return () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener('focus', probe);
    window.removeEventListener('online', probe);
  };
}

import { nowAsDate } from '@church/time';

const CHUNK_RELOAD_KEY = 'church:chunk-reload-at';
/** A repeat chunk failure within this window means the reload did not help. */
const CHUNK_RELOAD_GUARD_MS = 30_000;

// Messages for a failed dynamic import or Vite preload, per browser.
const CHUNK_LOAD_MESSAGES = [
  // presentation-text-ignore: browser error text matched, never shown
  'Failed to fetch dynamically imported module', // Chromium
  // presentation-text-ignore: browser error text matched, never shown
  'error loading dynamically imported module', // Firefox
  // presentation-text-ignore: browser error text matched, never shown
  'Importing a module script failed', // Safari
  // presentation-text-ignore: browser error text matched, never shown
  'Unable to preload CSS', // Vite
];

/** True for the error a tab hits when it asks for a chunk a newer deploy removed. */
export function isChunkLoadError(error: unknown): boolean {
  return (
    error instanceof Error &&
    CHUNK_LOAD_MESSAGES.some((message) => error.message.includes(message))
  );
}

/**
 * Claims the one reload a chunk failure gets: true when no reload happened
 * within the guard window (and records this one), false on a repeat.
 */
export function claimChunkReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY));
    if (nowAsDate().getTime() - last < CHUNK_RELOAD_GUARD_MS) {
      return false;
    }
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(nowAsDate().getTime()));
    return true;
  } catch {
    // Without storage the guard cannot hold, so never risk a reload loop.
    return false;
  }
}

export function reloadPage(): void {
  window.location.reload();
}

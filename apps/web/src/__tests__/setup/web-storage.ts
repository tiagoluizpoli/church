// jsdom ships a working `localStorage`, but vitest's jsdom environment only
// copies a global off the jsdom window when that key is not already present on
// the Node global. Node >= 22 defines its own experimental `localStorage` on
// `globalThis` — inert without the `--localstorage-file` flag, resolving to
// `undefined` and emitting an ExperimentalWarning on first access — so vitest
// skips the copy and every component test that touches storage (e.g.
// `TimezoneProvider` via `localStorage.getItem`) throws on `undefined`.
//
// This module installs a minimal in-memory Web Storage over that global. It is
// its own file, imported first by `component.ts`, so it runs before any other
// setup import touches `localStorage` (MSW's `CookieStore` reads it at module
// load). The install is unconditional by design: the only way to detect an
// existing implementation is to read the global, which is the very access that
// emits Node's warning. Component tests need get/set/remove/clear and per-file
// isolation, not real persistence, and the property stays `configurable` for
// any test that wants to stub it.
//
// `Storage` method signatures come from lib.dom, not our parameter contract.
function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key(index) {
      return [...entries.keys()][index] ?? null;
    },
    getItem(key) {
      return entries.get(key) ?? null;
    },
    setItem(key, value) {
      entries.set(String(key), String(value));
    },
    removeItem(key) {
      entries.delete(String(key));
    },
    clear() {
      entries.clear();
    },
  };
}

Object.defineProperty(globalThis, 'localStorage', {
  value: createMemoryStorage(),
  configurable: true,
  writable: false,
  enumerable: true,
});

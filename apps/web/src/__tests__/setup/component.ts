// Must be first: installs `localStorage` before any other import reads it
// (MSW's `CookieStore` touches it at module load). See the file for why.
import './web-storage';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { mswServer } from './msw';

declare global {
  /** base-ui's opt-out for awaiting exit animations. See the stub below. */
  var BASE_UI_ANIMATIONS_DISABLED: boolean | undefined;
}

// Component-project setup: jest-dom matchers, RTL cleanup, and MSW lifecycle.
beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  mswServer.resetHandlers();
});
afterAll(() => mswServer.close());

// jsdom has no layout engine, so `window.matchMedia` isn't implemented.
// Default every query to "matches" (desktop) so `useMediaQuery`-driven
// components (e.g. `ResponsiveFormSurface`) render their desktop branch
// unless a test explicitly stubs a narrower/wider result.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom doesn't implement the Pointer Events capture API that vaul's
// `Drawer` (used by `MobileDrawer` and the shadcn `Drawer`) calls on
// pointerdown — no-op polyfill so nested interactive elements (e.g.
// `ModeToggle`'s dropdown trigger) can be clicked in tests.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => {};
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}

// jsdom has no layout engine, so it never implements `ResizeObserver`.
// Components that measure themselves (e.g. `VolunteerCard`'s clipped-roles
// tooltip) only need the constructor to exist — with no layout there is
// nothing to observe, and every measured width stays 0.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom implements no Web Animations API. base-ui's `ScrollArea` viewport asks
// its element for in-flight animations once a resize is observed, which only
// became reachable in tests when `ResizeObserver` above started existing.
//
// The stub has to come with base-ui's own opt-out: `useAnimationsFinished`
// treats a missing `getAnimations` as "nothing to wait for" and runs
// synchronously, but a present one as "await these animations" — so merely
// defining it would push every dialog/dropdown/tab close a microtask later and
// break the tests that assert they are already gone. The flag restores the
// synchronous path that jsdom had before the stub existed.
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
}

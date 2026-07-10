import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { mswServer } from './msw';

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

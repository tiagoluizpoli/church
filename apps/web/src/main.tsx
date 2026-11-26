import './default-locale-strategy';
import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import ReactDOM from 'react-dom/client';
import { initLocale } from './locale-init';
import { routeTree } from './routeTree.gen';
import { routeFallbackOptions } from './shared/components/route-fallbacks';
import { initErrorReporting } from './shared/utils/error-reporting';
import { queryClient } from './utils/api';

// Must run before the router is created so ?lang= never reaches route search schemas.
initLocale();

// Best-effort and never blocks the first render.
void initErrorReporting();

interface WrapComponentProps {
  children: React.ReactNode;
}

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  // Never swap the previous page for a pending component; <RouteProgress /> shows progress.
  defaultPendingMs: Number.POSITIVE_INFINITY,
  ...routeFallbackOptions,
  context: { queryClient },
  Wrap: function WrapComponent({ children }: WrapComponentProps) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('app');

if (!rootElement) {
  throw new Error('Root element not found');
}

// AuthShell removes index.html's boot shell as it mounts; wherever else the
// router lands (a signed-in redirect, an error), it goes once that has painted.
router.subscribe('onResolved', () => {
  requestAnimationFrame(() => {
    if (!document.querySelector('.auth-panel')) {
      document.getElementById('boot-shell')?.remove();
    }
  });
});

const render = () =>
  ReactDOM.createRoot(rootElement).render(<RouterProvider router={router} />);

// The build loads the app stylesheet without blocking the boot shell's paint
// (vite.config.ts); the app itself never renders unstyled.
const pendingStylesheet = document.querySelector<HTMLLinkElement>(
  'link[rel="stylesheet"][media="print"]',
);
if (pendingStylesheet) {
  pendingStylesheet.addEventListener('load', render, { once: true });
  pendingStylesheet.addEventListener('error', render, { once: true });
} else {
  render();
}

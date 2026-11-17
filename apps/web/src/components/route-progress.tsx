import { m } from '@church/i18n/messages';
import { useRouterState } from '@tanstack/react-router';

/** Thin top bar while a navigation resolves; the previous page stays mounted
 * (the router never swaps in a pending component, see `defaultPendingMs`). */
export function RouteProgress() {
  const isNavigating = useRouterState({ select: (s) => s.isLoading });

  if (!isNavigating) {
    return null;
  }

  return (
    <div
      role="progressbar"
      aria-label={m.shell_route_loading()}
      className="fixed inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-primary motion-reduce:animate-none"
    />
  );
}

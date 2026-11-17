import { m } from '@church/i18n/messages';
import {
  type ErrorComponentProps,
  Link,
  useRouter,
} from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  FallbackPanel,
  FullScreenFallback,
} from '@/shared/components/full-screen-fallback';
import {
  claimChunkReload,
  isChunkLoadError,
  reloadPage,
} from '@/shared/utils/chunk-reload';

interface ErrorFallbackProps {
  error: Error;
  fullScreen: boolean;
}

function ErrorFallback({ error, fullScreen }: ErrorFallbackProps) {
  const router = useRouter();
  // A chunk error renders nothing until the effect decides: reload once, or fall back.
  const [reloading, setReloading] = useState(() => isChunkLoadError(error));

  useEffect(() => {
    if (!isChunkLoadError(error)) {
      return;
    }
    if (claimChunkReload()) {
      reloadPage();
    } else {
      setReloading(false);
    }
  }, [error]);

  if (reloading) {
    return null;
  }

  const Layout = fullScreen ? FullScreenFallback : FallbackPanel;
  return (
    <Layout
      role="alert"
      title={m.shell_error_title()}
      description={m.shell_error_description()}
    >
      <div className="flex flex-wrap justify-center gap-3">
        {/* Re-runs the route's loaders and guards; the new load resets the boundary. */}
        <Button className="min-h-11" onClick={() => router.invalidate()}>
          {m.shell_error_try_again()}
        </Button>
        <Link
          to="/"
          className={buttonVariants({
            variant: 'outline',
            className: 'min-h-11',
          })}
        >
          {m.shell_error_go_home()}
        </Link>
      </div>
      {import.meta.env.DEV ? (
        <details className="w-full text-left text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {m.shell_error_details()}
          </summary>
          <p className="mt-2 font-medium">{error.message}</p>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">
            {error.stack}
          </pre>
        </details>
      ) : null}
    </Layout>
  );
}

/** Router-wide default: a page crash renders inside whatever layout holds it, so the shell keeps working. */
export function RouteErrorFallback({ error }: ErrorComponentProps) {
  return <ErrorFallback error={error} fullScreen={false} />;
}

/** For the root and the shell's own routes, whose failure leaves no shell to render inside. */
export function ShellErrorFallback({ error }: ErrorComponentProps) {
  return <ErrorFallback error={error} fullScreen />;
}

/** Router-wide default for an unknown URL. */
export function NotFoundScreen() {
  return (
    <FallbackPanel
      title={m.shell_not_found_title()}
      description={m.shell_not_found_description()}
    >
      <Link to="/" className={buttonVariants({ className: 'min-h-11' })}>
        {m.shell_error_go_home()}
      </Link>
    </FallbackPanel>
  );
}

/** The router options both the app and the route-tree test helper apply. */
export const routeFallbackOptions = {
  defaultErrorComponent: RouteErrorFallback,
  defaultNotFoundComponent: NotFoundScreen,
};

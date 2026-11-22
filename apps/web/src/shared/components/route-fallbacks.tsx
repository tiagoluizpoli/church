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
import { reportCrash } from '@/shared/utils/error-reporting';
import { isOutageError } from '@/shared/utils/outage';
import { watchReadiness } from '@/shared/utils/readiness';

interface ErrorFallbackProps {
  error: Error;
  fullScreen: boolean;
}

function ErrorFallback({ error, fullScreen }: ErrorFallbackProps) {
  const router = useRouter();
  // A chunk error renders nothing until the effect decides: reload once, or fall back.
  const [reloading, setReloading] = useState(() => isChunkLoadError(error));
  const [referenceCode, setReferenceCode] = useState<string>();

  useEffect(() => {
    if (isChunkLoadError(error) && claimChunkReload()) {
      reloadPage();
      return;
    }
    setReloading(false);
    // Only a crash the Person actually sees is reported.
    const code = reportCrash({ error });
    setReferenceCode(code);
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
      {referenceCode ? (
        <p className="text-muted-foreground text-sm">
          {m.common_reference_code({ code: referenceCode })}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-3">
        {/* Re-runs the route's loaders and guards; the new load resets the boundary. */}
        <Button className="min-h-11" onClick={() => router.invalidate()}>
          {m.shell_error_try_again()}
        </Button>
        <Link
          to="/app"
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

/** The shell's own call failed because the server is down: wait for readiness, then re-run the guards to land on the requested page. */
interface ReconnectingFallbackProps {
  error: Error;
}

function ReconnectingFallback({ error }: ReconnectingFallbackProps) {
  const router = useRouter();

  // A new error (the guard failing again after a retry) restarts the watch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: error is the restart trigger
  useEffect(() => watchReadiness(() => router.invalidate()), [router, error]);

  return (
    <FullScreenFallback
      role="status"
      title={m.shell_reconnecting_title()}
      description={m.shell_reconnecting_description()}
    />
  );
}

/** Router-wide default: a page crash renders inside whatever layout holds it, so the shell keeps working. */
export function RouteErrorFallback({ error }: ErrorComponentProps) {
  return <ErrorFallback error={error} fullScreen={false} />;
}

/** For the root and the shell's own routes, whose failure leaves no shell to render inside. */
export function ShellErrorFallback({ error }: ErrorComponentProps) {
  if (isOutageError(error)) {
    return <ReconnectingFallback error={error} />;
  }
  return <ErrorFallback error={error} fullScreen />;
}

/** Router-wide default for an unknown URL. */
export function NotFoundScreen() {
  return (
    <FallbackPanel
      title={m.shell_not_found_title()}
      description={m.shell_not_found_description()}
    >
      <Link to="/app" className={buttonVariants({ className: 'min-h-11' })}>
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

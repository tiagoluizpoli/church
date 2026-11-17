import { type ReactNode, useEffect, useId, useRef } from 'react';

interface FallbackPanelProps {
  title: string;
  description?: string;
  /** Live-region role: `alert` for a failure, `status` for a recoverable wait. */
  role?: 'alert' | 'status';
  children?: ReactNode;
}

/** A calm, centered failure or wait state; focus lands on its heading so it is announced and keyboard users start there. */
export function FallbackPanel({
  title,
  description,
  role,
  children,
}: FallbackPanelProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      role={role}
      aria-labelledby={headingId}
      className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-16 text-center"
    >
      <h1
        id={headingId}
        ref={headingRef}
        tabIndex={-1}
        className="font-semibold text-2xl tracking-tight outline-none"
      >
        {title}
      </h1>
      {description ? (
        <p className="text-muted-foreground">{description}</p>
      ) : null}
      {children}
    </section>
  );
}

/** The same panel taking over the whole viewport, for when the app shell itself cannot load. */
export function FullScreenFallback(props: FallbackPanelProps) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <FallbackPanel {...props} />
    </div>
  );
}

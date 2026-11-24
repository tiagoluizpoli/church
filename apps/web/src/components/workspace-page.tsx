import * as React from 'react';
import { cn } from '@/lib/utils';

type WorkspacePageProps = React.ComponentProps<'div'>;

interface WorkspaceIntroPanelProps {
  aside?: React.ReactNode;
  autoFocusTitle?: boolean;
  children?: React.ReactNode;
  className?: string;
  description?: string;
  title: string;
  titleTestId?: string;
  /** Lets another page's element morph into this title (same-document View Transition). */
  titleViewTransitionName?: string;
}

export function WorkspacePage({
  children,
  className,
  ...props
}: WorkspacePageProps) {
  return (
    <div className={cn('workspace-page', className)} {...props}>
      {children}
    </div>
  );
}

export function WorkspaceIntroPanel({
  aside,
  autoFocusTitle = false,
  children,
  className,
  description,
  title,
  titleTestId,
  titleViewTransitionName,
}: WorkspaceIntroPanelProps) {
  const titleRef = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    if (!autoFocusTitle) {
      return;
    }

    titleRef.current?.focus();
  }, [autoFocusTitle]);

  return (
    <section
      className={cn('surface-panel workspace-panel-lg space-y-4', className)}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="workspace-section-header max-w-3xl">
          <h1
            ref={titleRef}
            tabIndex={autoFocusTitle ? -1 : undefined}
            className="max-w-3xl text-balance font-semibold text-3xl tracking-[-0.02em] outline-none md:text-4xl"
            data-testid={titleTestId}
            style={{ viewTransitionName: titleViewTransitionName }}
          >
            {title}
          </h1>
          {description ? (
            <p className="workspace-section-description">{description}</p>
          ) : null}
        </div>
        {aside ? <div className="w-full xl:w-auto">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

import * as React from 'react';
import { cn } from '@/lib/utils';

type WorkspacePageProps = React.ComponentProps<'div'>;

interface WorkspaceIntroPanelProps {
  aside?: React.ReactNode;
  autoFocusTitle?: boolean;
  children?: React.ReactNode;
  className?: string;
  description: string;
  title: string;
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
          >
            {title}
          </h1>
          <p className="workspace-section-description md:text-[0.95rem]">
            {description}
          </p>
        </div>
        {aside ? <div className="w-full xl:w-auto">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

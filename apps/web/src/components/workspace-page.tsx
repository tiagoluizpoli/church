import { cn } from '@church/ui/lib/utils';
import type * as React from 'react';

type WorkspacePageProps = React.ComponentProps<'div'>;

interface WorkspaceIntroPanelProps {
  aside?: React.ReactNode;
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
  children,
  className,
  description,
  title,
}: WorkspaceIntroPanelProps) {
  return (
    <section
      className={cn('surface-panel workspace-panel-lg space-y-4', className)}
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="workspace-section-header max-w-3xl">
          <h1 className="max-w-3xl text-balance font-semibold text-3xl tracking-[-0.02em] md:text-4xl">
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

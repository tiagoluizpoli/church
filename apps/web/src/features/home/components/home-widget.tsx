import type { ReactNode } from 'react';
import { Pending } from '@/components/ui/pending';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeError } from '@/features/home/components/home-error';

interface HomeWidgetProps {
  title: string;
  action?: ReactNode;
  loading?: boolean;
  error?: { message: string; retry: () => void };
  empty?: ReactNode;
  children?: ReactNode;
}

export function HomeWidget({
  title,
  action,
  loading,
  error,
  empty,
  children,
}: HomeWidgetProps) {
  return (
    <section className="@container surface-panel flex h-full flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-base">{title}</h2>
        {action}
      </div>
      {loading ? (
        <Pending label={title}>
          <Skeleton className="h-20 w-full" />
        </Pending>
      ) : error ? (
        <HomeError message={error.message} onRetry={error.retry} />
      ) : (
        (children ?? empty)
      )}
    </section>
  );
}

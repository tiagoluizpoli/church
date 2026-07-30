import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowRight,
  CalendarClock,
  CircleAlert,
  LogOut,
  TriangleAlert,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { ListActiveChurchOptions200ChurchesItem } from '@/infrastructure/api/churchAPI.schemas';
import { authClient } from '@/lib/auth-client';
import {
  MEMBERSHIP_REMOVED_PREFIX,
  MEMBERSHIP_REMOVED_SUFFIX,
  removedFromSearchSchema,
} from '@/shared/utils/membership-removal';
import { activeChurchApi } from '@/utils/api-instances';

export const Route = createFileRoute('/_authenticated/select-church')({
  validateSearch: (search) => removedFromSearchSchema.parse(search),
  component: SelectChurchRoute,
});

const AREA_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  scheduling: 'Scheduling',
};

interface FormatLastOpenedInput {
  lastOpenedAt: string | null;
}

function formatLastOpened({ lastOpenedAt }: FormatLastOpenedInput): string {
  if (!lastOpenedAt) return 'Never opened';
  return formatDistanceToNow(new Date(lastOpenedAt), { addSuffix: true });
}

interface InitialsForInput {
  name: string;
}

function initialsFor({ name }: InitialsForInput): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  return initials || '?';
}

interface AccessLabelInput {
  accessLevel: ListActiveChurchOptions200ChurchesItem['accessLevel'];
}

function accessLabel({ accessLevel }: AccessLabelInput): string {
  return accessLevel === 'admin' ? 'Church Admin' : 'Church Member';
}

interface AreasLabelInput {
  availableAreas: ListActiveChurchOptions200ChurchesItem['availableAreas'];
}

function areasLabel({ availableAreas }: AreasLabelInput): string {
  return availableAreas.map((area) => AREA_LABELS[area] ?? area).join(', ');
}

function SelectChurchRoute() {
  const { session } = Route.useRouteContext();
  const { removedFrom } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const optionsQuery = useQuery({
    queryKey: ['active-church', 'options'],
    queryFn: () => activeChurchApi.listActiveChurchOptions(),
  });

  const selectMutation = useMutation({
    mutationFn: (churchId: string) =>
      activeChurchApi.selectActiveChurch({ churchId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      navigate({ to: '/dashboard' });
    },
  });

  const churches = optionsQuery.data?.churches ?? [];
  const userName = session.data?.user.name;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <main className="w-full max-w-5xl overflow-hidden rounded-xl border bg-card">
        <header className="flex items-center justify-between border-border border-b px-5 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <CalendarClock className="size-5" />
            </div>
            <div>
              <p className="font-semibold text-[1.05rem] tracking-tight">
                Church CRM
              </p>
              <p className="text-muted-foreground text-xs">
                Scheduling workspace
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => navigate({ to: '/login' }),
                },
              });
            }}
          >
            <LogOut />
            Sign out
          </Button>
        </header>

        <section className="px-5 py-6 md:px-8">
          <h1 className="text-balance font-semibold text-2xl tracking-tight">
            Select an Active Church
          </h1>
          <p className="mt-2 max-w-2xl text-pretty text-muted-foreground text-sm">
            {userName ? `${userName}, y` : 'Y'}our account belongs to several
            Churches. Compare access before continuing.
          </p>
        </section>

        {removedFrom ? (
          <div className="flex items-start gap-3 border-border border-y bg-amber-500/8 px-5 py-4 md:px-8">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-500" />
            <p className="text-sm">
              {MEMBERSHIP_REMOVED_PREFIX}
              <strong>{removedFrom}</strong>
              {MEMBERSHIP_REMOVED_SUFFIX}
            </p>
          </div>
        ) : null}

        {optionsQuery.isLoading ? (
          <p className="px-5 pb-8 text-muted-foreground text-sm md:px-8">
            Loading your Churches…
          </p>
        ) : null}

        {optionsQuery.isError ? (
          <div className="flex items-start gap-3 border-border border-y bg-destructive/8 px-5 py-4 md:px-8">
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
            <p className="text-sm">
              Couldn't load your Churches. Try reloading the page.
            </p>
          </div>
        ) : null}

        {!optionsQuery.isLoading && !optionsQuery.isError ? (
          <>
            <div className="space-y-3 px-5 pb-6 md:hidden">
              {churches.map((church) => (
                <button
                  key={church.churchId}
                  type="button"
                  disabled={selectMutation.isPending}
                  onClick={() => selectMutation.mutate(church.churchId)}
                  className="group flex min-h-24 w-full items-center gap-4 rounded-lg border bg-card px-4 py-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-60"
                >
                  <Avatar className="size-11 shrink-0 rounded-md after:rounded-md">
                    <AvatarFallback className="rounded-md bg-primary/12 font-semibold text-primary">
                      {initialsFor({ name: church.name })}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{church.name}</span>
                    <span className="mt-1 block text-muted-foreground text-sm">
                      {accessLabel({ accessLevel: church.accessLevel })} ·{' '}
                      {formatLastOpened({
                        lastOpenedAt: church.lastOpenedAt,
                      })}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                </button>
              ))}
            </div>

            <div className="hidden overflow-x-auto border-border border-y md:block">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[minmax(15rem,1.4fr)_minmax(9rem,0.8fr)_minmax(9rem,0.8fr)_minmax(12rem,1fr)_3rem] bg-muted/50 px-8 py-2.5 font-medium text-muted-foreground text-xs">
                  <span>Church</span>
                  <span>Church access</span>
                  <span>Available areas</span>
                  <span>Last opened</span>
                  <span />
                </div>
                {churches.map((church) => (
                  <button
                    key={church.churchId}
                    type="button"
                    disabled={selectMutation.isPending}
                    onClick={() => selectMutation.mutate(church.churchId)}
                    className="grid min-h-20 w-full grid-cols-[minmax(15rem,1.4fr)_minmax(9rem,0.8fr)_minmax(9rem,0.8fr)_minmax(12rem,1fr)_3rem] items-center border-border border-t px-8 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-60"
                  >
                    <span className="flex items-center gap-3">
                      <Avatar className="size-9 rounded-md after:rounded-md">
                        <AvatarFallback className="rounded-md bg-primary/12 font-semibold text-primary">
                          {initialsFor({ name: church.name })}
                        </AvatarFallback>
                      </Avatar>
                      <span>
                        <span className="block font-semibold">
                          {church.name}
                        </span>
                        <span className="block text-muted-foreground text-xs">
                          {church.timezone}
                        </span>
                      </span>
                    </span>
                    <span className="text-sm">
                      {accessLabel({ accessLevel: church.accessLevel })}
                    </span>
                    <span className="text-sm">
                      {areasLabel({ availableAreas: church.availableAreas })}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {formatLastOpened({ lastOpenedAt: church.lastOpenedAt })}
                    </span>
                    <span className="flex size-8 items-center justify-center rounded-md text-muted-foreground">
                      <ArrowRight className="size-4" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}

        <footer className="px-5 py-4 text-muted-foreground text-sm md:px-8">
          Active Church controls every protected request and cached result.
        </footer>
      </main>
    </div>
  );
}

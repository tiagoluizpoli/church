import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell';
import { useCycleBreadcrumb } from '@/features/scheduling/hooks/use-cycle-breadcrumb';
import { useMinistryBreadcrumb } from '@/features/scheduling/hooks/use-ministry-breadcrumb';
import { NotificationBell } from '@/features/volunteers/components/notification-bell';
import type { GetActiveChurchStatus200 } from '@/infrastructure/api/churchAPI.schemas';
import { CallerCapabilitiesScopeProvider } from '@/shared/components/caller-capabilities-scope';
import { TimezoneProvider } from '@/shared/components/timezone-provider';
import {
  extractRequestedChurchId,
  resolveCrossChurchDeepLink,
  stripCrossChurchLinkParam,
} from '@/shared/utils/cross-church-link';
import { activeChurchApi } from '@/utils/api-instances';

interface ResolvedStatusDiscriminant {
  status: 'resolved';
}

/** The resolved entry-gate status — the same shape the status and select calls both return. */
type ResolvedActiveChurchStatus = Extract<
  GetActiveChurchStatus200,
  ResolvedStatusDiscriminant
>;

interface RequireChurchTimezoneInput {
  status: ResolvedActiveChurchStatus;
}

interface ChurchTimezoneContext {
  churchId: string;
  churchTimezone: string;
}

/**
 * A resolved status always carries its Church Timezone (ADR-0003). One
 * without it is a broken contract, and guessing a zone would silently shift
 * every time on screen (#150) — so this throws and the route fails instead.
 */
function requireChurchTimezone({
  status,
}: RequireChurchTimezoneInput): ChurchTimezoneContext {
  if (!status.timezone) {
    throw new Error(
      'The Active Church status did not resolve with a Church Timezone',
    );
  }
  return { churchId: status.churchId, churchTimezone: status.timezone };
}

export const Route = createFileRoute('/_authenticated/_active-church')({
  component: ActiveChurchLayout,
  beforeLoad: async ({ search, location, context }) => {
    // The entry gate's one source of truth: revalidates Church Membership
    // server-side on every load and covers every branch — an already-set
    // Church that no longer checks out, several Memberships with none active,
    // and no Membership at all — rather than only the first of those.
    const status = await activeChurchApi.getActiveChurchStatus();
    const { membershipRemovedFrom } = status;
    // Every redirect below carries it, so the destination can explain a
    // just-removed Church Membership.
    const removalSearch = { removedFrom: membershipRemovedFrom };

    const requestedChurchId = extractRequestedChurchId({ search });
    const currentChurchId =
      status.status === 'resolved' ? status.churchId : null;
    if (requestedChurchId && requestedChurchId !== currentChurchId) {
      // Cached under the query key /select-church and /switch-church-confirm
      // already read from, so a redirect to either shows this list instantly
      // instead of firing a second request for data just fetched here.
      const { churches } = await context.queryClient.ensureQueryData({
        queryKey: ['active-church', 'options'],
        queryFn: () => activeChurchApi.listActiveChurchOptions(),
      });
      const decision = resolveCrossChurchDeepLink({
        requestedChurchId,
        currentChurchId,
        memberChurchIds: churches.map((church) => church.churchId),
      });

      if (decision.kind === 'auto-select') {
        // No existing context is being displaced, so the target Church
        // becomes Active silently and the originally requested destination
        // loads normally below — spec.md §1.5.
        const selected = await activeChurchApi.selectActiveChurch({
          churchId: decision.churchId,
        });
        if (selected.status === 'resolved') {
          return requireChurchTimezone({ status: selected });
        }
        // Not selected after all: the unresolved-status redirects below apply.
      }

      if (decision.kind === 'needs-confirmation') {
        throw redirect({
          to: '/switch-church-confirm',
          search: {
            target: decision.churchId,
            redirect: stripCrossChurchLinkParam({ href: location.href }),
          },
        });
      }

      if (decision.kind === 'access-denied') {
        // Keep the current Active Church; a generic denial never reveals
        // whether the linked resource exists in the target Church.
        throw redirect({
          to: '/dashboard',
          search: { accessDenied: true },
        });
      }
    }

    if (status.status !== 'resolved') {
      if (status.status === 'selection_required') {
        throw redirect({
          to: '/select-church',
          search: removalSearch,
        });
      }
      throw redirect({
        to: '/no-access',
        search: removalSearch,
      });
    }
    if (membershipRemovedFrom) {
      // The one remaining Membership just auto-selected silently — land on
      // the dashboard specifically (not whatever route was in flight) so the
      // explanation has a stable, always-reachable place to show.
      throw redirect({
        to: '/dashboard',
        search: removalSearch,
      });
    }

    // Resolved through `beforeLoad`, which blocks: every route under the
    // layout renders with the right zone on first paint, and a church switch
    // re-runs this gate and hands the layout the new one (ADR-0003, #150).
    return requireChurchTimezone({ status });
  },
});

function ActiveChurchLayout() {
  const { churchId, churchTimezone, session } = Route.useRouteContext();
  const cycleBreadcrumb = useCycleBreadcrumb();
  const ministryBreadcrumb = useMinistryBreadcrumb();
  const overrides = [cycleBreadcrumb, ministryBreadcrumb].filter(
    (override) => override !== null,
  );
  const breadcrumbOverrides = overrides.length > 0 ? overrides : undefined;

  return (
    <CallerCapabilitiesScopeProvider
      churchId={churchId}
      userId={session?.data?.user.id ?? null}
    >
      <TimezoneProvider churchTimezone={churchTimezone}>
        <AppShell
          breadcrumbOverrides={breadcrumbOverrides}
          notificationBell={<NotificationBell />}
        >
          <Outlet />
        </AppShell>
      </TimezoneProvider>
    </CallerCapabilitiesScopeProvider>
  );
}

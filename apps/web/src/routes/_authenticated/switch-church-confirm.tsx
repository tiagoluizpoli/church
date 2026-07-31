import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowRight, Building2, CircleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { ListActiveChurchOptions200ChurchesItem } from '@/infrastructure/api/churchAPI.schemas';
import {
  type ActiveChurchArea,
  switchActiveChurch,
} from '@/shared/utils/active-church-switch';
import { validateInternalReturnTarget } from '@/shared/utils/return-target';
import { activeChurchApi } from '@/utils/api-instances';

const DASHBOARD_PATH = '/dashboard';

const switchChurchConfirmSearchSchema = z.object({
  target: z.string(),
  redirect: z.string().optional(),
});

export const Route = createFileRoute('/_authenticated/switch-church-confirm')({
  validateSearch: (search) => switchChurchConfirmSearchSchema.parse(search),
  component: SwitchChurchConfirmRoute,
});

interface FindChurchInput {
  churches: ListActiveChurchOptions200ChurchesItem[];
  churchId: string | undefined;
}

function findChurch({
  churches,
  churchId,
}: FindChurchInput): ListActiveChurchOptions200ChurchesItem | undefined {
  return churches.find((church) => church.churchId === churchId);
}

interface SwitchMutationInput {
  churchId: string;
  churchName: string;
  availableAreas: ActiveChurchArea[];
}

interface NavigateAfterSwitchInput {
  destination: string;
}

interface SelectChurchInput {
  churchId: string;
}

function SwitchChurchConfirmRoute() {
  const { session } = Route.useRouteContext();
  const { target, redirect } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const destination =
    validateInternalReturnTarget({ target: redirect }) ?? DASHBOARD_PATH;
  const currentChurchId = session.data?.session.activeOrganizationId ?? null;

  const optionsQuery = useQuery({
    queryKey: ['active-church', 'options'],
    queryFn: () => activeChurchApi.listActiveChurchOptions(),
  });

  const selectChurch = async ({
    churchId,
  }: SelectChurchInput): Promise<void> => {
    await activeChurchApi.selectActiveChurch({ churchId });
  };

  const navigateAfterSwitch = ({
    destination: nextDestination,
  }: NavigateAfterSwitchInput): void => {
    navigate({ to: nextDestination });
  };

  const switchMutation = useMutation({
    mutationFn: async (input: SwitchMutationInput): Promise<void> => {
      await switchActiveChurch({
        availableAreas: input.availableAreas,
        churchId: input.churchId,
        churchName: input.churchName,
        destination,
        navigate: navigateAfterSwitch,
        queryClient,
        selectActiveChurch: selectChurch,
      });
    },
  });

  const churches = optionsQuery.data?.churches ?? [];
  const currentChurch = findChurch({
    churches,
    churchId: currentChurchId ?? undefined,
  });
  const targetChurch = findChurch({ churches, churchId: target });
  const hasMembershipChanged =
    optionsQuery.isSuccess && (!currentChurch || !targetChurch);

  // A Membership changed between the deep link firing and this page
  // loading. Keep the current Active Church and deny generically rather
  // than confirm a switch to a Church the caller can no longer prove.
  useEffect(() => {
    if (hasMembershipChanged) {
      navigate({ to: DASHBOARD_PATH, search: { accessDenied: true } });
    }
  }, [hasMembershipChanged, navigate]);

  const handleStay = (): void => {
    navigate({ to: DASHBOARD_PATH });
  };

  const handleSwitch = (): void => {
    if (!targetChurch) return;
    switchMutation.mutate({
      availableAreas: targetChurch.availableAreas,
      churchId: targetChurch.churchId,
      churchName: targetChurch.name,
    });
  };

  if (optionsQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (optionsQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
        <p className="text-muted-foreground text-sm">
          Couldn't load your Churches. Try reloading the page.
        </p>
      </div>
    );
  }

  if (hasMembershipChanged || !currentChurch || !targetChurch) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardContent className="p-6 md:p-8">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="size-5" />
          </div>
          <h1 className="mt-5 text-balance font-semibold text-2xl tracking-tight">
            This link opens another Church
          </h1>
          <p className="mt-3 text-pretty text-foreground/75 leading-6">
            You're currently working in <strong>{currentChurch.name}</strong>.
            The requested page belongs to <strong>{targetChurch.name}</strong>.
          </p>
          <p className="mt-4 text-muted-foreground text-sm">
            Switching clears Church-scoped cached data before the page opens.
            Your membership will be verified again.
          </p>
          {switchMutation.isError ? (
            <div className="mt-4 flex items-start gap-3 rounded-lg bg-destructive/8 p-3">
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-sm">Couldn't switch Church. Try again.</p>
            </div>
          ) : null}
          <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={handleStay}
              disabled={switchMutation.isPending}
            >
              Stay in {currentChurch.name}
            </Button>
            <Button onClick={handleSwitch} disabled={switchMutation.isPending}>
              Switch to {targetChurch.name}
              <ArrowRight />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

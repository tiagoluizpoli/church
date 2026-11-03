import { m } from '@church/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import {
  MEMBERSHIP_READERS,
  resetAfterSelfDemotion,
} from '@/features/people/authority-refresh';
import type { UpcomingAssignment } from '@/features/people/components/upcoming-assignments-alert';
import { peopleQueryKey } from '@/features/people/people-queries';
import type { SetMinistryRoles409 } from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { CALLER_CAPABILITIES_QUERY_KEY } from '@/shared/hooks/use-caller-capabilities';

/** What a refused Ministry Membership change shows in its dialog. */
export type MembershipFailure =
  | { kind: 'blocked'; assignments: UpcomingAssignment[] }
  | { kind: 'message'; message: string };

export interface MembershipRefusal {
  code: string;
  /** Present on `UPCOMING_ASSIGNMENTS`. */
  assignments?: UpcomingAssignment[];
}

/** The generated 409 of the three operations; only `UPCOMING_ASSIGNMENTS` carries blockers. */
type RefusalBody = Partial<
  Extract<SetMinistryRoles409, { assignments: unknown }>
>;

/** The refusal code and any blockers of a failed Ministry Membership change. */
export function readMembershipRefusal(error: unknown): MembershipRefusal {
  const body = isAxiosError<RefusalBody>(error)
    ? error.response?.data
    : undefined;
  return { code: body?.error ?? '', assignments: body?.assignments };
}

/** Refusals meaning the shown card was stale; the dialog closes and the member refreshes. */
const STALE: Record<string, () => string> = {
  MINISTRY_MEMBERSHIP_INACTIVE: () => m.error_ministry_membership_inactive(),
  FORBIDDEN: () => m.error_forbidden(),
  NOT_FOUND: () => m.people_detail_not_found(),
};

interface UseMembershipChangeInput {
  memberId: string;
}

interface CloseIfStaleInput {
  code: string;
  close: () => void;
}

/** Cache refresh and stale-refusal handling shared by the Ministry Membership dialogs. */
export function useMembershipChange({ memberId }: UseMembershipChangeInput) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const churchId = useCallerCapabilitiesScope()?.churchId;

  /** The member, the caller's capabilities, and every scheduling and availability read. */
  const refresh = async () => {
    const readers = [
      peopleQueryKey({ churchId }),
      CALLER_CAPABILITIES_QUERY_KEY,
      ...MEMBERSHIP_READERS,
    ];
    await Promise.all(
      readers.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  };

  /** The caller's own reach shrank: privileged caches drop before anything renders on them. */
  const afterSelfReduction = async () => {
    const { detailReadable } = await resetAfterSelfDemotion({
      queryClient,
      churchId,
      memberId,
    });
    if (!detailReadable) await navigate({ to: '/' });
  };

  /** Toasts, closes and refreshes on a stale-card refusal; false for any other code. */
  const closeIfStale = async ({ code, close }: CloseIfStaleInput) => {
    const message = STALE[code]?.();
    if (!message) return false;
    toast.error(message);
    close();
    await refresh();
    return true;
  };

  return { refresh, afterSelfReduction, closeIfStale };
}

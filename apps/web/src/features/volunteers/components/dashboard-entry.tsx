import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  WorkspaceIntroPanel,
  WorkspacePage,
} from '@/components/workspace-page';
import { VolunteerDashboard } from '@/features/volunteers/components/volunteer-dashboard';
import {
  churchOnlyWarningMessage,
  churchOnlyWarningSearchSchema,
} from '@/shared/utils/church-only-warning';
import {
  membershipRemovedMessage,
  removedFromSearchSchema,
} from '@/shared/utils/membership-removal';
import {
  ministryInvitationResultSearchSchema,
  ministryJoinedMessage,
} from '@/shared/utils/ministry-invitation-result';

export const dashboardSearchSchema = removedFromSearchSchema
  .extend(churchOnlyWarningSearchSchema.shape)
  .extend(ministryInvitationResultSearchSchema.shape)
  .extend({
    section: z
      .enum(['availability', 'assignments', 'ministry_schedule'])
      .optional(),
    eventId: z.string().optional(),
    assignmentId: z.string().optional(),
    ministryId: z.string().optional(),
    accessDenied: z.boolean().optional(),
  });

export type DashboardSearch = z.infer<typeof dashboardSearchSchema>;

interface DashboardEntryProps {
  search: DashboardSearch;
  volunteerName?: string;
}

/** The existing dashboard content, backing both Home (`/`) and `/dashboard`. */
export function DashboardEntry({ search, volunteerName }: DashboardEntryProps) {
  useEffect(() => {
    if (search.removedFrom) {
      toast.info(membershipRemovedMessage({ churchName: search.removedFrom }));
    }
  }, [search.removedFrom]);

  useEffect(() => {
    if (search.accessDenied) {
      toast.info(m.switch_church_access_denied());
    }
  }, [search.accessDenied]);

  useEffect(() => {
    if (search.joinedChurch && search.invitedMinistry) {
      toast.warning(
        churchOnlyWarningMessage({
          churchName: search.joinedChurch,
          ministryName: search.invitedMinistry,
        }),
      );
    }
  }, [search.joinedChurch, search.invitedMinistry]);

  useEffect(() => {
    if (search.joinedMinistry) {
      toast.success(
        ministryJoinedMessage({ ministryName: search.joinedMinistry }),
      );
    }
  }, [search.joinedMinistry]);

  useEffect(() => {
    if (search.invitationDeclined) {
      toast.success(m.ministry_invitation_declined_toast());
    }
  }, [search.invitationDeclined]);

  return (
    <WorkspacePage>
      <WorkspaceIntroPanel
        title={m.dashboard_entry_title()}
        description={
          volunteerName
            ? m.dashboard_entry_description_named({ name: volunteerName })
            : m.dashboard_entry_description()
        }
        aside={
          <Link
            to="/volunteer/availability"
            className="radius-control inline-flex min-h-11 items-center justify-center border border-border bg-background px-4 font-medium text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {m.dashboard_entry_availability_link()}
          </Link>
        }
      />
      <VolunteerDashboard
        initialSection={search.section}
        initialEventId={search.eventId}
        initialAssignmentId={search.assignmentId}
        initialMinistryId={search.ministryId}
      />
    </WorkspacePage>
  );
}

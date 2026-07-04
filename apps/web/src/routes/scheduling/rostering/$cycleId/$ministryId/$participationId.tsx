import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@church/ui/components/alert';
import { Badge } from '@church/ui/components/badge';
import { Button } from '@church/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@church/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@church/ui/components/dialog';
import { Input } from '@church/ui/components/input';
import { Label } from '@church/ui/components/label';
import { Skeleton } from '@church/ui/components/skeleton';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import type { GetScheduleBuilderData200AssignmentsItem } from '@/infrastructure/api/churchAPI.schemas';
import { adminApi } from '@/utils/api-instances';

export const Route = createFileRoute(
  '/scheduling/rostering/$cycleId/$ministryId/$participationId',
)({
  component: RosterBuilderPage,
});

const MIN_REASON_LENGTH = 10;

function isActiveAssignment(status: string): boolean {
  return status !== 'cancelled' && status !== 'declined';
}

type BuilderAssignment = GetScheduleBuilderData200AssignmentsItem & {
  participationId?: string;
  shiftId?: string;
};

interface AssignMutationInput {
  shiftId: string;
  volunteerId: string;
  roleId: string;
  teamId?: string;
  overrideReason?: string;
}

interface ReassignMutationInput {
  assignmentId: string;
  volunteerId: string;
  reason: string;
}

interface ReassignTarget {
  assignmentId: string;
  currentVolunteerName: string;
}

function RosterBuilderPage() {
  const { cycleId, ministryId, participationId } = Route.useParams();
  const queryClient = useQueryClient();
  const [reassignTarget, setReassignTarget] = useState<
    ReassignTarget | undefined
  >(undefined);
  const [reassignVolunteerId, setReassignVolunteerId] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  const closeReassignDialog = () => {
    setReassignTarget(undefined);
    setReassignVolunteerId('');
    setReassignReason('');
  };

  const participationQuery = useQuery({
    queryKey: ['roster-participation', cycleId, ministryId],
    queryFn: () => adminApi.getCycleParticipation(cycleId, { ministryId }),
  });
  const eventView = participationQuery.data?.events.find(
    (event) => event.participation.id === participationId,
  );
  const eventId = eventView?.event.id;

  const builderQuery = useQuery({
    queryKey: ['roster-builder', eventId, ministryId],
    queryFn: () =>
      adminApi.getScheduleBuilderData({ eventId: eventId ?? '', ministryId }),
    enabled: eventId != null,
  });
  const completionQuery = useQuery({
    queryKey: ['roster-completion', participationId],
    queryFn: () => adminApi.getParticipationCompletion(participationId),
  });

  const shifts = eventView?.slots.flatMap((slot) => slot.shifts) ?? [];
  const eligibleQueries = useQueries({
    queries: shifts.map((shift) => ({
      queryKey: ['eligible-volunteers', shift.id],
      queryFn: () => adminApi.listEligibleVolunteers(shift.id),
      staleTime: 30_000,
    })),
  });

  const invalidateRoster = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['roster-participation', cycleId, ministryId],
      }),
      queryClient.invalidateQueries({ queryKey: ['roster-builder', eventId] }),
      queryClient.invalidateQueries({
        queryKey: ['roster-completion', participationId],
      }),
      queryClient.invalidateQueries({ queryKey: ['volunteer-dashboard'] }),
      queryClient.invalidateQueries({
        queryKey: ['ministry-schedule', ministryId],
      }),
    ]);
  };

  const assignMutation = useMutation({
    mutationFn: ({
      shiftId,
      volunteerId,
      roleId,
      teamId,
      overrideReason,
    }: AssignMutationInput) =>
      adminApi.createParticipationAssignment(shiftId, {
        volunteerId,
        roleId,
        teamId,
        override: overrideReason ? { reason: overrideReason } : undefined,
      }),
    onSuccess: async (result) => {
      if (result.warnings.length > 0) {
        toast.warning(
          result.warnings.map((warning) => warning.type).join(', '),
        );
      } else {
        toast.success('Volunteer assigned.');
      }
      await invalidateRoster();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const reassignMutation = useMutation({
    mutationFn: ({
      assignmentId,
      volunteerId,
      reason,
    }: ReassignMutationInput) =>
      adminApi.reassignParticipationAssignment(assignmentId, {
        volunteerId,
        reason,
      }),
    onSuccess: async () => {
      toast.success('Assignment reassigned.');
      await invalidateRoster();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const publishMutation = useMutation({
    mutationFn: (confirmBelowFull: boolean) =>
      adminApi.publishParticipation(participationId, {
        confirmBelowFull: confirmBelowFull || undefined,
      }),
    onSuccess: async () => {
      toast.success('Participation published.');
      await invalidateRoster();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (
    participationQuery.isLoading ||
    builderQuery.isLoading ||
    completionQuery.isLoading
  ) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (
    participationQuery.isError ||
    builderQuery.isError ||
    completionQuery.isError ||
    !completionQuery.data ||
    !eventView ||
    !builderQuery.data
  ) {
    return (
      <Alert>
        <AlertTitle>Roster unavailable</AlertTitle>
        <AlertDescription>
          {participationQuery.error?.message ??
            builderQuery.error?.message ??
            completionQuery.error?.message ??
            'Participation not found for this roster view.'}
        </AlertDescription>
      </Alert>
    );
  }

  const completion = completionQuery.data;
  const assignments = (
    builderQuery.data.assignments as BuilderAssignment[]
  ).filter((assignment) => assignment.participationId === participationId);
  const volunteersById = new Map(
    builderQuery.data.volunteers.map((volunteer) => [
      volunteer.id,
      volunteer.name,
    ]),
  );
  const rolesById = new Map(
    builderQuery.data.roles.map((role) => [role.id, role.name]),
  );
  const eligibleByShiftId = new Map(
    shifts.map((shift, index) => [
      shift.id,
      eligibleQueries[index]?.data?.volunteers ?? [],
    ]),
  );

  return (
    <div className="space-y-6" data-testid="roster-page">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h1 className="font-bold text-2xl">{eventView.event.title}</h1>
          <p className="text-muted-foreground text-sm">
            Roster one ministry participation at a time. Publishing here does
            not touch sibling ministries on the same event.
          </p>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline">{eventView.participation.state}</Badge>
            <span>{completion.completionPercent}% complete</span>
            <span>
              {completion.assignedCount}/{completion.requiredCount} filled
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/scheduling/tailoring"
            className="inline-flex h-9 items-center justify-center border px-3 text-sm"
          >
            Back to tailoring
          </Link>
          <Button
            type="button"
            data-testid="publish-participation-button"
            disabled={publishMutation.isPending}
            onClick={() => {
              const needsConfirm = completion.completionPercent < 100;
              if (
                needsConfirm &&
                !window.confirm(
                  'This participation is below 100% staffed. Publish anyway?',
                )
              ) {
                return;
              }
              publishMutation.mutate(needsConfirm);
            }}
          >
            {publishMutation.isPending
              ? 'Publishing…'
              : 'Publish participation'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Completion</CardTitle>
          <CardDescription>
            Track staffing before you publish this ministry slice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-3 w-full overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: `${Math.min(100, completion.completionPercent)}%`,
              }}
            />
          </div>
          <div
            className="text-muted-foreground text-sm"
            data-testid="roster-completion-summary"
          >
            {completion.assignedCount} assigned across{' '}
            {completion.requiredCount} required positions.
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {eventView.slots.map((slot) => (
          <Card key={slot.slot.id}>
            <CardHeader>
              <CardTitle>{slot.slot.label ?? 'Event slot'}</CardTitle>
              <CardDescription>
                {new Date(slot.slot.startTime).toLocaleString()} -{' '}
                {new Date(slot.slot.endTime).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {slot.shifts.map((shift) => {
                const shiftAssignments = assignments.filter(
                  (assignment) =>
                    assignment.shiftId === shift.id &&
                    isActiveAssignment(assignment.status),
                );
                const shiftRequirements = slot.requirements.filter(
                  (requirement) => requirement.shiftId === shift.id,
                );
                const eligibleVolunteers =
                  eligibleByShiftId.get(shift.id) ?? [];

                return (
                  <div key={shift.id} className="space-y-4 rounded border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">
                          {shift.label ?? 'Shift'}
                        </div>
                        <div className="text-muted-foreground text-sm">
                          {new Date(shift.startTime).toLocaleTimeString()} -{' '}
                          {new Date(shift.endTime).toLocaleTimeString()}
                        </div>
                      </div>
                      <Badge variant="outline">
                        {shiftAssignments.length} active assignments
                      </Badge>
                    </div>

                    {shiftRequirements.map((requirement) => {
                      const assignedForRequirement = shiftAssignments.filter(
                        (assignment) =>
                          assignment.roleId === requirement.roleId,
                      );
                      const openCount = Math.max(
                        0,
                        requirement.requiredCount -
                          assignedForRequirement.length,
                      );

                      return (
                        <div
                          key={requirement.id}
                          className="space-y-3 rounded border p-3"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="font-medium">
                              {rolesById.get(requirement.roleId) ??
                                requirement.roleId}
                            </div>
                            {requirement.teamId ? (
                              <Badge variant="outline">Team scoped</Badge>
                            ) : null}
                            <Badge
                              variant={openCount > 0 ? 'secondary' : 'outline'}
                            >
                              {openCount} open
                            </Badge>
                          </div>

                          <div className="space-y-2">
                            {assignedForRequirement.length > 0 ? (
                              assignedForRequirement.map((assignment) => (
                                <div
                                  key={assignment.id}
                                  className="flex items-center justify-between rounded border px-3 py-2 text-sm"
                                >
                                  <span>
                                    {volunteersById.get(
                                      assignment.volunteerId,
                                    ) ?? assignment.volunteerId}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline">
                                      {assignment.status}
                                    </Badge>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      data-testid="reassign-assignment-button"
                                      disabled={reassignMutation.isPending}
                                      onClick={() =>
                                        setReassignTarget({
                                          assignmentId: assignment.id,
                                          currentVolunteerName:
                                            volunteersById.get(
                                              assignment.volunteerId,
                                            ) ?? assignment.volunteerId,
                                        })
                                      }
                                    >
                                      Reassign
                                    </Button>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-muted-foreground text-sm">
                                No one assigned yet.
                              </div>
                            )}
                          </div>

                          {openCount > 0 ? (
                            <div className="space-y-2">
                              <div className="font-medium text-sm">
                                Ranked volunteers
                              </div>
                              <div className="grid gap-2">
                                {eligibleVolunteers.map((volunteer) => (
                                  <div
                                    key={`${requirement.id}-${volunteer.volunteerId}`}
                                    data-testid="eligible-volunteer-row"
                                    className="flex flex-col gap-2 rounded border px-3 py-2 md:flex-row md:items-center md:justify-between"
                                  >
                                    <div className="space-y-1">
                                      <div className="font-medium text-sm">
                                        {volunteer.volunteerName}
                                      </div>
                                      <div className="flex flex-wrap gap-2 text-xs">
                                        <Badge
                                          variant={
                                            volunteer.isAvailable
                                              ? 'outline'
                                              : 'destructive'
                                          }
                                        >
                                          {volunteer.isAvailable
                                            ? 'Available'
                                            : 'Unavailable'}
                                        </Badge>
                                        {volunteer.hasConflict ? (
                                          <Badge variant="secondary">
                                            Conflict
                                          </Badge>
                                        ) : null}
                                        {volunteer.lastServedAt ? (
                                          <Badge variant="outline">
                                            Last served{' '}
                                            {new Date(
                                              volunteer.lastServedAt,
                                            ).toLocaleDateString()}
                                          </Badge>
                                        ) : null}
                                      </div>
                                    </div>

                                    <Button
                                      type="button"
                                      size="sm"
                                      data-testid="assign-volunteer-button"
                                      disabled={assignMutation.isPending}
                                      onClick={() => {
                                        const needsOverride =
                                          !volunteer.isAvailable ||
                                          volunteer.hasConflict;
                                        const overrideReason = needsOverride
                                          ? (window.prompt(
                                              'Override reason (min 10 chars)',
                                              'Leader approved roster override',
                                            ) ?? '')
                                          : undefined;
                                        const normalizedOverrideReason =
                                          overrideReason ?? '';
                                        if (
                                          needsOverride &&
                                          normalizedOverrideReason.trim()
                                            .length < MIN_REASON_LENGTH
                                        ) {
                                          toast.error(
                                            'Override reason must be at least 10 characters.',
                                          );
                                          return;
                                        }

                                        assignMutation.mutate({
                                          shiftId: shift.id,
                                          volunteerId: volunteer.volunteerId,
                                          roleId: requirement.roleId,
                                          teamId: requirement.teamId,
                                          overrideReason:
                                            normalizedOverrideReason ||
                                            undefined,
                                        });
                                      }}
                                    >
                                      Assign
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={reassignTarget != null}
        onOpenChange={(open) => {
          if (!open) {
            closeReassignDialog();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign shift</DialogTitle>
            <DialogDescription>
              {reassignTarget
                ? `Move this shift from ${reassignTarget.currentVolunteerName} to another volunteer.`
                : null}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="reassign-volunteer-id">New volunteer id</Label>
              <Input
                id="reassign-volunteer-id"
                value={reassignVolunteerId}
                onChange={(event) => setReassignVolunteerId(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reassign-reason">
                Reason (min {MIN_REASON_LENGTH} characters)
              </Label>
              <Input
                id="reassign-reason"
                value={reassignReason}
                onChange={(event) => setReassignReason(event.target.value)}
                placeholder="Original volunteer became unavailable"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeReassignDialog}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={reassignMutation.isPending}
              onClick={() => {
                if (!reassignTarget || !reassignVolunteerId.trim()) {
                  return;
                }
                if (reassignReason.trim().length < MIN_REASON_LENGTH) {
                  toast.error(
                    `Reason must be at least ${MIN_REASON_LENGTH} characters.`,
                  );
                  return;
                }

                reassignMutation.mutate({
                  assignmentId: reassignTarget.assignmentId,
                  volunteerId: reassignVolunteerId.trim(),
                  reason: reassignReason.trim(),
                });
                closeReassignDialog();
              }}
            >
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

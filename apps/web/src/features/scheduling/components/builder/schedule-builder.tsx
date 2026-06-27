import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@church/ui/components/alert-dialog';
import { Skeleton } from '@church/ui/components/skeleton';
import { TooltipProvider } from '@church/ui/components/tooltip';
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTimezone } from '../../../../shared/hooks/use-timezone';
import { useAutoSave } from '../../hooks/use-auto-save';
import {
  type ScheduleBuilderData,
  useScheduleBuilder,
} from '../../hooks/use-schedule-builder';
import { mapAvailabilityStatus } from '../../utils/availability-status';
import type { ConflictStatus } from './assignment-chip';
import { AuditLogPanel } from './audit-log-panel';
import { BuilderGrid } from './builder-grid';
import { BuilderHeader } from './builder-header';
import { EmptyBuilderState } from './empty-builder-state';
import { MobileInterstitial } from './mobile-interstitial';
import { OverrideDialog } from './override-dialog';
import { SlotEditModal, type SlotEditValues } from './slot-edit-modal';
import { SlotGenerateWizard } from './slot-generate-wizard';
import { SubstitutionPicker } from './substitution-picker';
import { VolunteerPoolSidebar } from './volunteer-pool-sidebar';
import { trpc } from '@/utils/trpc';

interface ScheduleBuilderProps {
  eventId: string;
}

interface OverrideState {
  slotId: string;
  roleId: string;
  volunteerId: string;
  volunteerName: string;
  conflictType: ConflictStatus;
  slotLabel: string;
}

interface SubstitutionState {
  declinedAssignmentId: string;
  declinedVolunteerId: string;
  declinedVolunteerName: string;
  roleId: string;
}

interface SlotModalState {
  mode: 'create' | 'edit';
  slotId?: string;
  initial?: SlotEditValues;
}

interface DeleteSlotState {
  slotId: string;
  assignmentCount: number;
}

function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  if (localStorage.getItem('builder-mobile-override') === 'true') return false;
  return window.innerWidth < 1024 || navigator.maxTouchPoints > 0;
}

export function ScheduleBuilder({ eventId }: ScheduleBuilderProps) {
  const {
    query,
    data,
    refetch,
    invalidate,
    createAssignment,
    deleteAssignment,
    publishEvent,
    eventFillRatio,
    hasHardViolations,
    callerTeamId,
  } = useScheduleBuilder(eventId);

  const { format } = useTimezone();
  const [showMobile, setShowMobile] = useState(false);
  const [override, setOverride] = useState<OverrideState | null>(null);
  const [substitution, setSubstitution] = useState<SubstitutionState | null>(
    null,
  );
  const [auditOpen, setAuditOpen] = useState(false);
  const [slotModal, setSlotModal] = useState<SlotModalState | null>(null);
  const [slotError, setSlotError] = useState<string | undefined>();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteSlotState, setDeleteSlotState] =
    useState<DeleteSlotState | null>(null);

  useEffect(() => {
    setShowMobile(isMobile());
  }, []);

  const upsertRequirement = useMutation(
    trpc.adminLeader.upsertSlotRequirement.mutationOptions({
      onSettled: () => invalidate(),
    }),
  );
  const createSlot = useMutation(
    trpc.adminLeader.createSlot.mutationOptions({
      onSettled: () => invalidate(),
    }),
  );
  const updateSlot = useMutation(
    trpc.adminLeader.updateSlot.mutationOptions({
      onSettled: () => invalidate(),
    }),
  );
  const deleteSlot = useMutation(
    trpc.adminLeader.deleteSlot.mutationOptions({
      onSettled: () => invalidate(),
    }),
  );
  const sendReminder = useMutation(
    trpc.adminLeader.sendReminder.mutationOptions(),
  );

  const saveStatus = useAutoSave([
    createAssignment,
    deleteAssignment,
    upsertRequirement,
  ]);

  const sensors = useSensors(useSensor(PointerSensor));

  if (showMobile) {
    return <MobileInterstitial onContinue={() => setShowMobile(false)} />;
  }

  if (query.isLoading || !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded border border-destructive p-4 text-destructive text-sm">
        {query.error?.message ?? 'Failed to load builder'}
      </div>
    );
  }

  const builderData: ScheduleBuilderData = data;

  const slotLabelOf = (slotId: string): string => {
    const slot = builderData.slots.find((s) => s.id === slotId);
    if (!slot) return '';
    return (
      slot.label ??
      `${format(slot.startTime, 'p')}–${format(slot.endTime, 'p')}`
    );
  };

  const conflictTypeOf = (volunteerId: string): ConflictStatus => {
    const av = builderData.volunteerAvailability.find(
      (v) => v.volunteerId === volunteerId,
    );
    return av && mapAvailabilityStatus(av.status) === 'unavailable'
      ? 'unavailable'
      : 'double_booked';
  };

  const volunteerNameOf = (volunteerId: string): string =>
    builderData.volunteerAvailability.find((v) => v.volunteerId === volunteerId)
      ?.volunteerName ?? volunteerId;

  const handleAssign = async (
    slotId: string,
    roleId: string,
    volunteerId: string,
  ) => {
    const res = await createAssignment.mutateAsync({
      timeSlotId: slotId,
      volunteerId,
      roleId,
    });
    if (res && 'conflictReport' in res && res.conflictReport) {
      setOverride({
        slotId,
        roleId,
        volunteerId,
        volunteerName: volunteerNameOf(volunteerId),
        conflictType: conflictTypeOf(volunteerId),
        slotLabel: slotLabelOf(slotId),
      });
    }
  };

  const handleConfirmOverride = async (reason: string) => {
    if (!override) return;
    await createAssignment.mutateAsync({
      timeSlotId: override.slotId,
      volunteerId: override.volunteerId,
      roleId: override.roleId,
      allowOverride: true,
      overrideReason: reason,
    });
    setOverride(null);
  };

  const handleSubstituteSelect = async (newVolunteerId: string) => {
    if (!substitution) return;
    await deleteAssignment.mutateAsync({
      assignmentId: substitution.declinedAssignmentId,
    });
    await handleAssign(
      // find the slot for the declined assignment
      builderData.assignments.find(
        (a) => a.id === substitution.declinedAssignmentId,
      )?.slotId ?? '',
      substitution.roleId,
      newVolunteerId,
    );
    setSubstitution(null);
  };

  const requiredCountOf = (slotId: string, roleId: string): number =>
    builderData.requirements.find(
      (r) => r.slotId === slotId && r.roleId === roleId,
    )?.requiredCount ?? 0;

  const handleIncrement = (slotId: string, roleId: string) =>
    upsertRequirement.mutate({
      timeSlotId: slotId,
      roleId,
      count: requiredCountOf(slotId, roleId) + 1,
    });

  const handleDecrement = (slotId: string, roleId: string) => {
    const next = Math.max(1, requiredCountOf(slotId, roleId) - 1);
    upsertRequirement.mutate({ timeSlotId: slotId, roleId, count: next });
  };

  const handleSaveSlot = async (values: SlotEditValues) => {
    setSlotError(undefined);
    try {
      if (slotModal?.mode === 'edit' && slotModal.slotId) {
        await updateSlot.mutateAsync({
          slotId: slotModal.slotId,
          startTime: values.startTime,
          endTime: values.endTime,
          label: values.label,
        });
      } else {
        await createSlot.mutateAsync({
          eventId,
          startTime: values.startTime,
          endTime: values.endTime,
          label: values.label,
        });
      }
      setSlotModal(null);
    } catch (err) {
      setSlotError((err as Error).message);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    const res = await deleteSlot.mutateAsync({ slotId });
    if (!res.success && res.assignmentCount > 0) {
      setDeleteSlotState({ slotId, assignmentCount: res.assignmentCount });
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const volunteerId = e.active.data.current?.volunteerId as
      | string
      | undefined;
    const dropData = e.over?.data.current as
      | { slotId: string; roleId: string }
      | undefined;
    if (volunteerId && dropData) {
      void handleAssign(dropData.slotId, dropData.roleId, volunteerId);
    }
  };

  const pickerVolunteers = builderData.volunteerAvailability.map((v) => ({
    id: v.volunteerId,
    name: v.volunteerName,
    availabilityStatus: mapAvailabilityStatus(v.status),
    alreadyAssignedCount: builderData.assignments.filter(
      (a) =>
        a.volunteerId === v.volunteerId &&
        a.status !== 'cancelled' &&
        a.status !== 'declined',
    ).length,
  }));

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        <BuilderHeader
          event={builderData.event}
          fillPercentage={eventFillRatio}
          saveStatus={saveStatus}
          canPublish={!hasHardViolations}
          isPublishing={publishEvent.isPending}
          onPublish={() =>
            publishEvent.mutate(
              { eventId },
              {
                onSuccess: () => toast.success('Event published'),
              },
            )
          }
          onSendReminder={() =>
            sendReminder.mutate(
              { eventId },
              {
                onSuccess: (r) =>
                  toast.success(
                    `Reminder sent to ${r.notifiedCount} volunteers`,
                  ),
                onError: (e) => toast.error(e.message),
              },
            )
          }
          onRetry={() => refetch()}
          onRefresh={() => refetch()}
          onOpenAuditLog={() => setAuditOpen(true)}
          onOpenPrintExport={() => toast.info('Print / Export coming soon')}
        />

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex gap-4">
            <VolunteerPoolSidebar
              volunteers={builderData.volunteerAvailability.map((v) => ({
                volunteerId: v.volunteerId,
                volunteerName: v.volunteerName,
                status: mapAvailabilityStatus(v.status),
                conflictReason: v.conflictReason ?? undefined,
              }))}
              assignments={builderData.assignments}
              roles={builderData.roles}
            />

            <div className="flex-1">
              {builderData.slots.length === 0 ? (
                <EmptyBuilderState
                  onAutoGenerate={() => setWizardOpen(true)}
                  onAddManually={() => setSlotModal({ mode: 'create' })}
                />
              ) : (
                <BuilderGrid
                  data={builderData}
                  callerTeamId={callerTeamId}
                  onAssign={(s, r, v) => void handleAssign(s, r, v)}
                  onRemove={(id) =>
                    deleteAssignment.mutate({ assignmentId: id })
                  }
                  onOverride={(s, r, v) =>
                    setOverride({
                      slotId: s,
                      roleId: r,
                      volunteerId: v,
                      volunteerName: volunteerNameOf(v),
                      conflictType: conflictTypeOf(v),
                      slotLabel: slotLabelOf(s),
                    })
                  }
                  onSubstitute={(assignmentId, roleId) => {
                    const a = builderData.assignments.find(
                      (x) => x.id === assignmentId,
                    );
                    setSubstitution({
                      declinedAssignmentId: assignmentId,
                      declinedVolunteerId: a?.volunteerId ?? '',
                      declinedVolunteerName: a?.volunteerName ?? '',
                      roleId,
                    });
                  }}
                  onIncrement={handleIncrement}
                  onDecrement={handleDecrement}
                  onEditSlot={(slotId) => {
                    const slot = builderData.slots.find((s) => s.id === slotId);
                    setSlotModal({
                      mode: 'edit',
                      slotId,
                      initial: slot
                        ? {
                            startTime: new Date(slot.startTime).toISOString(),
                            endTime: new Date(slot.endTime).toISOString(),
                            label: slot.label ?? undefined,
                          }
                        : undefined,
                    });
                  }}
                  onDeleteSlot={(slotId) => void handleDeleteSlot(slotId)}
                  onAddSlot={() => setSlotModal({ mode: 'create' })}
                />
              )}
            </div>
          </div>
        </DndContext>
      </div>

      {override && (
        <OverrideDialog
          open
          onOpenChange={(o) => !o && setOverride(null)}
          conflictType={override.conflictType}
          volunteerName={override.volunteerName}
          slotLabel={override.slotLabel}
          isPending={createAssignment.isPending}
          onConfirm={handleConfirmOverride}
        />
      )}

      {substitution && (
        <SubstitutionPicker
          open
          onOpenChange={(o) => !o && setSubstitution(null)}
          declinedVolunteerName={substitution.declinedVolunteerName}
          declinedVolunteerId={substitution.declinedVolunteerId}
          volunteers={pickerVolunteers}
          onSelect={(id) => void handleSubstituteSelect(id)}
        />
      )}

      <AuditLogPanel
        open={auditOpen}
        onOpenChange={setAuditOpen}
        eventId={eventId}
      />

      {slotModal && (
        <SlotEditModal
          open
          onOpenChange={(o) => {
            if (!o) {
              setSlotModal(null);
              setSlotError(undefined);
            }
          }}
          mode={slotModal.mode}
          eventType={builderData.event.eventType}
          initial={slotModal.initial}
          isPending={createSlot.isPending || updateSlot.isPending}
          errorMessage={slotError}
          onSave={handleSaveSlot}
        />
      )}

      <SlotGenerateWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        eventId={eventId}
        ministryId={builderData.event.ministryId}
        onComplete={() => invalidate()}
      />

      <AlertDialog
        open={!!deleteSlotState}
        onOpenChange={(o) => !o && setDeleteSlotState(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete slot with assignments?</AlertDialogTitle>
            <AlertDialogDescription>
              This slot has {deleteSlotState?.assignmentCount} active
              assignment(s). Deleting it will remove them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteSlotState) {
                  deleteSlot.mutate({
                    slotId: deleteSlotState.slotId,
                    force: true,
                  });
                  setDeleteSlotState(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

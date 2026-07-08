import { DndContext, DragOverlay } from '@dnd-kit/core';
import type {
  ScheduleBuilderData,
  useScheduleBuilder,
} from '../../hooks/use-schedule-builder';
import { AuditLogPanel } from './audit-log-panel';
import { BuilderGrid } from './builder-grid';
import { BuilderHeader } from './builder-header';
import { EmptyBuilderState } from './empty-builder-state';
import { OverrideDialog } from './override-dialog';
import { SlotEditModal } from './slot-edit-modal';
import { SlotGenerateWizard } from './slot-generate-wizard';
import { SubstitutionPicker } from './substitution-picker';
import { useScheduleBuilderController } from './use-schedule-builder-controller';
import { VolunteerCard } from './volunteer-card';
import { VolunteerPoolSidebar } from './volunteer-pool-sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useTimezone } from '@/shared/hooks/use-timezone';

interface ScheduleBuilderReadyProps {
  builderData: ScheduleBuilderData;
  callerTeamId: string | null;
  eventFillRatio: number;
  eventId: string;
  hasHardViolations: boolean;
  invalidate: ReturnType<typeof useScheduleBuilder>['invalidate'];
  refetch: ReturnType<typeof useScheduleBuilder>['refetch'];
  createAssignment: ReturnType<typeof useScheduleBuilder>['createAssignment'];
  deleteAssignment: ReturnType<typeof useScheduleBuilder>['deleteAssignment'];
  publishEvent: ReturnType<typeof useScheduleBuilder>['publishEvent'];
}

export function ScheduleBuilderReady({
  builderData,
  callerTeamId,
  eventFillRatio,
  eventId,
  hasHardViolations,
  invalidate,
  refetch,
  createAssignment,
  deleteAssignment,
  publishEvent,
}: ScheduleBuilderReadyProps) {
  const { format } = useTimezone();
  const controller = useScheduleBuilderController({
    builderData,
    eventId,
    format,
    invalidate,
    refetch,
    createAssignment,
    deleteAssignment,
    publishEvent,
  });

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-4">
        <BuilderHeader
          event={builderData.event}
          fillPercentage={eventFillRatio}
          saveStatus={controller.saveStatus}
          canPublish={!hasHardViolations}
          isPublishing={publishEvent.isPending}
          onPublish={controller.handlePublish}
          onSendReminder={controller.handleSendReminder}
          onRetry={controller.handleRefresh}
          onRefresh={controller.handleRefresh}
          onOpenAuditLog={controller.handleOpenAuditLog}
          onOpenPrintExport={controller.handleOpenPrintExport}
        />

        <DndContext
          sensors={controller.sensors}
          onDragStart={controller.handleDragStart}
          onDragEnd={controller.handleDragEnd}
          onDragCancel={() => controller.setActiveDraggedVolunteer(null)}
        >
          <div className="flex gap-4">
            <VolunteerPoolSidebar
              volunteers={controller.sidebarVolunteers}
              assignments={builderData.assignments}
              roles={builderData.roles}
              selectedVolunteerId={controller.selectedSidebarVolunteerId}
              onSelectVolunteer={(volunteerId) =>
                controller.setSelectedSidebarVolunteerId(
                  (currentVolunteerId) =>
                    currentVolunteerId === volunteerId
                      ? undefined
                      : volunteerId,
                )
              }
            />

            <div className="flex-1">
              {builderData.slots.length === 0 ? (
                <EmptyBuilderState
                  onAutoGenerate={() => controller.setWizardOpen(true)}
                  onAddManually={controller.handleAddManualSlot}
                />
              ) : (
                <BuilderGrid
                  data={builderData}
                  callerTeamId={callerTeamId}
                  onAssign={(slotId, roleId, volunteerId) =>
                    void controller.handleAssign({
                      slotId,
                      roleId,
                      volunteerId,
                    })
                  }
                  onRemove={(assignmentId) =>
                    deleteAssignment.mutate({ assignmentId })
                  }
                  onOverride={controller.handleOverrideRequest}
                  onSubstitute={controller.handleSubstituteRequest}
                  selectedVolunteerId={controller.selectedSidebarVolunteerId}
                  selectedVolunteerName={
                    controller.sidebarVolunteers.find(
                      (volunteer) =>
                        volunteer.volunteerId ===
                        controller.selectedSidebarVolunteerId,
                    )?.volunteerName
                  }
                  onIncrement={controller.handleIncrement}
                  onDecrement={controller.handleDecrement}
                  onEditSlot={controller.handleEditSlot}
                  onDeleteSlot={(slotId) =>
                    void controller.handleDeleteSlot(slotId)
                  }
                  onAddSlot={controller.handleAddManualSlot}
                />
              )}
            </div>
          </div>

          <DragOverlay>
            {controller.activeDraggedVolunteer ? (
              <VolunteerCard
                volunteer={controller.activeDraggedVolunteer}
                isOverlay={true}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {controller.substitution && (
        <SubstitutionPicker
          open={true}
          onOpenChange={(open) => !open && controller.setSubstitution(null)}
          declinedVolunteerName={controller.substitution.declinedVolunteerName}
          declinedVolunteerSystemRole={
            controller.substitution.declinedVolunteerSystemRole
          }
          declinedVolunteerId={controller.substitution.declinedVolunteerId}
          volunteers={controller.pickerVolunteers}
          onSelect={(newVolunteerId) =>
            void controller.handleSubstituteSelect(newVolunteerId)
          }
        />
      )}

      <AuditLogPanel
        open={controller.auditOpen}
        onOpenChange={controller.setAuditOpen}
        assignments={builderData.assignments}
      />

      {controller.override && (
        <OverrideDialog
          open={true}
          onOpenChange={(open) => !open && controller.setOverride(null)}
          conflictType={controller.override.conflictType}
          volunteerName={controller.override.volunteerName}
          volunteerSystemRole={controller.override.volunteerSystemRole}
          slotLabel={controller.override.slotLabel}
          isPending={controller.overrideAssignment.isPending}
          onConfirm={(reason) =>
            controller.overrideAssignment.mutate({
              assignmentId: controller.override?.assignmentId ?? '',
              reason,
            })
          }
        />
      )}

      {controller.slotModal && (
        <SlotEditModal
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              controller.setSlotModal(null);
              controller.setSlotError(undefined);
            }
          }}
          mode={controller.slotModal.mode}
          eventType={builderData.event.eventType}
          initial={controller.slotModal.initial}
          isPending={
            controller.createSlot.isPending || controller.updateSlot.isPending
          }
          errorMessage={controller.slotError}
          onSave={controller.handleSaveSlot}
        />
      )}

      <SlotGenerateWizard
        open={controller.wizardOpen}
        onOpenChange={controller.setWizardOpen}
        eventId={eventId}
        onComplete={() => controller.invalidate()}
      />
    </TooltipProvider>
  );
}

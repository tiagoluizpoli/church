import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@church/ui/components/alert';
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
import { Badge } from '@church/ui/components/badge';
import { Button } from '@church/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@church/ui/components/card';
import { Input } from '@church/ui/components/input';
import { Label } from '@church/ui/components/label';
import { WifiOff } from 'lucide-react';
import { useState } from 'react';
import {
  formatAssignmentWindow,
  getAggregateResponseLabel,
  getAssignmentStatusLabel,
} from '../lib/assignment-grouping';
import type {
  DashboardAssignmentGroup,
  DashboardAssignmentItem,
} from '../lib/dashboard-mappers';

export interface AssignmentResponseInput {
  assignmentId: string;
  response: 'confirmed' | 'declined';
}

export interface UpcomingAssignmentsSectionProps {
  groups: DashboardAssignmentGroup[];
  expandedEventId?: string;
  isOnline: boolean;
  responseState: 'idle' | 'saving';
  onToggleEvent: (eventId: string) => void;
  onRespond: (input: AssignmentResponseInput) => void;
}

const DECLINE_CONFIRMATION_PHRASE = 'I cannot serve';

function getTimingLabel(assignment: DashboardAssignmentItem): string {
  return assignment.timingState === 'in_progress' ? 'In progress' : 'Upcoming';
}

function shouldShowConfirmAction(assignment: DashboardAssignmentItem): boolean {
  return assignment.status === 'pending';
}

function shouldShowDeclineAction(assignment: DashboardAssignmentItem): boolean {
  return assignment.status === 'pending' || assignment.status === 'confirmed';
}

export function UpcomingAssignmentsSection({
  groups,
  expandedEventId,
  isOnline,
  responseState,
  onToggleEvent,
  onRespond,
}: UpcomingAssignmentsSectionProps) {
  const isSaving = responseState === 'saving';
  const [pendingDeclineAssignment, setPendingDeclineAssignment] = useState<
    DashboardAssignmentItem | undefined
  >(undefined);
  const [confirmationValue, setConfirmationValue] = useState('');

  const closeDeclineDialog = () => {
    setPendingDeclineAssignment(undefined);
    setConfirmationValue('');
  };

  const canConfirmDecline =
    pendingDeclineAssignment != null &&
    confirmationValue === DECLINE_CONFIRMATION_PHRASE &&
    !isSaving &&
    isOnline;

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>My Upcoming Assignments</CardTitle>
          <CardDescription>
            Review your published assignments and let your leader know if you
            can no longer serve.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isOnline ? (
            <Alert variant="destructive">
              <WifiOff className="size-4" />
              <AlertTitle>Offline</AlertTitle>
              <AlertDescription>
                Assignment responses stay blocked until your connection returns.
              </AlertDescription>
            </Alert>
          ) : null}

          {groups.length === 0 ? (
            <Alert>
              <AlertTitle>No upcoming assignments</AlertTitle>
              <AlertDescription>
                You are not currently scheduled for any upcoming published
                assignments.
              </AlertDescription>
            </Alert>
          ) : null}

          {groups.map((group) => {
            const isExpanded = expandedEventId === group.eventId;

            return (
              <div key={group.eventId} className="border p-3">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="font-medium">{group.eventTitle}</div>
                    <div className="text-muted-foreground">
                      {group.ministryName}
                    </div>
                    <div className="text-muted-foreground">
                      {new Date(group.eventStart).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {getAggregateResponseLabel(group)}
                    </Badge>
                    {group.hasPendingResponse ? (
                      <Badge variant="secondary">Needs response</Badge>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onToggleEvent(group.eventId)}
                    >
                      {isExpanded
                        ? `Hide assignments for ${group.eventTitle}`
                        : `Show assignments for ${group.eventTitle}`}
                    </Button>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="mt-4 space-y-3">
                    {group.assignments.map((assignment) => {
                      const actionsDisabled =
                        !isOnline || !assignment.canRespond || isSaving;

                      return (
                        <div
                          key={assignment.assignmentId}
                          className="space-y-3 border px-3 py-2"
                        >
                          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-1">
                              <div className="font-medium">
                                {assignment.roleName}
                              </div>
                              <div className="text-muted-foreground">
                                {formatAssignmentWindow(assignment)}
                              </div>
                              {assignment.timingState === 'in_progress' ? (
                                <div className="text-muted-foreground">
                                  This assignment is already in progress, so
                                  responses are locked.
                                </div>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">
                                {getAssignmentStatusLabel(assignment)}
                              </Badge>
                              <Badge variant="outline">
                                {getTimingLabel(assignment)}
                              </Badge>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {shouldShowConfirmAction(assignment) ? (
                              <Button
                                type="button"
                                variant="outline"
                                disabled={actionsDisabled}
                                onClick={() =>
                                  onRespond({
                                    assignmentId: assignment.assignmentId,
                                    response: 'confirmed',
                                  })
                                }
                              >
                                Confirm
                              </Button>
                            ) : null}
                            {shouldShowDeclineAction(assignment) ? (
                              <Button
                                type="button"
                                variant="destructive"
                                disabled={actionsDisabled}
                                onClick={() =>
                                  setPendingDeclineAssignment(assignment)
                                }
                              >
                                I cannot serve
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <AlertDialog
        open={pendingDeclineAssignment != null}
        onOpenChange={(open) => {
          if (!open) {
            closeDeclineDialog();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm unable-to-serve notice</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately notify your leader that you can no longer
              serve this assignment. To continue, type{' '}
              <span className="font-mono text-foreground">
                {DECLINE_CONFIRMATION_PHRASE}
              </span>{' '}
              exactly.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {pendingDeclineAssignment ? (
            <div className="space-y-3">
              <div className="rounded border p-3 text-sm">
                <div className="font-medium">
                  {pendingDeclineAssignment.roleName}
                </div>
                <div className="text-muted-foreground">
                  {formatAssignmentWindow(pendingDeclineAssignment)}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="decline-confirmation-input">
                  Type the confirmation phrase
                </Label>
                <Input
                  id="decline-confirmation-input"
                  value={confirmationValue}
                  onChange={(event) => setConfirmationValue(event.target.value)}
                  placeholder={DECLINE_CONFIRMATION_PHRASE}
                />
              </div>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeDeclineDialog}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!canConfirmDecline}
              onClick={() => {
                if (!pendingDeclineAssignment || !canConfirmDecline) {
                  return;
                }

                onRespond({
                  assignmentId: pendingDeclineAssignment.assignmentId,
                  response: 'declined',
                });
                closeDeclineDialog();
              }}
            >
              Confirm I cannot serve
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

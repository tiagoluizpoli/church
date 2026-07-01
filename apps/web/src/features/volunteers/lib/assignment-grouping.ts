import type {
  DashboardAssignmentGroup,
  DashboardAssignmentItem,
} from './dashboard-mappers';

export function getInitialExpandedAssignmentGroupId(
  groups: DashboardAssignmentGroup[],
): string | undefined {
  return (
    groups.find((group) => group.hasPendingResponse)?.eventId ??
    groups[0]?.eventId
  );
}

export function formatAssignmentWindow(
  assignment: DashboardAssignmentItem,
): string {
  return `${new Date(assignment.startTime).toLocaleString()} - ${new Date(
    assignment.endTime,
  ).toLocaleString()}`;
}

export function getAggregateResponseLabel(
  group: DashboardAssignmentGroup,
): string {
  if (group.aggregateResponseState === 'mixed') {
    return 'Mixed';
  }

  if (group.aggregateResponseState === 'confirmed') {
    return 'Scheduled';
  }

  if (group.aggregateResponseState === 'declined') {
    return 'Needs leader follow-up';
  }

  return 'Needs response';
}

export function getAssignmentStatusLabel(
  assignment: DashboardAssignmentItem,
): string {
  if (assignment.status === 'confirmed') {
    return 'Scheduled';
  }

  if (assignment.status === 'declined') {
    return 'Unable to serve';
  }

  return assignment.canRespond ? 'Awaiting reply' : 'Pending';
}

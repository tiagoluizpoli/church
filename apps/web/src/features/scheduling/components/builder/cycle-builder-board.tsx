import type { CycleBuilderData } from '../../hooks/use-cycle-builder';
import type { CycleBuilderCellSelectInput } from './cycle-builder-cell';
import type { FailedAssignmentWrite } from './cycle-builder-cell-parts';
import { CycleBuilderMatrix } from './cycle-builder-matrix';

interface CycleBuilderBoardProps {
  data: CycleBuilderData;
  cycleStartDate?: string;
  cycleEndDate?: string;
  selectedDate: string | null;
  onSelectedDateChange: (date: string | null) => void;
  selectedVolunteerId?: string;
  onSelectVolunteer: (volunteerId: string | undefined) => void;
  onSelectAssignment: (input: CycleBuilderCellSelectInput) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  failedWrites?: FailedAssignmentWrite[];
  onRetryFailedWrite?: (failedWriteId: string) => void;
  onDismissFailedWrite?: (failedWriteId: string) => void;
}

export function CycleBuilderBoard(props: CycleBuilderBoardProps) {
  return <CycleBuilderMatrix {...props} />;
}

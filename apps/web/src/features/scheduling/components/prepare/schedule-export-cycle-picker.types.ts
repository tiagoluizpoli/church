import type { ListScheduleExportCycles200CyclesItem } from '@/infrastructure/api/churchAPI.schemas';

export type ExportCycle = Pick<
  ListScheduleExportCycles200CyclesItem,
  'id' | 'name' | 'startDate' | 'endDate'
>;

export interface UseExportCyclesInput {
  ministryId: string;
  q: string;
  enabled?: boolean;
}

export interface CycleSpanInput {
  cycle: ExportCycle;
}

export interface ScheduleExportCyclePickerProps {
  ministryId: string;
  value: ExportCycle;
  onChange: (cycle: ExportCycle) => void;
}

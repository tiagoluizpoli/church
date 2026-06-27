import type { PickerVolunteer } from './assignment-picker';
import type { CellAssignment } from './requirement-cell';
import type { SuggestedVolunteer } from './suggestion-list';

export interface GridCellModel {
  slotId: string;
  roleId: string;
  fillIndex: number;
  assignment?: CellAssignment;
  suggestions: SuggestedVolunteer[];
  pickerVolunteers: PickerVolunteer[];
}

export interface GridRoleColumn {
  roleId: string;
  roleName: string;
  requiredCount: number;
  /** Sub-leader scoping (US6): true when this column belongs to another team. */
  isReadOnly: boolean;
  cells: GridCellModel[];
}

export interface GridSlotModel {
  slotId: string;
  startTime: string | Date;
  endTime: string | Date;
  label?: string | null;
  dayIndex: number; // 1-based, for day_based events
  fillRatio: number;
  columns: GridRoleColumn[];
}

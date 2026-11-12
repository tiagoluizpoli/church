import { createContext, useContext } from 'react';
import type { AssignmentDragData } from '../../../utils/builder/cycle-builder-dnd.utils';

export interface BoardDragIdentity {
  volunteerId?: string;
  assignment?: AssignmentDragData;
}

export const BoardDragIdentityContext = createContext<BoardDragIdentity | null>(
  null,
);

export function useBoardDragIdentity() {
  return useContext(BoardDragIdentityContext);
}

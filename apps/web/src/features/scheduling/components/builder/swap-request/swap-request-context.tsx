import { createContext, useContext } from 'react';

interface SwapRequestBoardContextValue {
  /** Assignment id → id of its genuinely open, not-started Swap request. */
  openRequestByAssignment: ReadonlyMap<string, string>;
  onOpenSwapRequest: (swapRequestId: string) => void;
  /** Assignment whose board actions Cover just asked to open. */
  coverAssignmentId?: string;
  onCoverHandled: () => void;
}

const EMPTY: SwapRequestBoardContextValue = {
  openRequestByAssignment: new Map(),
  onOpenSwapRequest: () => undefined,
  onCoverHandled: () => undefined,
};

const SwapRequestBoardContext = createContext(EMPTY);

export const SwapRequestBoardProvider = SwapRequestBoardContext.Provider;

export function useSwapRequestBoard() {
  return useContext(SwapRequestBoardContext);
}

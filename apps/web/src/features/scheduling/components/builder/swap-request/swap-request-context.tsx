import { createContext, useContext } from 'react';

interface SwapRequestBoardContextValue {
  /** Assignment id → id of its genuinely open, not-started Swap request. */
  openRequestByAssignment: ReadonlyMap<string, string>;
  onOpenSwapRequest: (swapRequestId: string) => void;
}

const EMPTY: SwapRequestBoardContextValue = {
  openRequestByAssignment: new Map(),
  onOpenSwapRequest: () => undefined,
};

const SwapRequestBoardContext = createContext(EMPTY);

export const SwapRequestBoardProvider = SwapRequestBoardContext.Provider;

export function useSwapRequestBoard() {
  return useContext(SwapRequestBoardContext);
}

import { useBlocker } from '@tanstack/react-router';
import { useRef } from 'react';

export interface UseTemplateLeaveGuardInput {
  dirty: boolean;
  pending: boolean;
}

/**
 * The preparation editor's leave guard for a template dialog: any navigation
 * away (Cancel, ×, Escape, overlay, browser Back) is held while the draft is
 * dirty or saving. A successful save calls `markSaved` before it navigates.
 */
export function useTemplateLeaveGuard({
  dirty,
  pending,
}: UseTemplateLeaveGuardInput) {
  const saved = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: () => (dirty || pending) && !saved.current,
    enableBeforeUnload: () => (dirty || pending) && !saved.current,
    withResolver: true,
  });
  return { blocker, markSaved: () => (saved.current = true) };
}

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import {
  createInitialUnavailableShiftDraft,
  type UnavailableShiftDraft,
} from '../lib/unavailable-shifts';
import type { GetAvailabilityCheck200 } from '@/infrastructure/api/churchAPI.schemas';

interface LocalAvailabilityDraftInput {
  check: GetAvailabilityCheck200;
  userId: string;
  timeZone: string;
}

const storedMarksSchema = z.array(z.string());

export function useLocalAvailabilityDraft({
  check,
  userId,
  timeZone,
}: LocalAvailabilityDraftInput) {
  const storageKey = `availability-draft:${userId}:${check.id}`;
  const editableShifts = check.shifts.filter((shift) => !shift.published);
  const serverDraft = createInitialUnavailableShiftDraft({
    shifts: editableShifts,
    timeZone,
  });
  const [initial] = useState(() => {
    if (check.readOnly) return serverDraft;
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? 'null',
      );
      const parsed = storedMarksSchema.safeParse(stored);
      if (parsed.success) {
        const marks = new Set(parsed.data);
        return createInitialUnavailableShiftDraft({
          shifts: editableShifts.map((shift) => ({
            ...shift,
            available: !marks.has(shift.shiftId),
          })),
          timeZone,
        });
      }
    } catch {
      // Storage can be unavailable; the in-memory draft remains usable.
    }
    return serverDraft;
  });
  const [draft, setDraft] = useState(initial);
  const differsFromServer = (value: UnavailableShiftDraft) =>
    !check.readOnly &&
    editableShifts.some(
      (shift) => value.markedShiftIds.has(shift.shiftId) === shift.available,
    );
  const [restored, setRestored] = useState(() => differsFromServer(initial));
  const cleared = useRef(false);
  const hasUnsentChanges = differsFromServer(draft);

  useEffect(() => {
    try {
      if (cleared.current || !hasUnsentChanges) {
        localStorage.removeItem(storageKey);
      } else {
        const marks = editableShifts
          .filter((shift) => draft.markedShiftIds.has(shift.shiftId))
          .map((shift) => shift.shiftId);
        localStorage.setItem(storageKey, JSON.stringify(marks));
      }
    } catch {
      // A storage failure must not prevent answering the check.
    }
  });

  const clear = () => {
    cleared.current = true;
    setRestored(false);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Keep the successful answer usable even when storage is unavailable.
    }
  };
  const discard = () => {
    clear();
    setDraft(serverDraft);
  };
  const updateDraft: typeof setDraft = (next) => {
    cleared.current = false;
    setDraft(next);
  };
  return {
    draft,
    setDraft: updateDraft,
    restored: restored && hasUnsentChanges,
    hasUnsentChanges,
    cleared,
    clear,
    discard,
  };
}

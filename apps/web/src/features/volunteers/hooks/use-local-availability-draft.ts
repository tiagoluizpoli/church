import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
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

interface DraftSnapshot {
  check: GetAvailabilityCheck200;
  timeZone: string;
  draft: UnavailableShiftDraft;
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
      const storedJson = localStorage.getItem(storageKey) ?? 'null';
      const stored: unknown = JSON.parse(storedJson);
      const parsed = storedMarksSchema.safeParse(stored);
      if (parsed.success) {
        const marks = new Set(parsed.data);
        const restoredShifts = editableShifts.map((shift) => ({
          ...shift,
          available: !marks.has(shift.shiftId),
        }));
        return createInitialUnavailableShiftDraft({
          shifts: restoredShifts,
          timeZone,
        });
      }
    } catch {
      // Storage can be unavailable; the in-memory draft remains usable.
    }
    return serverDraft;
  });
  const cleared = useRef(false);
  const [snapshot, setSnapshot] = useState<DraftSnapshot>(() => ({
    check,
    timeZone,
    draft: initial,
  }));
  let { draft } = snapshot;
  if (snapshot.check !== check || snapshot.timeZone !== timeZone) {
    const { check: previousCheck } = snapshot;
    const previousShiftEntries = previousCheck.shifts.map(
      (shift) => [shift.shiftId, shift] as const,
    );
    const previousShifts = new Map(previousShiftEntries);
    // Preserve only actual local edits; untouched rows follow the fresh server
    // answer. Whole days describe visible marks, never intent for unseen Shifts.
    const reconciledShifts = editableShifts.map((shift) => {
      const previous = previousShifts.get(shift.shiftId);
      const marked = draft.markedShiftIds.has(shift.shiftId);
      const locallyEdited =
        previous && !previous.published && marked === previous.available;
      return {
        ...shift,
        available:
          !check.readOnly && !cleared.current && locallyEdited
            ? !marked
            : shift.available,
      };
    });
    draft = createInitialUnavailableShiftDraft({
      shifts: reconciledShifts,
      timeZone,
    });
    // Adjust during render so switches, counts, submission and persistence all
    // observe the same reconciled detail before committing the refreshed page.
    setSnapshot({ check, timeZone, draft });
  }
  const differsFromServer = (value: UnavailableShiftDraft) =>
    !check.readOnly &&
    editableShifts.some(
      (shift) => value.markedShiftIds.has(shift.shiftId) === shift.available,
    );
  const [restored, setRestored] = useState(() => differsFromServer(initial));
  const hasUnsentChanges = differsFromServer(draft);

  useEffect(() => {
    try {
      if (cleared.current || !hasUnsentChanges) {
        localStorage.removeItem(storageKey);
      } else {
        const marks = editableShifts
          .filter((shift) => draft.markedShiftIds.has(shift.shiftId))
          .map((shift) => shift.shiftId);
        const serializedMarks = JSON.stringify(marks);
        localStorage.setItem(storageKey, serializedMarks);
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
    setSnapshot({ check, timeZone, draft: serverDraft });
  };
  const updateDraft: Dispatch<SetStateAction<UnavailableShiftDraft>> = (
    next,
  ) => {
    cleared.current = false;
    setSnapshot((current) => {
      const nextDraft = typeof next === 'function' ? next(current.draft) : next;
      return { ...current, draft: nextDraft };
    });
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

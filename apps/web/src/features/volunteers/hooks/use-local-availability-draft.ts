import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
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
  hasFreshDetail: boolean;
}

interface DraftSnapshot {
  check: GetAvailabilityCheck200;
  timeZone: string;
  draft: UnavailableShiftDraft;
  awaitingBaseline: boolean;
}

interface InitialDraft {
  draft: UnavailableShiftDraft;
  fromStorage: boolean;
}

const storedMarksSchema = z.array(z.string());

export function useLocalAvailabilityDraft({
  check,
  userId,
  timeZone,
  hasFreshDetail,
}: LocalAvailabilityDraftInput) {
  const storageKey = `availability-draft:${userId}:${check.id}`;
  const editableShifts = useMemo(
    () => check.shifts.filter((shift) => !shift.published),
    [check.shifts],
  );
  const serverDraft = useMemo(
    () =>
      createInitialUnavailableShiftDraft({ shifts: editableShifts, timeZone }),
    [editableShifts, timeZone],
  );
  const [initial] = useState<InitialDraft>(() => {
    if (check.readOnly) return { draft: serverDraft, fromStorage: false };
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
        const draft = createInitialUnavailableShiftDraft({
          shifts: restoredShifts,
          timeZone,
        });
        return { draft, fromStorage: true };
      }
    } catch {
      // Storage can be unavailable; the in-memory draft remains usable.
    }
    return { draft: serverDraft, fromStorage: false };
  });
  const cleared = useRef(false);
  const [snapshot, setSnapshot] = useState<DraftSnapshot>(() => ({
    check,
    timeZone,
    draft: initial.draft,
    awaitingBaseline: initial.fromStorage && !hasFreshDetail,
  }));
  let { draft } = snapshot;
  const baselineArrived = snapshot.awaitingBaseline && hasFreshDetail;
  if (
    snapshot.check !== check ||
    snapshot.timeZone !== timeZone ||
    baselineArrived
  ) {
    const { check: previousCheck } = snapshot;
    const previousShiftEntries = previousCheck.shifts.map(
      (shift) => [shift.shiftId, shift] as const,
    );
    const previousShifts = new Map(previousShiftEntries);
    // A restored draft is intent until the first fresh response establishes its
    // baseline. Afterwards, untouched rows follow refreshed server answers.
    const reconciledShifts = editableShifts.map((shift) => {
      const previous = previousShifts.get(shift.shiftId);
      const marked = draft.markedShiftIds.has(shift.shiftId);
      const locallyEdited =
        previous &&
        !previous.published &&
        (snapshot.awaitingBaseline || marked === previous.available);
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
    setSnapshot({
      check,
      timeZone,
      draft,
      awaitingBaseline: snapshot.awaitingBaseline && !hasFreshDetail,
    });
  }
  const differsFromServer = (value: UnavailableShiftDraft) =>
    !check.readOnly &&
    editableShifts.some(
      (shift) => value.markedShiftIds.has(shift.shiftId) === shift.available,
    );
  const [restored, setRestored] = useState(initial.fromStorage);
  const awaitingBaseline = snapshot.awaitingBaseline && !hasFreshDetail;
  const hasUnsentChanges = awaitingBaseline || differsFromServer(draft);

  useEffect(() => {
    try {
      if (cleared.current || !hasUnsentChanges) {
        localStorage.removeItem(storageKey);
      } else {
        const marks = editableShifts
          .filter((shift) => snapshot.draft.markedShiftIds.has(shift.shiftId))
          .map((shift) => shift.shiftId);
        const serializedMarks = JSON.stringify(marks);
        localStorage.setItem(storageKey, serializedMarks);
      }
    } catch {
      // A storage failure must not prevent answering the check.
    }
  }, [snapshot, editableShifts, storageKey, hasUnsentChanges]);

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
    setSnapshot({
      check,
      timeZone,
      draft: serverDraft,
      awaitingBaseline: false,
    });
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

import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { useState } from 'react';
import { z } from 'zod';
import {
  answerableShifts,
  buildUnavailableShiftsBody,
  type CheckShift,
  createInitialUnavailableShiftDraft,
  toggleShiftUnavailable,
  type UnavailableShiftDraft,
} from '../lib/unavailable-shifts';
import { useLocalAvailabilityDraft } from './use-local-availability-draft';
import type {
  GetAvailabilityCheck200,
  GetAvailabilityCheck200DaysItem,
} from '@/infrastructure/api/churchAPI.schemas';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { volunteerApi } from '@/utils/api-instances';

const publishedRefusalSchema = z.object({
  error: z.literal('SHIFT_PUBLISHED'),
  shiftIds: z.array(z.string()),
});

const NO_MARKS: UnavailableShiftDraft = {
  markedShiftIds: new Set(),
  wholeDayDates: new Set(),
};

export interface UseAvailabilityAnswerInput {
  check: GetAvailabilityCheck200;
  hasFreshDetail: boolean;
  userId: string;
  onAnswered: () => void | Promise<void>;
}

/** One day with only the Shifts the draft marks unavailable. */
export interface MarkedDay {
  date: GetAvailabilityCheck200DaysItem['date'];
  shifts: CheckShift[];
}

/**
 * The volunteer's answer to one Availability Check: the draft, sending it, and
 * the live numbers the page shows while toggling. The server owns which Shifts
 * are answerable and how days group; this only layers the unsent toggles on top.
 */
export function useAvailabilityAnswer({
  check,
  hasFreshDetail,
  userId,
  onAnswered,
}: UseAvailabilityAnswerInput) {
  const { churchTimezone } = useTimezone();
  const queryClient = useQueryClient();
  const editableShifts = answerableShifts(check);
  const {
    draft,
    setDraft,
    restored,
    discard,
    clear,
    hasUnsentChanges,
    cleared,
  } = useLocalAvailabilityDraft({
    check,
    hasFreshDetail,
    userId,
    timeZone: churchTimezone,
  });
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsentChanges && !cleared.current,
    enableBeforeUnload: () => hasUnsentChanges && !cleared.current,
    withResolver: true,
  });
  // The marks the "everything available" shortcut cleared, until the next edit.
  const [undoDraft, setUndoDraft] = useState<UnavailableShiftDraft | null>(
    null,
  );
  const [publishedRefusal, setPublishedRefusal] = useState(false);

  const send = useMutation({
    mutationFn: () => {
      const body = buildUnavailableShiftsBody({ draft });
      const answerable = new Set(editableShifts.map((shift) => shift.shiftId));
      // Whole days that hold a Shift the volunteer can no longer answer go as single marks.
      body.wholeDayDates = body.wholeDayDates?.filter((date) =>
        check.days
          .find((day) => day.date === date)
          ?.shifts.every((shift) => shift.answerable),
      );
      body.shiftIds = body.shiftIds.filter((id) => answerable.has(id));
      return volunteerApi.answerAvailabilityCheck(check.id, body);
    },
    onMutate: () => setPublishedRefusal(false),
    onError: async (error) => {
      const data: unknown = isAxiosError(error)
        ? error.response?.data
        : undefined;
      const refusal = publishedRefusalSchema.safeParse(data);
      if (!refusal.success) return;
      setPublishedRefusal(true);
      const refusedIds = new Set(refusal.data.shiftIds);
      const pruneDraft = (detail: GetAvailabilityCheck200) => {
        setDraft((current) =>
          createInitialUnavailableShiftDraft({
            shifts: answerableShifts(detail)
              .filter((shift) => !refusedIds.has(shift.shiftId))
              .map((shift) => ({
                ...shift,
                available: !current.markedShiftIds.has(shift.shiftId),
              })),
            timeZone: churchTimezone,
          }),
        );
      };
      pruneDraft(check);
      await queryClient.invalidateQueries({
        queryKey: ['availability-check', check.id],
      });
      const refreshed = queryClient.getQueryData<GetAvailabilityCheck200>([
        'availability-check',
        check.id,
      ]);
      if (refreshed) pruneDraft(refreshed);
    },
    onSuccess: async (updated) => {
      clear();
      await queryClient.invalidateQueries({
        queryKey: ['availability-checks'],
      });
      await onAnswered();
      // After navigation, so this page never flips to "Confirmada" mid-submit.
      queryClient.setQueryData(['availability-check', check.id], updated);
    },
  });

  const isAvailable = (shift: CheckShift) =>
    shift.answerable
      ? !draft.markedShiftIds.has(shift.shiftId)
      : shift.available;
  const editDraft: typeof setDraft = (next) => {
    setUndoDraft(null);
    setDraft(next);
  };
  const toggleShift = (shiftId: string) =>
    editDraft((current) =>
      toggleShiftUnavailable({
        draft: current,
        shifts: editableShifts,
        shiftId,
        timeZone: churchTimezone,
      }),
    );
  /** Flips every answerable Shift on the day to the same side. */
  const setDayUnavailable = (
    day: GetAvailabilityCheck200DaysItem,
    unavailable: boolean,
  ) =>
    editDraft((current) =>
      day.shifts
        .filter(
          (shift) =>
            shift.answerable &&
            current.markedShiftIds.has(shift.shiftId) !== unavailable,
        )
        .reduce(
          (next, shift) =>
            toggleShiftUnavailable({
              draft: next,
              shifts: editableShifts,
              shiftId: shift.shiftId,
              timeZone: churchTimezone,
            }),
          current,
        ),
    );

  const unavailableCount = editableShifts.filter(
    (shift) => !isAvailable(shift),
  ).length;
  const openDays = check.days.filter((day) => day.state === 'open');
  // A day is available while the volunteer can serve at least one of its Shifts.
  const availableDayCount = openDays.filter((day) =>
    day.shifts.some((shift) => shift.answerable && isAvailable(shift)),
  ).length;
  const markedDays: MarkedDay[] = check.days
    .map((day) => ({
      date: day.date,
      shifts: day.shifts.filter(
        (shift) => shift.answerable && !isAvailable(shift),
      ),
    }))
    .filter((day) => day.shifts.length > 0);

  const confirmed = check.state === 'confirmed';
  const allPublished = check.counts.openShifts === 0;
  const canEdit = !check.readOnly && !allPublished;
  const hasMarks = unavailableCount > 0;
  const pending = send.isPending;
  const done = confirmed && !hasUnsentChanges && !pending;
  const unsaved = confirmed && hasUnsentChanges;
  const total = check.counts.openShifts;
  const summary =
    unavailableCount === 0
      ? m.availability_detail_available_everywhere()
      : (total === 1
          ? m.availability_detail_open_count_one
          : m.availability_detail_open_count)({
          unavailable: unavailableCount,
          total,
        });

  return {
    check,
    draft,
    restored,
    blocker,
    send,
    pending,
    publishedRefusal,
    confirmed,
    canEdit,
    allPublished,
    done,
    unsaved,
    hasMarks,
    summary,
    markedDays,
    counts: {
      availableShifts: total - unavailableCount,
      availableDays: availableDayCount,
    },
    isAvailable,
    toggleShift,
    setDayUnavailable,
    /** "Disponível para tudo": clears every mark, undoable until the next edit. Hidden only beside the done state. */
    canMarkAllAvailable: canEdit && hasMarks && !pending && !done,
    markAllAvailable: () => {
      setUndoDraft(draft);
      setDraft(NO_MARKS);
    },
    canUndo: undoDraft !== null && !pending,
    undo: () => {
      if (undoDraft) setDraft(undoDraft);
      setUndoDraft(null);
    },
    /** Back to the sent answer, while editing one. */
    canDiscardChanges: unsaved && !restored,
    discardChanges: () => {
      setUndoDraft(null);
      discard();
    },
    discardRestored: discard,
  };
}

export type AvailabilityAnswer = ReturnType<typeof useAvailabilityAnswer>;

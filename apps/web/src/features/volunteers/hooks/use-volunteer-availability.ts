import { m } from '@church/i18n/messages';
import type { CalendarDay } from '@church/time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  buildUnavailableShiftsBody,
  createInitialUnavailableShiftDraft,
  toggleShiftUnavailable,
  toggleWholeDayUnavailable,
  type UnavailableShiftDraft,
} from '../lib/unavailable-shifts';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { volunteerApi } from '@/utils/api-instances';

const AVAILABILITY_CHECKS_QUERY_KEY = ['availability-checks'];
const EMPTY_UNAVAILABLE_SHIFT_DRAFT: UnavailableShiftDraft = {
  markedShiftIds: new Set(),
  wholeDayDates: new Set(),
};

function availabilityCheckQueryKey(checkId: string): string[] {
  return ['availability-check', checkId];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : m.common_generic_error();
}

export function useVolunteerAvailability() {
  const { churchTimezone } = useTimezone();
  const queryClient = useQueryClient();
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [unavailableShiftDraft, setUnavailableShiftDraft] =
    useState<UnavailableShiftDraft>(EMPTY_UNAVAILABLE_SHIFT_DRAFT);

  const checksQuery = useQuery({
    queryKey: AVAILABILITY_CHECKS_QUERY_KEY,
    queryFn: () => volunteerApi.listAvailabilityChecks(),
    retry: false,
  });
  const checks = checksQuery.data?.checks ?? [];

  const detailQuery = useQuery({
    queryKey: availabilityCheckQueryKey(selectedCheckId ?? 'none'),
    queryFn: () => volunteerApi.getAvailabilityCheck(selectedCheckId ?? ''),
    enabled: Boolean(selectedCheckId),
    retry: false,
  });
  const detail = detailQuery.data;

  useEffect(() => {
    if (!detail) return;
    setUnavailableShiftDraft(
      createInitialUnavailableShiftDraft({
        shifts: detail.shifts,
        timeZone: churchTimezone,
      }),
    );
  }, [detail, churchTimezone]);

  const invalidateChecks = async () => {
    await queryClient.invalidateQueries({
      queryKey: AVAILABILITY_CHECKS_QUERY_KEY,
    });
    if (selectedCheckId) {
      await queryClient.invalidateQueries({
        queryKey: availabilityCheckQueryKey(selectedCheckId),
      });
    }
  };

  const selectCheck = (checkId: string) => {
    setSelectedCheckId(checkId);
  };

  const toggleShift = (shiftId: string) => {
    if (!detail) return;
    setUnavailableShiftDraft((current) =>
      toggleShiftUnavailable({
        draft: current,
        shifts: detail.shifts,
        shiftId,
        timeZone: churchTimezone,
      }),
    );
  };

  const toggleWholeDay = (date: CalendarDay) => {
    if (!detail) return;
    setUnavailableShiftDraft((current) =>
      toggleWholeDayUnavailable({
        draft: current,
        shifts: detail.shifts,
        date,
        timeZone: churchTimezone,
      }),
    );
  };

  const saveUnavailableShifts = useMutation({
    mutationFn: async () => {
      if (!selectedCheckId) {
        throw new Error('No availability check selected.');
      }
      return volunteerApi.setUnavailableShifts(
        selectedCheckId,
        buildUnavailableShiftsBody({ draft: unavailableShiftDraft }),
      );
    },
    onSuccess: async () => {
      toast.success('Unavailable shifts saved.');
      await invalidateChecks();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const confirmCheck = useMutation({
    mutationFn: async () => {
      if (!selectedCheckId) {
        throw new Error('No availability check selected.');
      }
      await volunteerApi.confirmAvailabilityCheck(selectedCheckId);
    },
    onSuccess: async () => {
      toast.success('Availability confirmed.');
      await invalidateChecks();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return {
    checks,
    checksQuery,
    confirmCheck,
    detail,
    detailQuery,
    unavailableShiftDraft,
    saveUnavailableShifts,
    selectCheck,
    selectedCheckId,
    toggleShift,
    toggleWholeDay,
  };
}

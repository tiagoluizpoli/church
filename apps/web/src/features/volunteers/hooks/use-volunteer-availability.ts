import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  type AvailabilityMarkDraft,
  buildMarksBody,
  createInitialMarkDraft,
  toggleShiftMark,
  toggleWholeDayMark,
} from '../lib/availability-marks';
import { volunteerApi } from '@/utils/api-instances';

const AVAILABILITY_CHECKS_QUERY_KEY = ['availability-checks'];
const EMPTY_MARK_DRAFT: AvailabilityMarkDraft = {
  markedShiftIds: new Set(),
  wholeDayDates: new Set(),
};

interface AvailabilityOverlapErrorBody {
  error: string;
}

interface IsOverlapConflictInput {
  error: unknown;
}

function availabilityCheckQueryKey(checkId: string): string[] {
  return ['availability-check', checkId];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

function isOverlapConflict({ error }: IsOverlapConflictInput): boolean {
  if (!isAxiosError<AvailabilityOverlapErrorBody>(error)) return false;
  return (
    error.response?.status === 409 &&
    error.response?.data?.error === 'AVAILABILITY_OVERLAP'
  );
}

export function useVolunteerAvailability() {
  const queryClient = useQueryClient();
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [markDraft, setMarkDraft] =
    useState<AvailabilityMarkDraft>(EMPTY_MARK_DRAFT);
  const [overlapWarningVisible, setOverlapWarningVisible] = useState(false);

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
    setMarkDraft(createInitialMarkDraft({ shifts: detail.shifts }));
  }, [detail]);

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
    setOverlapWarningVisible(false);
  };

  const toggleShift = (shiftId: string) => {
    if (!detail) return;
    setMarkDraft((current) =>
      toggleShiftMark({ draft: current, shifts: detail.shifts, shiftId }),
    );
  };

  const toggleWholeDay = (date: string) => {
    if (!detail) return;
    setMarkDraft((current) =>
      toggleWholeDayMark({ draft: current, shifts: detail.shifts, date }),
    );
  };

  const saveMarks = useMutation({
    mutationFn: async () => {
      if (!selectedCheckId) {
        throw new Error('No availability check selected.');
      }
      return volunteerApi.setUnavailabilityMarks(
        selectedCheckId,
        buildMarksBody({ draft: markDraft }),
      );
    },
    onSuccess: async () => {
      toast.success('Availability marks saved.');
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
      setOverlapWarningVisible(false);
      toast.success('Availability confirmed.');
      await invalidateChecks();
    },
    onError: async (error) => {
      if (isOverlapConflict({ error })) {
        setOverlapWarningVisible(true);
        await invalidateChecks();
        return;
      }
      toast.error(getErrorMessage(error));
    },
  });

  return {
    checks,
    checksQuery,
    confirmCheck,
    detail,
    detailQuery,
    markDraft,
    overlapWarningVisible,
    saveMarks,
    selectCheck,
    selectedCheckId,
    toggleShift,
    toggleWholeDay,
  };
}

import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useSchedule } from '@/features/scheduling/hooks/use-schedule';
import { builderErrorMessage } from '@/features/scheduling/utils/builder/cycle-builder-error.utils';
import {
  publishGapsMessage,
  publishUnansweredMessage,
} from '@/features/scheduling/utils/publish-gaps-message';
import { adminApi } from '@/utils/api-instances';

interface SchedulePublishProps {
  ministryId: string;
  cycleId: string;
  unanswered?: number;
}

/** Publishing needs the Schedule summary, not the full assignment board. */
export function SchedulePublish({
  ministryId,
  cycleId,
  unanswered,
}: SchedulePublishProps) {
  const [open, setOpen] = useState(false);
  // The server refused the publish as below target, with this many places open.
  const [refusedGapCount, setRefusedGapCount] = useState<number>();
  const isRefused = refusedGapCount !== undefined;
  const closeConfirmation = () => {
    setOpen(false);
    setRefusedGapCount(undefined);
  };
  const { data } = useSchedule({ ministryId, cycleId });
  const queryClient = useQueryClient();
  async function refreshSchedule() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['prepare-schedules'] }),
      queryClient.invalidateQueries({
        queryKey: ['cycle-builder', cycleId, ministryId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['prepare-cycle-participation', ministryId, cycleId],
      }),
    ]);
  }
  const publish = useMutation({
    mutationFn: () =>
      adminApi.publishCycle(
        cycleId,
        { confirmBelowFull: isRefused || (data?.gapCount ?? 0) > 0 },
        { ministryId },
      ),
    onSuccess: async (result) => {
      await refreshSchedule();
      // A refusal keeps the confirmation open: the server saw gaps the summary
      // did not, and the leader can confirm with its count.
      if (!result.published) {
        setRefusedGapCount(result.gapCount);
        return;
      }
      closeConfirmation();
      toast.success(m.builder_logic_cycle_published());
    },
    onError: (error) =>
      toast.error(
        builderErrorMessage({ error, fallback: m.common_publish_failed() }),
      ),
  });
  const sendUpdates = useMutation({
    mutationFn: () => adminApi.sendScheduleUpdates(cycleId, { ministryId }),
    onSuccess: async () => {
      await refreshSchedule();
      toast.success(m.schedule_updates_sent());
    },
    onError: (error) =>
      toast.error(
        builderErrorMessage({ error, fallback: m.schedule_updates_failed() }),
      ),
  });
  if (!data || data.cycle.state === 'past') return null;
  if (data.stage === 'published')
    return data.affectedVolunteerCount > 0 ? (
      <Button
        className="min-h-11 md:min-h-8"
        disabled={sendUpdates.isPending}
        onClick={() => sendUpdates.mutate()}
      >
        {sendUpdates.isPending ? <Spinner /> : null}
        {m.builder_send_updates({ count: data.affectedVolunteerCount })}
      </Button>
    ) : null;
  if (data.stage !== 'asking' && data.stage !== 'assigning') return null;
  const pending =
    unanswered ?? (data.asking ? data.asking.asked - data.asking.confirmed : 0);
  const openPlaces = refusedGapCount ?? data.gapCount;
  return (
    <>
      <Button
        className="min-h-11 md:min-h-8"
        variant={data.stage === 'asking' ? 'outline' : 'default'}
        disabled={publish.isPending}
        onClick={() => setOpen(true)}
      >
        {publish.isPending ? <Spinner /> : null}
        {m.builder_ui_publish()}
      </Button>
      <ResponsiveFormSurface
        open={open}
        onOpenChange={(value) => {
          if (publish.isPending) return;
          if (value) setOpen(true);
          else closeConfirmation();
        }}
        title={m.builder_ui_publish_title()}
        description={
          openPlaces > 0
            ? publishGapsMessage({ count: openPlaces })
            : m.builder_ui_publish_full()
        }
        footer={
          <>
            <Button
              variant="outline"
              disabled={publish.isPending}
              onClick={closeConfirmation}
            >
              {m.builder_ui_cancel()}
            </Button>
            <Button
              disabled={publish.isPending}
              onClick={() => publish.mutate()}
            >
              {publish.isPending ? <Spinner /> : null}
              {m.builder_ui_publish()}
            </Button>
          </>
        }
      >
        <p className="text-sm">{m.prepare_publish_notifications()}</p>
        {pending > 0 ? (
          <p className="text-sm">
            {publishUnansweredMessage({ count: pending })}
          </p>
        ) : null}
      </ResponsiveFormSurface>
    </>
  );
}

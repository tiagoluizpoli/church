import { m } from '@church/i18n/messages';
import { isAxiosError } from 'axios';
import { z } from 'zod';
import type {
  PreparationBlock,
  PreparationGridShift,
} from './preparation-block.utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { headcountGridKey } from '@/features/scheduling/components/headcount-grid/headcount-grid';
import { formatInstantRangeOf } from '@/shared/utils/church-time';
import { pluralMessage } from '@/shared/utils/plural';

const preparationRefusalSchema = z.object({
  error: z.string(),
  message: z.string(),
  shiftResponses: z
    .array(
      z.object({
        shiftId: z.string(),
        unavailableMarkCount: z.number().int().nonnegative(),
        assignmentCount: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  headcountFloors: z
    .array(
      z.object({
        shiftId: z.string(),
        sectorId: z.string(),
        roleId: z.string(),
        assignedCount: z.number().int().nonnegative(),
      }),
    )
    .optional(),
});

interface PreparationRefusalInput {
  error: unknown;
}

export function preparationRefusal({ error }: PreparationRefusalInput) {
  const data: unknown = isAxiosError<unknown>(error)
    ? error.response?.data
    : undefined;
  const parsed = preparationRefusalSchema.safeParse(data);
  return parsed.success ? parsed.data : undefined;
}

interface PreparationRefusalDetailsProps {
  error: unknown;
  isError: boolean;
  block: PreparationBlock;
  shifts: PreparationGridShift[];
  timeZone: string;
}

/** Counts and anchors come from the authoritative refusal, while drafts stay in the form. */
export function PreparationRefusalDetails({
  error,
  isError,
  block,
  shifts,
  timeZone,
}: PreparationRefusalDetailsProps) {
  const refusal = preparationRefusal({ error });
  return (
    <>
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>
            <p>{refusal?.message ?? m.common_generic_error()}</p>
            {refusal?.headcountFloors?.map((floor) => {
              const shift = shifts.find(
                (candidate) => candidate.savedShiftId === floor.shiftId,
              );
              const key =
                shift &&
                headcountGridKey({
                  shiftKey: shift.key,
                  sectorId: floor.sectorId,
                  roleId: floor.roleId,
                });
              return (
                <a
                  key={`${floor.shiftId}-${floor.sectorId}-${floor.roleId}`}
                  href={key ? `#headcount-${key}` : undefined}
                >
                  {m.error_headcount_below_assigned_count({
                    count: floor.assignedCount,
                  })}
                </a>
              );
            })}
            {refusal?.shiftResponses?.map((response) => (
              <div key={response.shiftId} className="flex flex-col gap-1">
                {response.unavailableMarkCount > 0 && (
                  <a href={`#preparation-shift-${response.shiftId}`}>
                    {pluralMessage({
                      count: response.unavailableMarkCount,
                      one: m.prepare_block_answers_one,
                      other: () =>
                        m.prepare_block_answers_other({
                          count: response.unavailableMarkCount,
                        }),
                    })}
                  </a>
                )}
                {response.assignmentCount > 0 && (
                  <a href={`#preparation-shift-${response.shiftId}`}>
                    {pluralMessage({
                      count: response.assignmentCount,
                      one: m.prepare_block_assignments_one,
                      other: () =>
                        m.prepare_block_assignments_other({
                          count: response.assignmentCount,
                        }),
                    })}
                  </a>
                )}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}
      {refusal?.shiftResponses && (
        <section
          aria-label={m.prepare_block_saved_shifts()}
          className="flex flex-col gap-2"
        >
          <h2 className="font-medium text-sm">
            {m.prepare_block_saved_shifts()}
          </h2>
          {block.shifts
            .filter((shift) =>
              refusal.shiftResponses?.some(
                (response) => response.shiftId === shift.id,
              ),
            )
            .map((shift, index) => (
              <p
                key={shift.id}
                id={`preparation-shift-${shift.id}`}
                tabIndex={-1}
                className="text-sm"
              >
                {shift.label ||
                  m.usual_setup_shift_label({ number: index + 1 })}{' '}
                ·{' '}
                {formatInstantRangeOf({
                  start: shift.startTime,
                  end: shift.endTime,
                  timeZone: timeZone,
                })}
              </p>
            ))}
        </section>
      )}
    </>
  );
}

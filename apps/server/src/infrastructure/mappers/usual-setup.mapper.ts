import type { usualSetup } from '@church/db';
import { parseTimeOfDay } from '@church/time';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  ChurchId,
  MinistryId,
  RoleId,
  TeamId,
  TemplateTimeBlockId,
  UsualSetupId,
} from '../../domain/branded-ids';
import type {
  UsualSetupHeadcount,
  UsualSetupProps,
  UsualSetupShiftSplit,
} from '../../domain/entities/usual-setup';
import { UsualSetup } from '../../domain/entities/usual-setup';

type UsualSetupRow = InferSelectModel<typeof usualSetup>;

export function mapUsualSetup(row: UsualSetupRow): UsualSetup {
  const props: UsualSetupProps = {
    churchId: row.churchId as ChurchId,
    ministryId: row.ministryId as MinistryId,
    sourceTemplateTimeBlockId:
      row.sourceTemplateTimeBlockId as TemplateTimeBlockId,
    serves: row.serves,
    shiftSplit: mapShiftSplit(row.shiftSplit),
    headcounts: row.headcounts.map(mapHeadcount),
  };

  return new UsualSetup({
    props,
    id: row.id as UsualSetupId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function mapShiftSplit(
  stored: UsualSetupRow['shiftSplit'],
): UsualSetupShiftSplit {
  if (stored.kind === 'equal') {
    return { kind: 'equal', count: stored.count };
  }

  return {
    kind: 'manual',
    spans: stored.spans.map((span) => ({
      label: span.label,
      startTime: parseTimeOfDay({ value: span.startTime }),
      endTime: parseTimeOfDay({ value: span.endTime }),
    })),
  };
}

function mapHeadcount(
  stored: UsualSetupRow['headcounts'][number],
): UsualSetupHeadcount {
  return {
    roleId: stored.roleId as RoleId,
    teamId: stored.teamId ? (stored.teamId as TeamId) : undefined,
    peopleNeeded: stored.peopleNeeded,
  };
}

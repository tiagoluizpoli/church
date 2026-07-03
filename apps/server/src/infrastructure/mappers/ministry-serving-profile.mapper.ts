import type { ministryServingProfile } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type {
  ChurchId,
  MinistryId,
  MinistryServingProfileId,
  RoleId,
  TeamId,
  TimeBlockId,
} from '../../domain/branded-ids';
import type {
  MinistryServingProfileProps,
  ServingProfileHeadcount,
  ServingProfileShiftSplit,
} from '../../domain/entities/ministry-serving-profile';
import { MinistryServingProfile } from '../../domain/entities/ministry-serving-profile';

type MinistryServingProfileRow = InferSelectModel<
  typeof ministryServingProfile
>;

export function mapMinistryServingProfile(
  row: MinistryServingProfileRow,
): MinistryServingProfile {
  const props: MinistryServingProfileProps = {
    churchId: row.churchId as ChurchId,
    ministryId: row.ministryId as MinistryId,
    sourceTemplateBlockId: row.sourceTemplateBlockId as TimeBlockId,
    serves: row.serves,
    shiftSplit: mapShiftSplit(row.shiftSplit),
    headcounts: row.headcounts.map(mapHeadcount),
  };

  return new MinistryServingProfile({
    props,
    id: row.id as MinistryServingProfileId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function mapShiftSplit(
  stored: MinistryServingProfileRow['shiftSplit'],
): ServingProfileShiftSplit {
  if (stored.kind === 'equal') {
    return { kind: 'equal', count: stored.count };
  }

  return {
    kind: 'manual',
    spans: stored.spans.map((span) => ({
      label: span.label,
      startTime: span.startTime,
      endTime: span.endTime,
    })),
  };
}

function mapHeadcount(
  stored: MinistryServingProfileRow['headcounts'][number],
): ServingProfileHeadcount {
  return {
    roleId: stored.roleId as RoleId,
    teamId: stored.teamId ? (stored.teamId as TeamId) : undefined,
    count: stored.count,
  };
}

import type { church, organization } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import type { ChurchId } from '../../domain/branded-ids';
import type { ChurchSlug } from '../../domain/entities/church';
import { Church } from '../../domain/entities/church';

type ChurchRow = InferSelectModel<typeof church>;
type OrganizationRow = InferSelectModel<typeof organization>;

/**
 * A Church is split across two rows sharing one identifier: the Better Auth
 * `organization` row owns `name` and `slug`, the `church` extension row owns
 * `timezone` and `settings`. Both halves are required to build the entity.
 */
export interface ChurchWithOrganizationRow {
  church: ChurchRow;
  organization: OrganizationRow;
}

export function mapChurch(record: ChurchWithOrganizationRow): Church {
  return new Church(
    {
      name: record.organization.name,
      slug: record.organization.slug as ChurchSlug,
      timezone: record.church.timezone,
    },
    record.church.id as ChurchId,
    record.church.createdAt,
    record.church.updatedAt,
  );
}

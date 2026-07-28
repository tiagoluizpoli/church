import type { church, organization } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';
import { ChurchId } from '../../domain/branded-ids';
import type { ChurchSlug } from '../../domain/entities/church';
import { Church } from '../../domain/entities/church';

type ChurchRow = InferSelectModel<typeof church>;
type OrganizationRow = InferSelectModel<typeof organization>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ToChurchIdInput {
  rawId: string;
}

function toChurchId({ rawId }: ToChurchIdInput): ChurchId {
  if (!UUID_PATTERN.test(rawId)) {
    throw new Error(`Invalid persisted Church id: ${rawId}`);
  }
  return ChurchId.from(rawId);
}

interface ToChurchSlugInput {
  rawSlug: string;
}

interface ToChurchSettingsInput {
  rawSettings: unknown;
}

function toChurchSettings({
  rawSettings,
}: ToChurchSettingsInput): Record<string, unknown> | undefined {
  if (rawSettings === null || rawSettings === undefined) {
    return undefined;
  }
  if (typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
    throw new Error('Invalid persisted Church settings.');
  }
  return rawSettings as Record<string, unknown>;
}

function toChurchSlug({ rawSlug }: ToChurchSlugInput): ChurchSlug {
  if (rawSlug.trim().length === 0) {
    throw new Error('Invalid persisted Church slug.');
  }
  return rawSlug as ChurchSlug;
}

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
      slug: toChurchSlug({ rawSlug: record.organization.slug }),
      timezone: record.church.timezone,
      settings: toChurchSettings({ rawSettings: record.church.settings }),
    },
    toChurchId({ rawId: record.church.id }),
    record.organization.createdAt,
    record.organization.createdAt,
  );
}

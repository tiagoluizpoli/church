import { ChurchId } from '../../domain/branded-ids';
import type { ChurchSlug } from '../../domain/entities/church';
import { Church } from '../../domain/entities/church';
import type {
  ChurchWithOrganizationRow,
  ToChurchIdInput,
  ToChurchSettingsInput,
  ToChurchSlugInput,
} from './church.mapper.types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toChurchId({ rawId }: ToChurchIdInput): ChurchId {
  if (!UUID_PATTERN.test(rawId)) {
    throw new Error(`Invalid persisted Church id: ${rawId}`);
  }
  return ChurchId.from(rawId);
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

export function mapChurch(record: ChurchWithOrganizationRow): Church {
  return new Church({
    props: {
      name: record.organization.name,
      slug: toChurchSlug({ rawSlug: record.organization.slug }),
      timezone: record.church.timezone,
      settings: toChurchSettings({ rawSettings: record.church.settings }),
    },
    id: toChurchId({ rawId: record.church.id }),
    createdAt: record.organization.createdAt,
    updatedAt: record.organization.createdAt,
  });
}

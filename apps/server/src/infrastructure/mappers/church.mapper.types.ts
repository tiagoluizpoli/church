import type { church, organization } from '@church/db';
import type { InferSelectModel } from 'drizzle-orm';

export type ChurchRow = InferSelectModel<typeof church>;

export type OrganizationRow = InferSelectModel<typeof organization>;

export interface ToChurchIdInput {
  rawId: string;
}

export interface ToChurchSlugInput {
  rawSlug: string;
}

export interface ToChurchSettingsInput {
  rawSettings: unknown;
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

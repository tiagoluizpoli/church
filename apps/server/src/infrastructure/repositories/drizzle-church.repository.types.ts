import type { ChurchId } from '../../domain/branded-ids';
import type {
  AddressReplacement,
  ChurchAddress,
} from '../../domain/church-address';
import type { ChurchLegalProfile } from '../../domain/church-legal-profile';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { SocialLinkChange } from '../../domain/social-link';
import type { AnyDrizzleDb } from './drizzle-db.types';
import type { getClient } from './helpers';

export interface FreezeStartedBlockPlacesInput {
  client: AnyDrizzleDb;
  id: ChurchId;
}

export interface AddressesInUseInput extends FreezeStartedBlockPlacesInput {
  addressIds: readonly string[];
}

export interface ReplaceDeletedAddressUsageInput {
  client: AnyDrizzleDb;
  id: ChurchId;
  stored: readonly ChurchAddress[];
  kept: readonly string[];
  replacements: readonly AddressReplacement[];
}

export interface FindLegalProfileInput extends ListAddressesInput {
  onlyPublic?: boolean;
}

export interface ListContactsInput extends ListAddressesInput {
  onlyPublic?: boolean;
}

export interface ListAddressesInput {
  id: string;
  tx?: TransactionContext;
}

export type DrizzleClient = ReturnType<typeof getClient>;

export interface FindSlugAvailabilityInput {
  client: DrizzleClient;
  id: string;
  slug: string;
}

/** A Social Link row with its Contact Group resolved to an id. */
export interface GroupedSocialLinkRow extends Omit<SocialLinkChange, 'group'> {
  groupId: string | null;
}

export interface ReplaceSocialLinksInput {
  client: DrizzleClient;
  id: string;
  links: readonly GroupedSocialLinkRow[];
}

export interface GroupedRow {
  group: string | null;
}

export interface CreatedGroup {
  id: string;
}

export interface ReplaceGroupsInput {
  client: DrizzleClient;
  id: string;
  requested: readonly string[];
  members: readonly (string | null)[];
}

export interface DeleteUnusedGroupsInput {
  client: DrizzleClient;
  id: string;
}

export interface ReplaceLegalProfileInput {
  client: DrizzleClient;
  id: string;
  profile: ChurchLegalProfile | null;
}

export type ChangeSlugInput = FindSlugAvailabilityInput;

export interface DrizzleChurchRepositoryInput {
  db: AnyDrizzleDb;
}

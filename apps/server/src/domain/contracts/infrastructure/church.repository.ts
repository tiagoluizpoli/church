import type { ChurchId, UserId } from '../../branded-ids';
import type {
  ChurchSettings,
  ChurchSettingsChanges,
  ChurchSlugAvailability,
} from '../../church-settings';
import type { Church, ChurchSlug } from '../../entities/church';
import type { TransactionContext } from './transaction-context';

export interface ChurchRepository {
  getById(input: GetChurchByIdInput): Promise<Church>;
  getBySlug(input: GetChurchBySlugInput): Promise<Church>;
  /** User ids of every ChurchAdmin of this Church. */
  listAdminUserIds(input: ListChurchAdminUserIdsInput): Promise<UserId[]>;
  /**
   * The User's email while they hold Church Membership in this Church;
   * `null` otherwise. Volunteer status plays no part.
   */
  findMemberEmail(input: FindChurchMemberEmailInput): Promise<string | null>;
  /** The member's email and display name, under the same membership rule. */
  findMemberContact(
    input: FindChurchMemberEmailInput,
  ): Promise<ChurchMemberContact | null>;
  /**
   * The User's display name, whether or not they still hold Church Membership;
   * `null` when the User is missing or the name is blank.
   */
  findUserName(input: FindUserNameInput): Promise<string | null>;
  /** The Church's editable identity (Church Settings). */
  getSettings(input: GetChurchSettingsInput): Promise<ChurchSettings>;
  /**
   * Overwrites the Church's editable identity. A changed slug is written with
   * the old one recorded in the slug history; a slug someone else holds, live
   * or in their history, throws `ChurchSlugTakenError`.
   */
  saveSettings(input: SaveChurchSettingsInput): Promise<void>;
  /** Whether `slug` is free for this Church; the Church's own current slug counts as free. Never names the holder. */
  slugAvailability(
    input: SlugAvailabilityInput,
  ): Promise<Exclude<ChurchSlugAvailability, 'reserved'>>;
  /** Points the Church at a logo key, or at none; objects are never touched. */
  saveLogoKey(input: SaveChurchLogoKeyInput): Promise<void>;
}

export interface SlugAvailabilityInput {
  id: ChurchId;
  slug: string;
}

export interface SaveChurchLogoKeyInput {
  id: ChurchId;
  logoKey: string | null;
}

export interface SaveChurchSettingsInput {
  id: ChurchId;
  changes: ChurchSettingsChanges;
  tx?: TransactionContext;
}

export interface ChurchMemberContact {
  email: string;
  name: string;
}

export interface GetChurchSettingsInput extends GetChurchByIdInput {
  /** Reads inside the caller's transaction, so it never needs a second connection. */
  tx?: TransactionContext;
}

export interface GetChurchByIdInput {
  id: ChurchId;
}

export interface GetChurchBySlugInput {
  slug: ChurchSlug;
}

export interface ListChurchAdminUserIdsInput {
  id: ChurchId;
  tx?: TransactionContext;
}

export interface FindUserNameInput {
  userId: UserId;
}

export interface FindChurchMemberEmailInput {
  id: ChurchId;
  userId: UserId;
}

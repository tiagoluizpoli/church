import type { ChurchId, UserId } from '../../branded-ids';
import type { Church, ChurchSlug } from '../../entities/church';
import type { TransactionContext } from './transaction-context';

export interface ChurchRepository {
  getById(input: GetChurchByIdInput): Promise<Church>;
  getBySlug(input: GetChurchBySlugInput): Promise<Church>;
  /**
   * Email addresses of every ChurchAdmin of this Church — the
   * leaderless-Ministry escalation's addressee list (spec §8.8, issue #60).
   */
  listAdminEmails(input: ListChurchAdminEmailsInput): Promise<string[]>;
  /** User ids of every ChurchAdmin of this Church. */
  listAdminUserIds(input: ListChurchAdminUserIdsInput): Promise<UserId[]>;
  /**
   * The User's email while they hold Church Membership in this Church;
   * `null` otherwise. Volunteer status plays no part.
   */
  findMemberEmail(input: FindChurchMemberEmailInput): Promise<string | null>;
}

export interface GetChurchByIdInput {
  id: ChurchId;
}

export interface GetChurchBySlugInput {
  slug: ChurchSlug;
}

export interface ListChurchAdminEmailsInput {
  id: ChurchId;
}

export interface ListChurchAdminUserIdsInput {
  id: ChurchId;
  tx?: TransactionContext;
}

export interface FindChurchMemberEmailInput {
  id: ChurchId;
  userId: UserId;
}

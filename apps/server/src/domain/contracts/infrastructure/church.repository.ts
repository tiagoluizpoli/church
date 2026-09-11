import type { ChurchId } from '../../branded-ids';
import type { Church, ChurchSlug } from '../../entities/church';

export interface ChurchRepository {
  getById(input: GetChurchByIdInput): Promise<Church>;
  getBySlug(input: GetChurchBySlugInput): Promise<Church>;
  /**
   * Email addresses of every ChurchAdmin of this Church — the
   * leaderless-Ministry escalation's addressee list (spec §8.8, issue #60).
   */
  listAdminEmails(input: ListChurchAdminEmailsInput): Promise<string[]>;
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

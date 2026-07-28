import type { ChurchId } from '../../branded-ids';
import type { Church, ChurchSlug } from '../../entities/church';

export interface ChurchRepository {
  getById(input: GetChurchByIdInput): Promise<Church>;
  getBySlug(input: GetChurchBySlugInput): Promise<Church>;
}

export interface GetChurchByIdInput {
  id: ChurchId;
}

export interface GetChurchBySlugInput {
  slug: ChurchSlug;
}

import type { ChurchId } from '../../branded-ids';
import type { Church, ChurchSlug } from '../../entities/church';

export interface ChurchRepository {
  getById(id: ChurchId): Promise<Church>;
  getBySlug(slug: ChurchSlug): Promise<Church>;
}

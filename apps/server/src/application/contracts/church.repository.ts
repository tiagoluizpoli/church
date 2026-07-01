import type {
  Church,
  ChurchId,
  ChurchSlug,
} from '../../domain/entities/church';

export interface ChurchRepository {
  getById(id: ChurchId): Promise<Church>;
  getBySlug(slug: ChurchSlug): Promise<Church>;
}

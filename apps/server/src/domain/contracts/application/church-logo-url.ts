import type { ObjectStorage } from '@/domain/contracts/infrastructure/object-storage';

export interface ChurchLogoUrlInput {
  objectStorage: Pick<ObjectStorage, 'publicUrl'>;
  logoKey: string | null;
}

import type { ChurchId } from '../../branded-ids';
import type { ObjectStorage } from '@/domain/contracts/infrastructure/object-storage';

export interface NormaliseLogoInput {
  bytes: Uint8Array;
}

export interface StoreChurchLogoInput {
  objectStorage: ObjectStorage;
  churchId: ChurchId;
  bytes: Uint8Array;
}

import type { ChurchId, MinistryId } from '../../branded-ids';
import type {
  MinistryServingProfile,
  ServingProfileEntryInput,
} from '../../entities/ministry-serving-profile';
import type { TransactionContext } from './transaction-context';

export interface ListServingProfileByMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

export interface ReplaceServingProfileInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  entries: ServingProfileEntryInput[];
  tx?: TransactionContext;
}

export interface ListServingProfilesByChurchInput {
  churchId: ChurchId;
  tx?: TransactionContext;
}

export interface MinistryServingProfileRepository {
  listByMinistry(
    input: ListServingProfileByMinistryInput,
  ): Promise<MinistryServingProfile[]>;
  listByChurch(
    input: ListServingProfilesByChurchInput,
  ): Promise<MinistryServingProfile[]>;
  replaceForMinistry(
    input: ReplaceServingProfileInput,
  ): Promise<MinistryServingProfile[]>;
}

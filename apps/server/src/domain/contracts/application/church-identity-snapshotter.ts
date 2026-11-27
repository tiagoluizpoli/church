import type { ChurchId } from '../../branded-ids';
import type { ChurchIdentitySnapshot } from '../../church-identity-snapshot';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { ObjectStorage } from '@/domain/contracts/infrastructure/object-storage';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';

export interface SnapshotChurchIdentityInput {
  churchId: ChurchId;
  /** The caller's open transaction; the read joins it. */
  tx?: TransactionContext;
}

export interface ChurchIdentitySnapshotter {
  /** Reads the Church's current logo and accent, for the caller to freeze into a payload. */
  snapshot(input: SnapshotChurchIdentityInput): Promise<ChurchIdentitySnapshot>;
}

export type { ChurchIdentitySnapshot };

export interface DbChurchIdentitySnapshotterDependencies {
  churchRepository: Pick<ChurchRepository, 'getSettings'>;
  objectStorage: Pick<ObjectStorage, 'publicUrl'>;
}

/** `I<Name>` for the class; existing consumers keep the original name. */
export type IChurchIdentitySnapshotter = ChurchIdentitySnapshotter;

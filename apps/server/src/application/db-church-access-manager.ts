import { nowAsDate } from '@church/time';
import type { IAuthorityManager } from '../domain/contracts/application/authority-manager';
import type {
  ChangeChurchAccessOutcome,
  ChangeChurchAccessRequest,
  IChurchAccessManager,
} from '../domain/contracts/application/church-access-manager';
import type { ChurchAccessRepository } from '../domain/contracts/infrastructure/church-access.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';

/** The Church must keep at least this many ChurchAdmins. */
const MIN_CHURCH_ADMINS = 1;

interface DbChurchAccessManagerDependencies {
  authorityManager: IAuthorityManager;
  churchAccessRepository: ChurchAccessRepository;
  unitOfWork: UnitOfWork;
}

/**
 * One Church's access changes run one at a time: the Church lock is taken
 * first, then the actor's authority, the target and the admin count are read
 * fresh in the same transaction, so a racing demotion can neither remove the
 * last ChurchAdmin nor let a just-demoted actor act.
 */
export class DbChurchAccessManager implements IChurchAccessManager {
  private readonly authorityManager: IAuthorityManager;
  private readonly churchAccessRepository: ChurchAccessRepository;
  private readonly unitOfWork: UnitOfWork;

  constructor({
    authorityManager,
    churchAccessRepository,
    unitOfWork,
  }: DbChurchAccessManagerDependencies) {
    this.authorityManager = authorityManager;
    this.churchAccessRepository = churchAccessRepository;
    this.unitOfWork = unitOfWork;
  }

  changeChurchAccess({
    churchId,
    actorId,
    memberId,
    accessLevel,
  }: ChangeChurchAccessRequest): Promise<ChangeChurchAccessOutcome> {
    const repository = this.churchAccessRepository;
    return this.unitOfWork.run(async (tx) => {
      await repository.lockChurch({ churchId, tx });
      const isAdmin = await this.authorityManager.canManageChurch({
        churchId,
        userId: actorId,
        tx,
      });
      if (!isAdmin) return { kind: 'forbidden' };

      const target = await repository.findTarget({ churchId, memberId, tx });
      if (!target) return { kind: 'not-found' };
      const applied = { kind: 'applied', memberId, accessLevel } as const;
      if (target.accessLevel === accessLevel) {
        return { ...applied, changed: false };
      }
      if (accessLevel === 'member') {
        const admins = await repository.countAdmins({ churchId, tx });
        if (admins <= MIN_CHURCH_ADMINS) return { kind: 'last-admin' };
      }

      await repository.saveChange({
        churchId,
        actorId,
        target,
        accessLevel,
        correlationId: crypto.randomUUID(),
        changedAt: nowAsDate(),
        tx,
      });
      return { ...applied, changed: true };
    });
  }
}

import type { AppConfig } from '@church/app-config';
import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { IAvailabilityCheckManager } from '../../domain/contracts/application/availability-check-manager';
import type { IPrepareManager } from '../../domain/contracts/application/prepare-manager';
import type { IScheduleReadModel } from '../../domain/contracts/application/schedule-read-model';

export interface PrepareControllerDependencies {
  prepareManager: IPrepareManager;
  scheduleReadModel: IScheduleReadModel;
  availabilityCheckManager: IAvailabilityCheckManager;
  activeChurchResolver: IActiveChurchResolver;
  authorityGuard: IAuthorityGuard;
  config: AppConfig;
}

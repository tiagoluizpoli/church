import type { IActiveChurchResolver } from '../../domain/contracts/application/active-church-resolver';
import type { IAuthorityGuard } from '../../domain/contracts/application/authority-guard';
import type { INotificationManager } from '../../domain/contracts/application/notification-manager';
import type { SessionGateway } from '../../domain/contracts/infrastructure';

export interface NotificationControllerDependencies {
  notificationManager: INotificationManager;
  activeChurchResolver: IActiveChurchResolver;
  sessionGateway: SessionGateway;
  authorityGuard: IAuthorityGuard;
  /** Most notifications one page may ask for (validated central config). */
  maxPageSize: number;
}

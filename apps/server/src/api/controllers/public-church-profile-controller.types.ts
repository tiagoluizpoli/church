import type { AppConfig } from '@church/app-config';
import type { IPublicChurchProfileManager } from '../../domain/contracts/application/public-church-profile-manager';
import type { IPublicEventManager } from '../../domain/contracts/application/public-event-manager';
import type { WebShell } from '../../domain/contracts/infrastructure';

export interface LimitedInput {
  bucket:
    | 'public-church-profile'
    | 'public-church-events'
    | 'public-church-page';
  ip: string;
}

export interface ChurchPageInput {
  ip: string;
  slug: string;
}

export interface ChurchPageRedirect {
  redirectTo: string;
}

export interface ChurchPageShell {
  status: number;
  /** Absent: the unfilled SPA shell. */
  html?: string;
}

export type ChurchPageAnswer = ChurchPageRedirect | ChurchPageShell;

export interface PublicChurchProfileControllerDependencies {
  publicChurchProfileManager: IPublicChurchProfileManager;
  publicEventManager: IPublicEventManager;
  webShell: WebShell;
  config: AppConfig;
}

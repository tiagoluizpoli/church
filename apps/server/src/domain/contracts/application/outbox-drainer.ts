import type { AppConfig } from '@church/app-config';
import type { ChurchId } from '../../branded-ids';
import type { NotificationRequest } from '../../notification-kinds';
import type { ChurchRecipient } from './church-notifications';
import type { ChurchNotifier } from './church-notifier';
import type { ISchedulingNotificationFacts } from './scheduling-notification-facts';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type {
  EmailLocale,
  EmailPayload,
  EmailSender,
} from '@/domain/contracts/infrastructure/email-sender';
import type { ErrorReporter } from '@/domain/contracts/infrastructure/error-reporter';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { MinistryInvitationRepository } from '@/domain/contracts/infrastructure/ministry-invitation.repository';
import type {
  ChainedInvitationOutboxMessage,
  ChurchBootstrapOutboxMessage,
  NotificationOutboxMessage,
  OutboxEmailDelivery,
  OutboxMessage,
  OutboxRepository,
} from '@/domain/contracts/infrastructure/outbox.repository';
import type { RoleRepository } from '@/domain/contracts/infrastructure/role.repository';
import type { Tracing } from '@/domain/contracts/infrastructure/tracing';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import type { VolunteerTransferRepository } from '@/domain/contracts/infrastructure/volunteer-transfer.repository';

export interface DrainOnceInput {
  limit: number;
}

export interface DrainOnceResult {
  claimed: number;
  sent: number;
  failed: number;
}

export interface IOutboxDrainer {
  /** Claims due outbox rows and attempts delivery for each, once. */
  drainOnce(input: DrainOnceInput): Promise<DrainOnceResult>;
}

export interface MinistryInvitationSubject {
  ministryInvitationId: string;
}

export interface DbOutboxDrainerDependencies {
  config: AppConfig;
  outboxRepository: OutboxRepository;
  invitationRepository: MinistryInvitationRepository;
  churchRepository: ChurchRepository;
  ministryRepository: MinistryRepository;
  roleRepository: RoleRepository;
  volunteerTransferRepository: VolunteerTransferRepository;
  emailSender: EmailSender;
  notifier: ChurchNotifier;
  schedulingFacts: ISchedulingNotificationFacts;
  unitOfWork: UnitOfWork;
  /** Base URL of the web app, for deep links in emails. */
  webBaseUrl: string;
  errorReporter: ErrorReporter;
  tracing: Tracing;
}

export interface ReportFailureInput {
  message: OutboxMessage;
}

export interface LocaleForInput {
  email: string;
}

export interface ProcessOneInput {
  message: OutboxMessage;
}

export interface ProcessInvitationMessageInput {
  message: ChainedInvitationOutboxMessage;
}

export interface ProcessChurchOfferMessageInput {
  message: ChurchBootstrapOutboxMessage;
}

export interface LoadPendingInvitationFactsInput {
  churchId: ChurchId;
  ministryInvitationId: string;
  churchLogoUrl?: string | null;
  churchAccent?: string | null;
  churchLocality?: string;
}

export interface LoadDeliveryFactsInput {
  churchId: ChurchId;
  to: ChurchRecipient;
  request: NotificationRequest;
}

export interface LoadTransferDigestFactsInput {
  churchId: ChurchId;
  to: ChurchRecipient;
  request: Extract<
    NotificationRequest,
    { kind: 'transfer_ministry_digest' | 'transfer_leaderless_ministry' }
  >;
}

export interface ProcessNotificationMessageInput {
  message: NotificationOutboxMessage;
}

export interface PrepareAndDeliverInput {
  message: OutboxMessage;
  payload: EmailPayload;
  locale: EmailLocale;
}

export interface DeliverEmailInput {
  message: OutboxMessage;
  delivery: OutboxEmailDelivery;
}

export interface SkipDeliveryInput {
  message: NotificationOutboxMessage;
  why: string;
}

export interface MarkSentInput {
  message: OutboxMessage;
}

export interface EmailIdempotencyKeyForInput {
  message: OutboxMessage;
}

export interface RetryOrFailInput {
  message: OutboxMessage;
  reason: string;
  retryable: boolean;
}

export interface FailTerminallyInput {
  message: OutboxMessage;
  reason: string;
  attempts?: number;
}

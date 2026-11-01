import type { AppConfig } from '@church/app-config';
import {
  fromDate,
  millisecondsBetween,
  now,
  nowAsDate,
  toDate,
} from '@church/time';
import type { ChurchId } from '../domain/branded-ids';
import type { ChurchRecipient } from '../domain/contracts/application/church-notifications';
import type {
  DrainOnceInput,
  DrainOnceResult,
  IOutboxDrainer,
} from '../domain/contracts/application/outbox-drainer';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type {
  EmailPayload,
  EmailSender,
  MinistryInvitationEmail,
} from '../domain/contracts/infrastructure/email-sender';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryInvitationRepository } from '../domain/contracts/infrastructure/ministry-invitation.repository';
import type {
  ChainedInvitationOutboxMessage,
  ChannelOutcomes,
  NotificationOutboxMessage,
  OutboxEmailDelivery,
  OutboxMessage,
  OutboxRepository,
} from '../domain/contracts/infrastructure/outbox.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type {
  VolunteerTransferRepository,
  WithdrawnAssignmentPreview,
} from '../domain/contracts/infrastructure/volunteer-transfer.repository';
import { EmailSendError } from '../domain/errors/email-send-error';
import {
  type MinistryInvitationDeliveryFacts,
  type NotificationDeliveryData,
  type NotificationRequest,
  notificationRequestDataSchemas,
  type TransferDigestDeliveryFacts,
} from '../domain/notification-kinds';
import { redemptionPathFor } from '../domain/services/ministry-invitation-redemption-path';
import {
  hasExhaustedRetries,
  nextRetryAt,
} from '../domain/services/outbox-retry-policy';
import { webLink } from '../domain/services/web-link';
import { CHURCH_SINK_NAMES, type ChurchNotifier } from './church-notifier';
import type { SchedulingNotificationFacts } from './scheduling-notification-facts';

export class DbOutboxDrainer implements IOutboxDrainer {
  private readonly outboxRepository: OutboxRepository;
  private readonly invitationRepository: MinistryInvitationRepository;
  private readonly churchRepository: ChurchRepository;
  private readonly ministryRepository: MinistryRepository;
  private readonly roleRepository: RoleRepository;
  private readonly volunteerTransferRepository: VolunteerTransferRepository;
  private readonly emailSender: EmailSender;
  private readonly notifier: ChurchNotifier;
  private readonly schedulingFacts: SchedulingNotificationFacts;
  private readonly unitOfWork: UnitOfWork;
  private readonly outboxPolicy: AppConfig['outbox'];
  private readonly emailIdempotencyRetentionMs: number;
  private readonly webBaseUrl: string;

  constructor({
    outboxRepository,
    invitationRepository,
    churchRepository,
    ministryRepository,
    roleRepository,
    volunteerTransferRepository,
    emailSender,
    notifier,
    schedulingFacts,
    unitOfWork,
    config,
    webBaseUrl,
  }: DbOutboxDrainerDependencies) {
    this.outboxRepository = outboxRepository;
    this.invitationRepository = invitationRepository;
    this.churchRepository = churchRepository;
    this.ministryRepository = ministryRepository;
    this.roleRepository = roleRepository;
    this.volunteerTransferRepository = volunteerTransferRepository;
    this.emailSender = emailSender;
    this.notifier = notifier;
    this.schedulingFacts = schedulingFacts;
    this.unitOfWork = unitOfWork;
    this.webBaseUrl = webBaseUrl;
    const { outbox } = config;
    this.outboxPolicy = outbox;
    this.emailIdempotencyRetentionMs = outbox.emailIdempotencyRetentionMs;
  }

  async drainOnce(input: DrainOnceInput): Promise<DrainOnceResult> {
    const { limit } = input;
    const claimed = await this.unitOfWork.run((tx) =>
      this.outboxRepository.claimPending({
        limit,
        now: nowAsDate(),
        tx,
      }),
    );

    let sent = 0;
    let failed = 0;
    for (const message of claimed) {
      const outcome = await this.processOne({ message });
      if (outcome === 'sent') sent += 1;
      else failed += 1;
    }

    return { claimed: claimed.length, sent, failed };
  }

  private async processOne({
    message,
  }: ProcessOneInput): Promise<'sent' | 'failed'> {
    switch (message.kind) {
      case 'invitation.chained':
        return this.processInvitationMessage({ message });
      case 'notification':
        return this.processNotificationMessage({ message });
      case 'invitation.church-bootstrap':
        await this.failTerminally({
          message,
          reason: `Delivery not yet implemented for kind "${message.kind}"`,
        });
        return 'failed';
    }
  }

  private async processInvitationMessage({
    message,
  }: ProcessInvitationMessageInput): Promise<'sent' | 'failed'> {
    const invitation = await this.invitationRepository.findById({
      churchId: message.churchId,
      ministryInvitationId: message.payload.ministryInvitationId,
    });

    if (!invitation || invitation.status !== 'pending') {
      await this.failTerminally({
        message,
        reason: 'Invitation is no longer pending',
      });
      return 'failed';
    }
    if (message.emailDelivery) {
      return this.deliverEmail({ message, delivery: message.emailDelivery });
    }

    const [church, ministry, email] = await Promise.all([
      this.churchRepository.getById({ id: message.churchId }),
      this.ministryRepository.getById({
        churchId: message.churchId,
        id: invitation.ministryId,
      }),
      this.invitationRepository.resolveRecipientEmail({
        ministryInvitation: invitation,
      }),
    ]);
    const roles = await Promise.all(
      invitation.roleIds.map((roleId) =>
        this.roleRepository.getById({ churchId: message.churchId, id: roleId }),
      ),
    );

    const payload: MinistryInvitationEmail = {
      kind: message.kind,
      to: email,
      churchName: church.name,
      ministryName: ministry.name,
      ministryAccessLevel: invitation.ministryAccessLevel,
      roleNames: roles.map((role) => role.name),
      expiresAt: invitation.expiresAt,
      churchTimezone: church.timezone,
      redemptionUrl: webLink({
        baseUrl: this.webBaseUrl,
        path: redemptionPathFor(invitation),
      }),
    };

    return this.prepareAndDeliver({ message, payload });
  }

  /** The invitation's display facts, read now; `null` once it is no longer pending. */
  private async loadPendingInvitationFacts({
    churchId,
    ministryInvitationId,
  }: LoadPendingInvitationFactsInput): Promise<MinistryInvitationDeliveryFacts | null> {
    const invitation = await this.invitationRepository.findById({
      churchId,
      ministryInvitationId,
    });
    if (!invitation || invitation.status !== 'pending') return null;
    const [church, ministry, roles] = await Promise.all([
      this.churchRepository.getById({ id: churchId }),
      this.ministryRepository.getById({ churchId, id: invitation.ministryId }),
      Promise.all(
        invitation.roleIds.map((roleId) =>
          this.roleRepository.getById({ churchId, id: roleId }),
        ),
      ),
    ]);
    return {
      ministryInvitationId: invitation.id,
      ministryId: invitation.ministryId,
      ministryName: ministry.name,
      churchName: church.name,
      churchTimezone: church.timezone,
      ministryAccessLevel: invitation.ministryAccessLevel,
      roleNames: roles.map((role) => role.name),
      expiresAt: invitation.expiresAt,
      redemptionUrl: webLink({
        baseUrl: this.webBaseUrl,
        path: redemptionPathFor(invitation),
      }),
    };
  }

  /** The kind's display facts, read now; `null` when the kind's subject is gone. */
  private async loadDeliveryFacts({
    churchId,
    to,
    request,
  }: LoadDeliveryFactsInput): Promise<NotificationDeliveryData | null> {
    switch (request.kind) {
      case 'ministry_invitation':
        return this.loadPendingInvitationFacts({
          churchId,
          ministryInvitationId: request.data.ministryInvitationId,
        });
      case 'availability_opened':
      case 'availability_reminder':
        return this.schedulingFacts.availability({
          churchId,
          data: request.data,
        });
      case 'schedule_published':
        return this.schedulingFacts.schedulePublished({
          churchId,
          userId: to.userId,
          data: request.data,
        });
      case 'transfer_ministry_digest':
      case 'transfer_leaderless_ministry':
        return this.loadTransferDigestFacts({ churchId, request });
    }
  }

  /** Transfer facts are historical: the retired profile and the audit rows
   * never change, so they always resolve. */
  private async loadTransferDigestFacts({
    churchId,
    request,
  }: LoadTransferDigestFactsInput): Promise<TransferDigestDeliveryFacts> {
    const details = await this.volunteerTransferRepository.getDigestDetails({
      churchId,
      ministryId: request.data.ministryId,
      volunteerId: request.data.volunteerId,
      correlationId: request.data.transferCorrelationId,
    });
    return {
      ministryName: details.ministryName,
      volunteerName: details.volunteerName,
      withdrawnAssignments: toEmailLines({
        assignments: details.withdrawnAssignments,
      }),
    };
  }

  /**
   * Hands one recipient's Notification to every unsettled sink, then settles
   * the row: all delivered/skipped completes it; a retryable sink retries the
   * whole row (settled sinks are not attempted again); a terminal sink fails
   * it without undoing another sink's delivery.
   */
  private async processNotificationMessage({
    message,
  }: ProcessNotificationMessageInput): Promise<'sent' | 'failed'> {
    const { to, kind, data } = message.payload;
    const request = notificationRequestDataSchemas[kind]?.safeParse(data);
    if (!request?.success) {
      await this.failTerminally({
        message,
        reason: `Invalid data for notification kind "${kind}"`,
      });
      return 'failed';
    }
    let facts = message.payload.facts;
    if (!facts) {
      const resolved = await this.loadDeliveryFacts({
        churchId: message.churchId,
        to,
        // Parsed by this kind's own schema just above.
        request: { kind, data: request.data } as NotificationRequest,
      });
      if (!resolved) {
        if (kind === 'ministry_invitation') {
          await this.failTerminally({
            message,
            reason: 'Invitation is no longer pending',
          });
          return 'failed';
        }
        // The change is gone before anything was delivered: nothing to render.
        console.warn(
          `[Outbox] notification ${message.id} (${kind}) skipped: its context no longer exists`,
        );
        await this.unitOfWork.run((tx) =>
          this.outboxRepository.markSent({
            id: message.id,
            sentAt: nowAsDate(),
            channelOutcomes: {
              ...message.channelOutcomes,
              [CHURCH_SINK_NAMES.email]: 'skipped',
              [CHURCH_SINK_NAMES.inbox]: 'skipped',
            },
            tx,
          }),
        );
        return 'sent';
      }
      facts = resolved;
      // Every retry re-renders from these, never from live scheduling objects.
      await this.unitOfWork.run((tx) =>
        this.outboxRepository.recordDeliveryFacts({
          id: message.id,
          facts: resolved,
          tx,
        }),
      );
    }

    const { outcomes } = await this.notifier.send({
      to,
      kind,
      data: facts,
      deliveryId: message.id,
      settledSinks: Object.keys(message.channelOutcomes),
    });

    const channelOutcomes: ChannelOutcomes = { ...message.channelOutcomes };
    const retryable: string[] = [];
    const failures: string[] = [];
    for (const [sink, outcome] of Object.entries(outcomes)) {
      if (outcome.status === 'delivered') channelOutcomes[sink] = 'delivered';
      else if (outcome.status === 'skipped') channelOutcomes[sink] = 'skipped';
      else {
        failures.push(`${sink}: ${outcome.reason}`);
        if (outcome.status === 'retryable') retryable.push(sink);
        else channelOutcomes[sink] = 'failed';
      }
    }

    const attempts = message.attempts + 1;
    if (
      retryable.length > 0 &&
      !hasExhaustedRetries({ attempts, policy: this.outboxPolicy })
    ) {
      const retryAt = nextRetryAt({ attempts, policy: this.outboxPolicy });
      await this.unitOfWork.run((tx) =>
        this.outboxRepository.markFailed({
          id: message.id,
          lastError: failures.join('; '),
          attempts,
          status: 'pending',
          scheduledFor: toDate({ instant: retryAt }),
          channelOutcomes,
          tx,
        }),
      );
      return 'failed';
    }
    for (const sink of retryable) channelOutcomes[sink] = 'failed';

    if (Object.values(channelOutcomes).includes('failed')) {
      await this.unitOfWork.run((tx) =>
        this.outboxRepository.markFailed({
          id: message.id,
          lastError:
            failures.length > 0
              ? failures.join('; ')
              : (message.lastError ?? ''),
          attempts,
          status: 'failed',
          channelOutcomes,
          tx,
        }),
      );
      return 'failed';
    }
    await this.unitOfWork.run((tx) =>
      this.outboxRepository.markSent({
        id: message.id,
        sentAt: nowAsDate(),
        channelOutcomes,
        tx,
      }),
    );
    return 'sent';
  }

  /**
   * Fixes the email before its first attempt: the prepared request, the
   * row-derived key and the first-attempt Instant commit in their own short
   * transaction, so every later attempt resends exactly this.
   */
  private async prepareAndDeliver({
    message,
    payload,
  }: PrepareAndDeliverInput): Promise<'sent' | 'failed'> {
    const delivery: OutboxEmailDelivery = {
      email: this.emailSender.prepare({ payload }),
      idempotencyKey: emailIdempotencyKeyFor({ message }),
      firstAttemptAt: now(),
    };
    await this.unitOfWork.run((tx) =>
      this.outboxRepository.recordEmailPrepared({
        id: message.id,
        ...delivery,
        tx,
      }),
    );
    return this.deliverEmail({ message, delivery });
  }

  /** The network call runs outside any transaction; only the bookkeeping
   * around it opens one. */
  private async deliverEmail({
    message,
    delivery,
  }: DeliverEmailInput): Promise<'sent' | 'failed'> {
    if (delivery.deliveredAt) {
      await this.markSent({ message });
      return 'sent';
    }
    const age = millisecondsBetween({
      start: delivery.firstAttemptAt,
      end: now(),
    });
    // A key the provider may have forgotten no longer deduplicates, and a
    // fresh key would too: an unconfirmed attempt this old is never resent.
    if (age >= this.emailIdempotencyRetentionMs) {
      await this.failTerminally({
        message,
        reason: 'Email idempotency retention elapsed since the first attempt',
      });
      return 'failed';
    }
    try {
      const result = await this.emailSender.deliver({
        email: delivery.email,
        idempotencyKey: delivery.idempotencyKey,
      });
      await this.unitOfWork.run(async (tx) => {
        await this.outboxRepository.recordEmailDelivered({
          id: message.id,
          providerMessageId: result.providerMessageId,
          deliveredAt: now(),
          tx,
        });
        await this.outboxRepository.markSent({
          id: message.id,
          providerMessageId: result.providerMessageId,
          sentAt: nowAsDate(),
          tx,
        });
      });
      return 'sent';
    } catch (error) {
      if (!(error instanceof EmailSendError)) throw error;
      await this.handleSendFailure({ message, error });
      return 'failed';
    }
  }

  private async markSent({ message }: MarkSentInput): Promise<void> {
    await this.unitOfWork.run((tx) =>
      this.outboxRepository.markSent({
        id: message.id,
        providerMessageId: message.providerMessageId,
        sentAt: nowAsDate(),
        tx,
      }),
    );
  }

  private async handleSendFailure({
    message,
    error,
  }: HandleSendFailureInput): Promise<void> {
    const attempts = message.attempts + 1;
    if (
      error.retryable &&
      !hasExhaustedRetries({ attempts, policy: this.outboxPolicy })
    ) {
      const retryAt = nextRetryAt({ attempts, policy: this.outboxPolicy });
      await this.unitOfWork.run((tx) =>
        this.outboxRepository.markFailed({
          id: message.id,
          lastError: error.message,
          attempts,
          status: 'pending',
          scheduledFor: toDate({ instant: retryAt }),
          tx,
        }),
      );
      return;
    }
    await this.failTerminally({
      message,
      reason: error.message,
      attempts,
    });
  }

  private async failTerminally({
    message,
    reason,
    attempts = message.attempts,
  }: FailTerminallyInput): Promise<void> {
    await this.unitOfWork.run((tx) =>
      this.outboxRepository.markFailed({
        id: message.id,
        lastError: reason,
        attempts,
        status: 'failed',
        tx,
      }),
    );
  }
}

interface DbOutboxDrainerDependencies {
  config: AppConfig;
  outboxRepository: OutboxRepository;
  invitationRepository: MinistryInvitationRepository;
  churchRepository: ChurchRepository;
  ministryRepository: MinistryRepository;
  roleRepository: RoleRepository;
  volunteerTransferRepository: VolunteerTransferRepository;
  emailSender: EmailSender;
  notifier: ChurchNotifier;
  schedulingFacts: SchedulingNotificationFacts;
  unitOfWork: UnitOfWork;
  /** Base URL of the web app, for deep links in emails. */
  webBaseUrl: string;
}

interface ProcessOneInput {
  message: OutboxMessage;
}

interface ProcessInvitationMessageInput {
  message: ChainedInvitationOutboxMessage;
}

interface LoadPendingInvitationFactsInput {
  churchId: ChurchId;
  ministryInvitationId: string;
}

interface LoadDeliveryFactsInput {
  churchId: ChurchId;
  to: ChurchRecipient;
  request: NotificationRequest;
}

interface LoadTransferDigestFactsInput {
  churchId: ChurchId;
  request: Extract<
    NotificationRequest,
    { kind: 'transfer_ministry_digest' | 'transfer_leaderless_ministry' }
  >;
}

interface ProcessNotificationMessageInput {
  message: NotificationOutboxMessage;
}

interface PrepareAndDeliverInput {
  message: OutboxMessage;
  payload: EmailPayload;
}

interface DeliverEmailInput {
  message: OutboxMessage;
  delivery: OutboxEmailDelivery;
}

interface MarkSentInput {
  message: OutboxMessage;
}

interface EmailIdempotencyKeyForInput {
  message: OutboxMessage;
}

/** One key per outbox row: every replay of the row reuses it. */
function emailIdempotencyKeyFor({
  message,
}: EmailIdempotencyKeyForInput): string {
  return `outbox-message/${message.id}`;
}

interface ToEmailLinesInput {
  assignments: WithdrawnAssignmentPreview[];
}

function toEmailLines({ assignments }: ToEmailLinesInput) {
  return assignments.map(({ eventName, eventTimeBlockStart, roleName }) => ({
    eventName,
    eventTimeBlockStart: fromDate({ date: eventTimeBlockStart }),
    roleName,
  }));
}

interface HandleSendFailureInput {
  message: OutboxMessage;
  error: EmailSendError;
}

interface FailTerminallyInput {
  message: OutboxMessage;
  reason: string;
  attempts?: number;
}

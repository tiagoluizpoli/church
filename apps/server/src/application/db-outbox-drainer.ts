import type { AppConfig } from '@church/app-config';
import { env } from '@church/env/server';
import {
  fromDate,
  millisecondsBetween,
  now,
  nowAsDate,
  toDate,
} from '@church/time';
import type { ChurchId, MinistryId, VolunteerId } from '../domain/branded-ids';
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
  RedemptionAcceptedEmail,
  TransferLeaderlessMinistryEmail,
  TransferMinistryDigestEmail,
} from '../domain/contracts/infrastructure/email-sender';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryInvitationRepository } from '../domain/contracts/infrastructure/ministry-invitation.repository';
import type {
  ChainedInvitationOutboxMessage,
  ChannelOutcomes,
  MinistryInvitationOutboxMessage,
  NotificationOutboxMessage,
  OutboxEmailDelivery,
  OutboxMessage,
  OutboxRepository,
  RedemptionAcceptedOutboxMessage,
  TransferLeaderlessMinistryOutboxMessage,
  TransferMinistryDigestOutboxMessage,
} from '../domain/contracts/infrastructure/outbox.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '../domain/contracts/infrastructure/volunteer.repository';
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
import type { ChurchNotifier } from './church-notifier';
import type { SchedulingNotificationFacts } from './scheduling-notification-facts';

export class DbOutboxDrainer implements IOutboxDrainer {
  private readonly outboxRepository: OutboxRepository;
  private readonly invitationRepository: MinistryInvitationRepository;
  private readonly churchRepository: ChurchRepository;
  private readonly ministryRepository: MinistryRepository;
  private readonly roleRepository: RoleRepository;
  private readonly volunteerRepository: VolunteerRepository;
  private readonly volunteerTransferRepository: VolunteerTransferRepository;
  private readonly emailSender: EmailSender;
  private readonly notifier: ChurchNotifier;
  private readonly schedulingFacts: SchedulingNotificationFacts;
  private readonly unitOfWork: UnitOfWork;
  private readonly outboxPolicy: AppConfig['outbox'];
  private readonly emailIdempotencyRetentionMs: number;

  constructor({
    outboxRepository,
    invitationRepository,
    churchRepository,
    ministryRepository,
    roleRepository,
    volunteerRepository,
    volunteerTransferRepository,
    emailSender,
    notifier,
    schedulingFacts,
    unitOfWork,
    config,
  }: DbOutboxDrainerDependencies) {
    this.outboxRepository = outboxRepository;
    this.invitationRepository = invitationRepository;
    this.churchRepository = churchRepository;
    this.ministryRepository = ministryRepository;
    this.roleRepository = roleRepository;
    this.volunteerRepository = volunteerRepository;
    this.volunteerTransferRepository = volunteerTransferRepository;
    this.emailSender = emailSender;
    this.notifier = notifier;
    this.schedulingFacts = schedulingFacts;
    this.unitOfWork = unitOfWork;
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
      case 'invitation.ministry':
        return this.processInvitationMessage({ message });
      case 'redemption.accepted':
        return this.processRedemptionAcceptedMessage({ message });
      case 'transfer.ministry-digest':
        return this.processTransferMinistryDigestMessage({ message });
      case 'transfer.leaderless-ministry':
        return this.processTransferLeaderlessMinistryMessage({ message });
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
      redemptionUrl: `${env.CORS_ORIGIN}${redemptionPathFor(invitation)}`,
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
      redemptionUrl: `${env.CORS_ORIGIN}${redemptionPathFor(invitation)}`,
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
      ministryId: request.data.ministryId as MinistryId,
      volunteerId: request.data.volunteerId as VolunteerId,
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
    const facts = await this.loadDeliveryFacts({
      churchId: message.churchId,
      to,
      // Parsed by this kind's own schema just above.
      request: { kind, data: request.data } as NotificationRequest,
    });
    if (!facts) {
      await this.failTerminally({
        message,
        reason:
          kind === 'ministry_invitation'
            ? 'Invitation is no longer pending'
            : `Context of notification kind "${kind}" no longer exists`,
      });
      return 'failed';
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

  private async processRedemptionAcceptedMessage({
    message,
  }: ProcessRedemptionAcceptedMessageInput): Promise<'sent' | 'failed'> {
    const invitation = await this.invitationRepository.findById({
      churchId: message.churchId,
      ministryInvitationId: message.payload.ministryInvitationId,
    });
    if (!invitation || invitation.status !== 'accepted') {
      await this.failTerminally({
        message,
        reason: 'Invitation was not accepted',
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
    const payload: RedemptionAcceptedEmail = {
      kind: message.kind,
      to: email,
      churchName: church.name,
      ministryName: ministry.name,
    };
    return this.prepareAndDeliver({ message, payload });
  }

  private async processTransferMinistryDigestMessage({
    message,
  }: ProcessTransferMinistryDigestMessageInput): Promise<'sent' | 'failed'> {
    if (message.emailDelivery) {
      return this.deliverEmail({ message, delivery: message.emailDelivery });
    }
    const ministryId = message.payload.ministryId as MinistryId;
    const volunteerId = message.payload.volunteerId as VolunteerId;
    const [details, recipients] = await Promise.all([
      this.volunteerTransferRepository.getDigestDetails({
        churchId: message.churchId,
        ministryId,
        volunteerId,
        correlationId: message.correlationId,
      }),
      this.volunteerRepository.listActiveLeaderEmails({
        churchId: message.churchId,
        ministryId,
      }),
    ]);
    if (recipients.length === 0) {
      await this.failTerminally({
        message,
        reason: 'Ministry has no active leader to receive the digest',
      });
      return 'failed';
    }
    const payload: TransferMinistryDigestEmail = {
      kind: message.kind,
      to: recipients,
      ministryName: details.ministryName,
      volunteerName: details.volunteerName,
      withdrawnAssignments: toEmailLines({
        assignments: details.withdrawnAssignments,
      }),
    };
    return this.prepareAndDeliver({ message, payload });
  }

  private async processTransferLeaderlessMinistryMessage({
    message,
  }: ProcessTransferLeaderlessMinistryMessageInput): Promise<
    'sent' | 'failed'
  > {
    if (message.emailDelivery) {
      return this.deliverEmail({ message, delivery: message.emailDelivery });
    }
    const ministryId = message.payload.ministryId as MinistryId;
    const volunteerId = message.payload.volunteerId as VolunteerId;
    const [details, recipients] = await Promise.all([
      this.volunteerTransferRepository.getDigestDetails({
        churchId: message.churchId,
        ministryId,
        volunteerId,
        correlationId: message.correlationId,
      }),
      this.churchRepository.listAdminEmails({ id: message.churchId }),
    ]);
    if (recipients.length === 0) {
      await this.failTerminally({
        message,
        reason: 'Church has no admin to escalate the leaderless Ministry to',
      });
      return 'failed';
    }
    const payload: TransferLeaderlessMinistryEmail = {
      kind: message.kind,
      to: recipients,
      ministryName: details.ministryName,
      volunteerName: details.volunteerName,
      withdrawnAssignments: toEmailLines({
        assignments: details.withdrawnAssignments,
      }),
    };
    return this.prepareAndDeliver({ message, payload });
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
  volunteerRepository: VolunteerRepository;
  volunteerTransferRepository: VolunteerTransferRepository;
  emailSender: EmailSender;
  notifier: ChurchNotifier;
  schedulingFacts: SchedulingNotificationFacts;
  unitOfWork: UnitOfWork;
}

interface ProcessOneInput {
  message: OutboxMessage;
}

interface ProcessInvitationMessageInput {
  message: ChainedInvitationOutboxMessage | MinistryInvitationOutboxMessage;
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

interface ProcessRedemptionAcceptedMessageInput {
  message: RedemptionAcceptedOutboxMessage;
}

interface ProcessTransferMinistryDigestMessageInput {
  message: TransferMinistryDigestOutboxMessage;
}

interface ProcessTransferLeaderlessMinistryMessageInput {
  message: TransferLeaderlessMinistryOutboxMessage;
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

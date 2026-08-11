import { env } from '@church/env/server';
import 'reflect-metadata';
import { injectable } from 'tsyringe';
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
} from '../domain/contracts/infrastructure/email-sender';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryInvitationRepository } from '../domain/contracts/infrastructure/ministry-invitation.repository';
import type {
  ChainedInvitationOutboxMessage,
  MinistryInvitationOutboxMessage,
  OutboxMessage,
  OutboxRepository,
  RedemptionAcceptedOutboxMessage,
} from '../domain/contracts/infrastructure/outbox.repository';
import type { RoleRepository } from '../domain/contracts/infrastructure/role.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import { EmailSendError } from '../domain/errors/email-send-error';
import { redemptionPathFor } from '../domain/services/ministry-invitation-redemption-path';
import {
  hasExhaustedRetries,
  nextRetryAt,
} from '../domain/services/outbox-retry-policy';

@injectable()
export class DbOutboxDrainer implements IOutboxDrainer {
  constructor({
    outboxRepository,
    invitationRepository,
    churchRepository,
    ministryRepository,
    roleRepository,
    emailSender,
    unitOfWork,
  }: DbOutboxDrainerDependencies) {
    this.outboxRepository = outboxRepository;
    this.invitationRepository = invitationRepository;
    this.churchRepository = churchRepository;
    this.ministryRepository = ministryRepository;
    this.roleRepository = roleRepository;
    this.emailSender = emailSender;
    this.unitOfWork = unitOfWork;
  }

  private readonly outboxRepository: OutboxRepository;
  private readonly invitationRepository: MinistryInvitationRepository;
  private readonly churchRepository: ChurchRepository;
  private readonly ministryRepository: MinistryRepository;
  private readonly roleRepository: RoleRepository;
  private readonly emailSender: EmailSender;
  private readonly unitOfWork: UnitOfWork;

  async drainOnce(input: DrainOnceInput): Promise<DrainOnceResult> {
    const { limit } = input;
    const claimed = await this.unitOfWork.run((tx) =>
      this.outboxRepository.claimPending({ limit, now: new Date(), tx }),
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
      case 'invitation.church-bootstrap':
      case 'transfer.ministry-digest':
      case 'transfer.leaderless-ministry':
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

    const [church, ministry, email] = await Promise.all([
      this.churchRepository.getById({ id: message.churchId }),
      this.ministryRepository.getById(message.churchId, invitation.ministryId),
      this.invitationRepository.resolveRecipientEmail({
        ministryInvitation: invitation,
      }),
    ]);
    const roles = await Promise.all(
      invitation.roleIds.map((roleId) =>
        this.roleRepository.getById(message.churchId, roleId),
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
      redemptionUrl: `${env.CORS_ORIGIN}${redemptionPathFor(invitation)}`,
    };

    return this.sendAndMark({ message, payload });
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
    const [church, ministry, email] = await Promise.all([
      this.churchRepository.getById({ id: message.churchId }),
      this.ministryRepository.getById(message.churchId, invitation.ministryId),
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
    return this.sendAndMark({ message, payload });
  }

  private async sendAndMark({
    message,
    payload,
  }: SendAndMarkInput): Promise<'sent' | 'failed'> {
    try {
      const result = await this.emailSender.send({ payload });
      await this.unitOfWork.run((tx) =>
        this.outboxRepository.markSent({
          id: message.id,
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
          tx,
        }),
      );
      return 'sent';
    } catch (error) {
      if (!(error instanceof EmailSendError)) throw error;
      await this.handleSendFailure({ message, error });
      return 'failed';
    }
  }

  private async handleSendFailure({
    message,
    error,
  }: HandleSendFailureInput): Promise<void> {
    const attempts = message.attempts + 1;
    if (error.retryable && !hasExhaustedRetries(attempts)) {
      await this.unitOfWork.run((tx) =>
        this.outboxRepository.markFailed({
          id: message.id,
          lastError: error.message,
          attempts,
          status: 'pending',
          scheduledFor: nextRetryAt(attempts),
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

export interface DbOutboxDrainerDependencies {
  outboxRepository: OutboxRepository;
  invitationRepository: MinistryInvitationRepository;
  churchRepository: ChurchRepository;
  ministryRepository: MinistryRepository;
  roleRepository: RoleRepository;
  emailSender: EmailSender;
  unitOfWork: UnitOfWork;
}

interface ProcessOneInput {
  message: OutboxMessage;
}

interface ProcessInvitationMessageInput {
  message: ChainedInvitationOutboxMessage | MinistryInvitationOutboxMessage;
}

interface ProcessRedemptionAcceptedMessageInput {
  message: RedemptionAcceptedOutboxMessage;
}

interface SendAndMarkInput {
  message: OutboxMessage;
  payload: EmailPayload;
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

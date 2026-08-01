import { env } from '@church/env/server';
import 'reflect-metadata';
import { inject, injectable } from 'tsyringe';
import type {
  DrainOnceInput,
  DrainOnceResult,
  IOutboxDrainer,
} from '../domain/contracts/application/outbox-drainer';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type {
  EmailSender,
  MinistryInvitationEmail,
} from '../domain/contracts/infrastructure/email-sender';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type { MinistryInvitationRepository } from '../domain/contracts/infrastructure/ministry-invitation.repository';
import type {
  ChainedInvitationOutboxMessage,
  MinistryInvitationOutboxMessage,
  OutboxMessage,
  OutboxRepository,
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
  constructor(
    @inject('IOutboxRepository')
    private readonly outboxRepository: OutboxRepository,
    @inject('IMinistryInvitationRepository')
    private readonly invitationRepository: MinistryInvitationRepository,
    @inject('IChurchRepository')
    private readonly churchRepository: ChurchRepository,
    @inject('IMinistryRepository')
    private readonly ministryRepository: MinistryRepository,
    @inject('IRoleRepository')
    private readonly roleRepository: RoleRepository,
    @inject('IEmailSender')
    private readonly emailSender: EmailSender,
    @inject('IUnitOfWork')
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async drainOnce(input: DrainOnceInput): Promise<DrainOnceResult> {
    const { limit } = input;
    const claimed = await this.unitOfWork.run((tx) =>
      this.outboxRepository.claimPending({ limit, now: new Date(), tx }),
    );

    let sent = 0;
    let failed = 0;
    for (const message of claimed) {
      const outcome = await this.processOne(message);
      if (outcome === 'sent') sent += 1;
      else failed += 1;
    }

    return { claimed: claimed.length, sent, failed };
  }

  private async processOne(message: OutboxMessage): Promise<'sent' | 'failed'> {
    switch (message.kind) {
      case 'invitation.chained':
      case 'invitation.ministry':
        return this.processInvitationMessage(message);
      case 'invitation.church-bootstrap':
      case 'transfer.ministry-digest':
      case 'transfer.leaderless-ministry':
        await this.failTerminally(
          message,
          `Delivery not yet implemented for kind "${message.kind}"`,
        );
        return 'failed';
    }
  }

  private async processInvitationMessage(
    message: ChainedInvitationOutboxMessage | MinistryInvitationOutboxMessage,
  ): Promise<'sent' | 'failed'> {
    const invitation = await this.invitationRepository.findById({
      churchId: message.churchId,
      ministryInvitationId: message.payload.ministryInvitationId,
    });

    if (!invitation || invitation.status !== 'pending') {
      await this.failTerminally(message, 'Invitation is no longer pending');
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
      await this.handleSendFailure(message, error);
      return 'failed';
    }
  }

  private async handleSendFailure(
    message: OutboxMessage,
    error: EmailSendError,
  ): Promise<void> {
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
    await this.failTerminally(message, error.message, attempts);
  }

  private async failTerminally(
    message: OutboxMessage,
    reason: string,
    attempts: number = message.attempts,
  ): Promise<void> {
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

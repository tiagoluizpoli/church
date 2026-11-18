import { DomainError } from '@church/core';
import { describe, expect, it } from 'vitest';
import { EmailSendError } from '@/domain/errors/email-send-error';
import { InvalidDateRangeError } from '@/domain/errors/invalid-date-range';
import { InvalidRequiredCountError } from '@/domain/errors/invalid-required-count';
import { IsolationBreachError } from '@/domain/errors/isolation-breach-error';
import { MissingOutboxDeliveryRecordError } from '@/domain/errors/missing-outbox-delivery-record';
import { ResendCooldownActiveError } from '@/domain/errors/resend-cooldown-active';
import { ResendDailyCapExceededError } from '@/domain/errors/resend-daily-cap-exceeded';

describe('Domain Errors', () => {
  describe('InvalidDateRangeError', () => {
    it('inherits from DomainError and Error', () => {
      const error = new InvalidDateRangeError();
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    });

    it('has the correct name and message', () => {
      const error = new InvalidDateRangeError();
      expect(error.name).toBe('InvalidDateRangeError');
      expect(error.message).toBe('Start date must be before end date');
    });
  });

  describe('InvalidRequiredCountError', () => {
    it('inherits from DomainError and Error', () => {
      const error = new InvalidRequiredCountError();
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    });

    it('has the correct name and message', () => {
      const error = new InvalidRequiredCountError();
      expect(error.name).toBe('InvalidRequiredCountError');
      expect(error.message).toBe('Required count must be at least 1');
    });
  });

  describe('IsolationBreachError', () => {
    it('inherits from DomainError and Error', () => {
      const error = new IsolationBreachError();
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    });

    it('has the correct name and default message', () => {
      const error = new IsolationBreachError();
      expect(error.name).toBe('IsolationBreachError');
      expect(error.message).toBe('Isolation breach: Church ID mismatch');
    });

    it('supports a custom message', () => {
      const error = new IsolationBreachError('Custom breach info');
      expect(error.message).toBe('Custom breach info');
    });
  });

  describe('MissingOutboxDeliveryRecordError', () => {
    it('inherits from DomainError and Error', () => {
      const error = new MissingOutboxDeliveryRecordError({
        ministryInvitationId: 'invitation-1',
      });
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    });

    it('has the correct name, code, and message', () => {
      const error = new MissingOutboxDeliveryRecordError({
        ministryInvitationId: 'invitation-1',
      });
      expect(error.name).toBe('MissingOutboxDeliveryRecordError');
      expect(error.code).toBe('MISSING_OUTBOX_DELIVERY_RECORD');
      expect(error.message).toBe(
        'No outbox message found for Ministry Invitation invitation-1',
      );
    });
  });

  describe('ResendCooldownActiveError', () => {
    it('inherits from DomainError and Error', () => {
      const error = new ResendCooldownActiveError();
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    });

    it('has the correct name and code', () => {
      const error = new ResendCooldownActiveError();
      expect(error.name).toBe('ResendCooldownActiveError');
      expect(error.code).toBe('RESEND_COOLDOWN_ACTIVE');
    });
  });

  describe('ResendDailyCapExceededError', () => {
    it('inherits from DomainError and Error', () => {
      const error = new ResendDailyCapExceededError();
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    });

    it('has the correct name and code', () => {
      const error = new ResendDailyCapExceededError();
      expect(error.name).toBe('ResendDailyCapExceededError');
      expect(error.code).toBe('RESEND_DAILY_CAP_EXCEEDED');
    });
  });

  describe('EmailSendError', () => {
    it('inherits from DomainError and Error', () => {
      const error = new EmailSendError({
        message: 'send failed',
        retryable: true,
      });
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    });

    it('stores retryable and formats the message', () => {
      const error = new EmailSendError({
        message: 'send failed',
        retryable: false,
      });
      expect(error.name).toBe('EmailSendError');
      expect(error.code).toBe('EMAIL_SEND_FAILED');
      expect(error.message).toBe('send failed');
      expect(error.retryable).toBe(false);
    });
  });
});

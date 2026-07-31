import { DomainError } from '@church/core';
import { describe, expect, it } from 'vitest';
import {
  DuplicateSlotsError,
  EmptyScheduleError,
  InvalidStateTransitionError,
  PublishValidationError,
} from '../../src/domain/assignment/errors';
import { EmailSendError } from '../../src/domain/errors/email-send-error';
import { InvalidDateRangeError } from '../../src/domain/errors/invalid-date-range';
import { InvalidRequiredCountError } from '../../src/domain/errors/invalid-required-count';
import { IsolationBreachError } from '../../src/domain/errors/isolation-breach-error';
import { MissingOutboxDeliveryRecordError } from '../../src/domain/errors/missing-outbox-delivery-record';

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

  describe('DuplicateSlotsError', () => {
    it('inherits from DomainError and Error', () => {
      const error = new DuplicateSlotsError();
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    });

    it('has the correct name and message', () => {
      const error = new DuplicateSlotsError();
      expect(error.name).toBe('DuplicateSlotsError');
      expect(error.message).toBe(
        'Event already has existing slots. Delete them before regenerating.',
      );
    });
  });

  describe('EmptyScheduleError', () => {
    it('inherits from DomainError and Error', () => {
      const error = new EmptyScheduleError();
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    });

    it('has the correct name and message', () => {
      const error = new EmptyScheduleError();
      expect(error.name).toBe('EmptyScheduleError');
      expect(error.message).toBe('Cannot publish an event with no assignments');
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

  describe('InvalidStateTransitionError', () => {
    it('inherits from DomainError and Error', () => {
      const error = new InvalidStateTransitionError('draft', 'cancel');
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    });

    it('stores status and action and formats the message', () => {
      const error = new InvalidStateTransitionError('draft', 'cancel');
      expect(error.name).toBe('InvalidStateTransitionError');
      expect(error.currentStatus).toBe('draft');
      expect(error.attemptedAction).toBe('cancel');
      expect(error.message).toBe("Cannot cancel: event is in 'draft' status");
    });
  });

  describe('PublishValidationError', () => {
    it('inherits from DomainError and Error', () => {
      const error = new PublishValidationError([]);
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
    });

    it('stores failures and formats the message', () => {
      const failures = [
        {
          assignmentId: 'a-1',
          volunteerId: 'v-1',
          reason: 'NOT_QUALIFIED' as const,
          message: 'Volunteer is not qualified',
        },
        {
          assignmentId: 'a-2',
          volunteerId: 'v-2',
          reason: 'DUPLICATE_ASSIGNMENT' as const,
          message: 'Volunteer has a conflict',
        },
      ];
      const error = new PublishValidationError(failures);
      expect(error.name).toBe('PublishValidationError');
      expect(error.failures).toEqual(failures);
      expect(error.message).toBe(
        'Cannot publish: 2 assignment(s) fail hard constraints',
      );
    });
  });
});

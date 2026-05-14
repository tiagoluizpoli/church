import { DomainError } from '@church/core';
import { describe, expect, it } from 'vitest';
import { InvalidDateRangeError } from '../../src/domain/errors/invalid-date-range';
import { InvalidRequiredCountError } from '../../src/domain/errors/invalid-required-count';

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
});

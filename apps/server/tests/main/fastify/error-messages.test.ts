import { describe, expect, it } from 'vitest';
import {
  DuplicateHeadcountError,
  VALIDATION_REASONS,
} from '@/domain/errors/duplicate-headcount';
import { ERROR_MAP } from '@/main/fastify/error-map';
import {
  domainErrorMessage,
  ERROR_MESSAGES,
  VALIDATION_REASON_MESSAGES,
} from '@/main/fastify/error-messages';

// Codes thrown by the domain that never become an HTTP response.
const NEVER_HTTP = [
  'CHURCH_SLUG_TAKEN',
  'CROSS_CHURCH_VOLUNTEER_CONFLICT',
  'EMAIL_SEND_FAILED',
  'MISSING_OUTBOX_DELIVERY_RECORD',
  'VERIFICATION_CODE_ATTEMPT_LIMIT_REACHED',
  'VERIFICATION_CODE_CONSUMED',
  'VERIFICATION_CODE_EXPIRED',
  'VERIFICATION_CODE_INVALID',
  'VERIFICATION_CODE_NOT_FOUND',
  'VERIFICATION_CODE_RESEND_COOLDOWN_ACTIVE',
  'PENDING_MINISTRY_INVITATION_NOT_FOUND',
];

describe('error catalog coverage', () => {
  it.each(
    Object.keys(ERROR_MAP),
  )('%s has a message in both locales', (code) => {
    const message = ERROR_MESSAGES[code];
    expect(message).toBeDefined();
    expect(message?.({}, { locale: 'en' })).not.toBe('');
    expect(message?.({}, { locale: 'pt-BR' })).not.toBe('');
  });

  it.each(VALIDATION_REASONS)('reason %s has a message', (reason) => {
    expect(VALIDATION_REASON_MESSAGES[reason]).toBeDefined();
  });

  it('never-HTTP codes are not mapped to a status', () => {
    for (const code of NEVER_HTTP) expect(ERROR_MAP[code]).toBeUndefined();
  });
});

describe('domainErrorMessage', () => {
  it('keys a validation error on its reason', () => {
    const message = domainErrorMessage({
      error: new DuplicateHeadcountError(),
      locale: 'pt-BR',
    });
    expect(message).toContain('Cada setor e função');
  });
});

import { describe, expect, it } from 'vitest';
import {
  domainErrorMessage,
  VALIDATION_REASON_MESSAGES,
} from '@/api/utils/error-messages';
import { ERROR_TABLE, errorStatus } from '@/api/utils/error-table';
import { DuplicateHeadcountError } from '@/domain/errors/duplicate-headcount';
import { DuplicateTemplateBlockLabelError } from '@/domain/errors/duplicate-template-block-label';
import { DuplicateTemplateNameError } from '@/domain/errors/duplicate-template-name';
import { VALIDATION_REASONS } from '@/domain/errors/validation-rule-error';

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

describe('error table coverage', () => {
  it.each(
    Object.entries(ERROR_TABLE),
  )('%s has a status and a message in both locales', (_code, entry) => {
    expect(entry.status).toBeGreaterThanOrEqual(400);
    expect(entry.message({}, { locale: 'en' })).not.toBe('');
    expect(entry.message({}, { locale: 'pt-BR' })).not.toBe('');
  });

  it.each(VALIDATION_REASONS)('reason %s has a message', (reason) => {
    expect(VALIDATION_REASON_MESSAGES[reason]).toBeDefined();
  });

  it('never-HTTP codes have no entry', () => {
    for (const code of NEVER_HTTP)
      expect(errorStatus({ code })).toBeUndefined();
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

describe('Event template validation reasons', () => {
  it.each([
    [new DuplicateTemplateNameError(), 'en', 'already has this name'],
    [new DuplicateTemplateNameError(), 'pt-BR', 'com este nome'],
    [new DuplicateTemplateBlockLabelError(), 'en', 'same label'],
    [new DuplicateTemplateBlockLabelError(), 'pt-BR', 'mesmo rótulo'],
  ] as const)('words %s in %s', (error, locale, fragment) => {
    expect(domainErrorMessage({ error, locale })).toContain(fragment);
  });
});

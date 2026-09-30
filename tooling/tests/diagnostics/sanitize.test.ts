import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { knownSecretsOf, sanitize } from '../../diagnostics/sanitize';

/**
 * Sanitizes text outside any repository, so only the process environment
 * can supply known secrets, as on a CI runner.
 */

const INVITATION_ID = '8b0e7f0c-5d3a-4c61-9b7e-2f1a6c9d4e13';
const USER_ID = '1f4a2b3c-9d8e-4f7a-8b6c-5d4e3f2a1b0c';

let outsideRepository: string;

beforeEach(() => {
  outsideRepository = mkdtempSync(join(tmpdir(), 'church-sanitize-'));
});

afterEach(() => {
  rmSync(outsideRepository, { recursive: true, force: true });
});

interface SanitizeEnvInput {
  text: string;
  env: NodeJS.ProcessEnv;
}

function sanitizeWith(input: SanitizeEnvInput): string {
  return sanitize({
    text: input.text,
    secrets: knownSecretsOf({ cwd: outsideRepository, env: input.env }),
  });
}

describe('sanitize', () => {
  it('redacts sensitive values that only the process environment holds', () => {
    const text = sanitizeWith({
      text: [
        'auth secret ci-test-secret-key-minimum-32-characters-long in use',
        'unleash token ci-unleash-token-77 rejected',
        'connecting to church_unspecified_e2e on port 543210',
      ].join('\n'),
      env: {
        BETTER_AUTH_SECRET: 'ci-test-secret-key-minimum-32-characters-long',
        UNLEASH_API_TOKEN: 'ci-unleash-token-77',
        PGPORT: '543210',
        PGDATABASE: 'church_unspecified_e2e',
      },
    });

    expect(text).not.toContain('ci-test-secret-key');
    expect(text).not.toContain('ci-unleash-token-77');
    expect(text).toContain('church_unspecified_e2e on port 543210');
  });

  it('redacts invitation identifiers but keeps other identifiers', () => {
    const text = sanitizeWith({
      text: [
        `page.goto: http://localhost:4101/invitations/ministry/${INVITATION_ID}`,
        `{"invitationId":"${INVITATION_ID}","userId":"${USER_ID}"}`,
        `{\\"churchInvitationId\\":\\"${INVITATION_ID}\\"}`,
        `Invitation: ${INVITATION_ID}`,
        `invitationId=${INVITATION_ID} user ${USER_ID}`,
      ].join('\n'),
      env: {},
    });

    expect(text).not.toContain(INVITATION_ID);
    expect(text).toContain(USER_ID);
    expect(text).toContain('http://localhost:4101/invitations/ministry/');
  });
});

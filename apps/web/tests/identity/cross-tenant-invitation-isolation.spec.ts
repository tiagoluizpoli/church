import { expect, test } from '@playwright/test';
import { requiredE2eUrl } from '../fixtures/e2e-urls';
import {
  type CrossTenantInvitationJourney,
  loadCrossTenantInvitationJourney,
} from '../fixtures/journeys/cross-tenant-invitation';
import { mintMinistryInvitationAs } from '../fixtures/journeys/identity-actions';
import { newPersonaRequest } from '../fixtures/journeys/rostering-church';

// #68 — extends DL4-X1's cross-tenant isolation shape
// (scheduling/planning-cross-tenant-isolation.spec.ts) to the identity
// surface: a Church A administrator hitting Church B's Ministry Invitation
// admin endpoints directly, using known-valid Church B identifiers, must
// see the same indistinguishable not-found that
// `DbMinistryInvitationManager.ensureMintableScope` deliberately returns
// for a nonexistent, unauthorized, *or* cross-Church Ministry — never a
// peek at Church B's real Ministry name. Both Churches, their admins and
// the invited emails are the journey's own graph (`cross-tenant-invitation`
// recipe); Church B's invitation is minted through the product.
const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });

interface NotFoundBody {
  error: string;
  message: string;
}

interface AssertNoChurchBLeakInput {
  journey: CrossTenantInvitationJourney;
  body: unknown;
}

/** The real Church B values a leak would surface on the wire — never invented ids, the journey's actual ones. */
function assertNoChurchBLeak({
  journey,
  body,
}: AssertNoChurchBLeakInput): void {
  const { church, ministries } = journey.churchB;
  const raw = JSON.stringify(body);
  expect(raw).not.toContain(ministries.worship.name);
  expect(raw).not.toContain(ministries.worship.id);
  expect(raw).not.toContain(church.name);
  expect(raw).not.toContain(church.slug);
}

test.describe('#68 — cross-tenant isolation of the identity surface', () => {
  test('a Church A admin minting a Ministry Invitation against a known-valid Church B Ministry id gets not-found', async ({
    browserName: _browserName,
  }, testInfo) => {
    const journey = loadCrossTenantInvitationJourney({ testInfo });
    const churchACtx = await newPersonaRequest({
      persona: journey.churchA.personas.admin,
    });
    try {
      const res = await churchACtx.post(
        `${SERVER_URL}/api/v1/ministries/${journey.churchB.ministries.worship.id}/invitations`,
        {
          data: {
            email: journey.emails.probe,
            ministryAccessLevel: 'volunteer',
            roleIds: [],
          },
        },
      );

      expect(res.status()).toBe(404);
      const body = (await res.json()) as NotFoundBody;
      expect(body.error).toBe('MINISTRY_NOT_FOUND');
      assertNoChurchBLeak({ journey, body });
    } finally {
      await churchACtx.dispose();
    }
  });

  test('a Church A admin resending a genuinely-valid Church B Ministry Invitation id gets not-found', async ({
    browserName: _browserName,
  }, testInfo) => {
    const journey = loadCrossTenantInvitationJourney({ testInfo });
    const churchBMinistryId = journey.churchB.ministries.worship.id;

    // Mint a real, currently-pending Ministry Invitation as Church B's own
    // admin first — a known-valid identifier the resend probe below could
    // never have guessed, not an invented one.
    const invitation = await mintMinistryInvitationAs({
      persona: journey.churchB.personas.admin,
      ministryId: churchBMinistryId,
      email: journey.emails.target,
      roleIds: [],
    });

    const churchACtx = await newPersonaRequest({
      persona: journey.churchA.personas.admin,
    });
    try {
      const res = await churchACtx.post(
        `${SERVER_URL}/api/v1/ministries/${churchBMinistryId}/invitations/${invitation.id}/resend`,
      );

      expect(res.status()).toBe(404);
      const body = (await res.json()) as NotFoundBody;
      expect(body.error).toBe('MINISTRY_NOT_FOUND');
      assertNoChurchBLeak({ journey, body });
    } finally {
      await churchACtx.dispose();
    }
  });
});

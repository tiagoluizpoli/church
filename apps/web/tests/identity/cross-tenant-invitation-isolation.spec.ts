import { expect, request, test } from '@playwright/test';
import {
  CHURCH_ADMIN_STORAGE_STATE,
  CHURCH_B_ADMIN_STORAGE_STATE,
} from '../global-setup';

// #68 — extends DL4-X1's cross-tenant isolation shape
// (scheduling/planning-cross-tenant-isolation.spec.ts) to the identity
// surface: a Church A administrator hitting Church B's Ministry Invitation
// admin endpoints directly, using known-valid Church B identifiers, must
// see the same indistinguishable not-found that
// `DbMinistryInvitationManager.ensureMintableScope` deliberately returns
// for a nonexistent, unauthorized, *or* cross-Church Ministry — never a
// peek at Church B's real Ministry name.
const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';

// Fixed E2E seed identifiers (apps/server/src/test-support/e2e-seed.ts
// E2E_IDS.churchBMinistry / CHURCH_B_MINISTRY_NAME) — same convention as
// the other identity/scheduling specs: the web package stays DB-tooling-
// free, so this spec references the well-known values directly.
const CHURCH_B_MINISTRY_ID = 'e2ebbbbb-3333-3333-3333-333333333331';
const CHURCH_B_MINISTRY_NAME = 'E2E ChurchB Ministry';
const CHURCH_B_NAME = 'E2E ChurchB';
const CHURCH_B_SLUG = 'e2e-church-b';

interface MintedInvitation {
  id: string;
}

interface NotFoundBody {
  error: string;
  message: string;
}

interface AssertNoChurchBLeakInput {
  body: unknown;
}

/** The real Church B values a leak would surface on the wire — never invented ids, the fixture's actual ones. */
function assertNoChurchBLeak({ body }: AssertNoChurchBLeakInput): void {
  const raw = JSON.stringify(body);
  expect(raw).not.toContain(CHURCH_B_MINISTRY_NAME);
  expect(raw).not.toContain(CHURCH_B_MINISTRY_ID);
  expect(raw).not.toContain(CHURCH_B_NAME);
  expect(raw).not.toContain(CHURCH_B_SLUG);
}

test.describe('#68 — cross-tenant isolation of the identity surface', () => {
  test.use({ storageState: CHURCH_ADMIN_STORAGE_STATE });

  test('a Church A admin minting a Ministry Invitation against a known-valid Church B Ministry id gets not-found', async ({
    page,
  }) => {
    const res = await page.request.post(
      `${SERVER_URL}/api/v1/admin/ministries/${CHURCH_B_MINISTRY_ID}/invitations`,
      {
        data: {
          email: 'e2e-cross-tenant-probe@test.com',
          ministryAccessLevel: 'volunteer',
          roleIds: [],
        },
      },
    );

    expect(res.status()).toBe(404);
    const body = (await res.json()) as NotFoundBody;
    expect(body.error).toBe('MINISTRY_NOT_FOUND');
    assertNoChurchBLeak({ body });
  });

  test('a Church A admin resending a genuinely-valid Church B Ministry Invitation id gets not-found', async ({
    page,
  }) => {
    // Mint a real, currently-pending Ministry Invitation as Church B's own
    // admin first — a known-valid identifier the resend probe below could
    // never have guessed, not an invented one.
    const churchBCtx = await request.newContext({
      baseURL: SERVER_URL,
      storageState: CHURCH_B_ADMIN_STORAGE_STATE,
    });
    const mintRes = await churchBCtx.post(
      `/api/v1/admin/ministries/${CHURCH_B_MINISTRY_ID}/invitations`,
      {
        data: {
          email: 'e2e-cross-tenant-target@test.com',
          ministryAccessLevel: 'volunteer',
          roleIds: [],
        },
      },
    );
    if (!mintRes.ok()) {
      throw new Error(
        `Failed to mint a real Church B invitation (${mintRes.status()}): ${await mintRes.text()}`,
      );
    }
    const invitation = (await mintRes.json()) as MintedInvitation;
    await churchBCtx.dispose();

    const res = await page.request.post(
      `${SERVER_URL}/api/v1/admin/ministries/${CHURCH_B_MINISTRY_ID}/invitations/${invitation.id}/resend`,
    );

    expect(res.status()).toBe(404);
    const body = (await res.json()) as NotFoundBody;
    expect(body.error).toBe('MINISTRY_NOT_FOUND');
    assertNoChurchBLeak({ body });
  });
});

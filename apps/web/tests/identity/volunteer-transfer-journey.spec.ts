import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Page,
  request,
  test,
} from '@playwright/test';
import {
  CHURCH_ADMIN_STORAGE_STATE,
  CHURCH_B_ADMIN_STORAGE_STATE,
} from '../global-setup';

// #65 — proves the hardest identity journey end to end: a User who is a
// member of both Churches and an active Volunteer in the second (Church B)
// redeems a Ministry Invitation from the first (Church A), receives the
// cross-Church split, walks all three Volunteer Transfer confirmation layers
// (spec §8.7 — move, review the real impact, re-authenticate + type the
// destination Church name), and ends up an active Volunteer of Church A with
// Church B's roster showing the vacated seat.
const SERVER_URL = process.env.VITE_SERVER_URL ?? 'http://localhost:4000';
const WEB_URL = process.env.PW_WEB_URL ?? 'http://localhost:4101';
const dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(dirname, '../../../server');

// Fixed E2E seed identifiers (apps/server/src/test-support/e2e-seed.ts
// E2E_IDS) — same convention as the other identity specs.
const CHURCH_A_ID = 'e2e11111-1111-1111-1111-111111111111';
const CHURCH_A_NAME = 'E2E Church';
const CHURCH_A_MINISTRY_ID = 'e2e33333-3333-3333-3333-333333333331';
const CHURCH_A_ROLE_USHER_ID = 'e2e55555-5555-5555-5555-555555555551';

const CHURCH_B_ID = 'e2ebbbbb-1111-1111-1111-111111111111';
const CHURCH_B_NAME = 'E2E ChurchB';
const CHURCH_B_MINISTRY_ID = 'e2ebbbbb-3333-3333-3333-333333333331';
const CHURCH_B_MINISTRY_NAME = 'E2E ChurchB Ministry';
const CHURCH_B_ROLE_USHER_ID = 'e2ebbbbb-5555-5555-5555-555555555551';

const PASSWORD = 'correct-horse-battery-staple';

interface InviteChurchMemberResponse {
  id: string;
}

interface MintedMinistryInvitation {
  id: string;
  kind: 'ministry-only' | 'chained';
  redemptionPath: string;
}

interface AssertOkInput {
  res: APIResponse;
  action: string;
}

/** Fails loudly on a non-2xx response instead of surfacing a confusing downstream error. */
async function assertOk({ res, action }: AssertOkInput): Promise<void> {
  if (res.ok()) return;
  throw new Error(`Failed to ${action} (${res.status()}): ${await res.text()}`);
}

interface NewAdminContextInput {
  storageState: string;
}

function newAdminContext({
  storageState,
}: NewAdminContextInput): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: SERVER_URL,
    storageState,
    // Better Auth's organization endpoints run an origin-check middleware
    // that `request.newContext` never satisfies on its own (unlike a real
    // browser navigation) — trust the same web origin the server's CORS
    // config trusts for this e2e run (playwright.config.ts's `PW_WEB_URL`).
    extraHTTPHeaders: { Origin: WEB_URL },
  });
}

interface RedeemChurchInvitationInput {
  email: string;
  name: string;
  invitationId: string;
}

/**
 * E2E-only stand-in for the still-unbuilt public Church-only redemption
 * journey (#62) — same script every identity spec shells out to. Signs up
 * on the first call and, since the User already exists, signs in and
 * accepts on every call after (this spec redeems two Church Invitations —
 * Church B's then Church A's — for the same dual-membership email).
 */
function redeemChurchInvitation({
  email,
  name,
  invitationId,
}: RedeemChurchInvitationInput): void {
  execFileSync(
    'bun',
    [
      '--env-file=../../.env',
      'run',
      'src/scripts/e2e-redeem-church-invitation.ts',
      email,
      name,
      PASSWORD,
      invitationId,
    ],
    { cwd: SERVER_DIR },
  );
}

interface InviteChurchMemberInput {
  ctx: APIRequestContext;
  email: string;
  organizationId: string;
  role: 'member' | 'admin';
}

async function inviteChurchMember({
  ctx,
  email,
  organizationId,
  role,
}: InviteChurchMemberInput): Promise<string> {
  const res = await ctx.post('/api/auth/organization/invite-member', {
    data: { email, role, organizationId },
  });
  await assertOk({ res, action: `invite ${email} to ${organizationId}` });
  return ((await res.json()) as InviteChurchMemberResponse).id;
}

interface MintMinistryInvitationInput {
  ctx: APIRequestContext;
  ministryId: string;
  email: string;
  roleIds: string[];
}

async function mintMinistryInvitation({
  ctx,
  ministryId,
  email,
  roleIds,
}: MintMinistryInvitationInput): Promise<MintedMinistryInvitation> {
  const res = await ctx.post(
    `/api/v1/admin/ministries/${ministryId}/invitations`,
    { data: { email, ministryAccessLevel: 'volunteer', roleIds } },
  );
  await assertOk({ res, action: `mint a Ministry invitation for ${email}` });
  return (await res.json()) as MintedMinistryInvitation;
}

interface ChurchBSeatInput {
  churchBAdminCtx: APIRequestContext;
}

interface ChurchBSeat {
  cycleId: string;
  eventTitle: string;
  shiftId: string;
}

interface CreatedResourceResponse {
  id: string;
}

interface CycleBuilderEvent {
  id: string;
  title: string;
}

interface CycleBuilderParticipation {
  id: string;
}

interface CycleBuilderShift {
  id: string;
}

interface CycleBuilderShiftView {
  shift: CycleBuilderShift;
}

interface CycleBuilderSlot {
  id: string;
}

interface CycleBuilderSlotView {
  slot: CycleBuilderSlot;
  shifts: CycleBuilderShiftView[];
}

interface CycleBuilderEventView {
  event: CycleBuilderEvent;
  participation: CycleBuilderParticipation;
  slots: CycleBuilderSlotView[];
}

interface CycleBuilderResponse {
  events: CycleBuilderEventView[];
}

interface FindShiftIdInput {
  builder: CycleBuilderResponse;
  eventId: string;
  slotId: string;
}

/** Digs out the Shift auto-created for `slotId` by the inclusion write above. */
function findShiftId({
  builder,
  eventId,
  slotId,
}: FindShiftIdInput): string | undefined {
  const eventView = builder.events.find(
    (candidate) => candidate.event.id === eventId,
  );
  const slotView = eventView?.slots.find(
    (candidate) => candidate.slot.id === slotId,
  );
  return slotView?.shifts[0]?.shift.id;
}

/**
 * A real assignable seat in Church B's Ministry: its own PlanningCycle
 * (Church B's shared fixture cycle is already locked — a manually-created
 * Event in a locked cycle is born `scheduled` and its TimeSlots are
 * immutable, so a fresh draft cycle is the only way to attach one), one
 * Event, one TimeSlot (which auto-seeds a matching Shift on inclusion, spec
 * R017), and one SlotRequirement for the Usher Role — everything the
 * volunteer-transfer repository's future-assignment query (issue #65) needs
 * to actually have something to withdraw. Nothing here depends on the cycle
 * ever being locked (the builder/rostering endpoints don't gate on it), so
 * it stays in draft. Church B's shared fixture is otherwise deliberately
 * minimal (e2e-seed.ts), so this spec builds its own cycle rather than
 * growing it further.
 */
async function makeChurchBAssignableSeat({
  churchBAdminCtx,
}: ChurchBSeatInput): Promise<ChurchBSeat> {
  const eventTitle = `E2E ChurchB Transfer Service ${Date.now()}`;
  const startDate = '2027-03-10T09:00:00.000Z';
  const endDate = '2027-03-10T11:00:00.000Z';

  const cycleRes = await churchBAdminCtx.post('/api/v1/admin/planning-cycles', {
    data: {
      name: `E2E ChurchB Transfer Cycle ${Date.now()}`,
      startDate: '2027-03-01',
      endDate: '2027-04-01',
    },
  });
  await assertOk({ res: cycleRes, action: 'create Church B planning cycle' });
  const { id: cycleId } = (await cycleRes.json()) as CreatedResourceResponse;

  const eventRes = await churchBAdminCtx.post(
    `/api/v1/admin/planning-cycles/${cycleId}/events`,
    { data: { title: eventTitle, startDate, endDate, eventType: 'hourly' } },
  );
  await assertOk({ res: eventRes, action: 'create Church B event' });
  const { id: eventId } = (await eventRes.json()) as CreatedResourceResponse;

  const slotRes = await churchBAdminCtx.post(
    `/api/v1/admin/planning-cycles/${cycleId}/events/${eventId}/slots`,
    { data: { startTime: startDate, endTime: endDate, label: 'Service' } },
  );
  await assertOk({ res: slotRes, action: 'create Church B time slot' });
  const { id: slotId } = (await slotRes.json()) as CreatedResourceResponse;

  // getCycleBuilderData auto-creates the (tailoring-state) MinistryParticipation
  // for this event the first time it is read — there is no separate "create
  // participation" endpoint (data-model.md, 023-event-builder).
  const builderRes = await churchBAdminCtx.get(
    `/api/v1/leader/cycles/${cycleId}/builder?ministryId=${CHURCH_B_MINISTRY_ID}`,
  );
  await assertOk({ res: builderRes, action: 'read Church B cycle builder' });
  const builderBefore = (await builderRes.json()) as CycleBuilderResponse;
  const eventView = builderBefore.events.find(
    (candidate) => candidate.event.id === eventId,
  );
  if (!eventView)
    throw new Error('Church B event missing from the builder read.');

  const inclusionRes = await churchBAdminCtx.put(
    `/api/v1/leader/participations/${eventView.participation.id}/inclusions`,
    { data: { timeSlotIds: [slotId] } },
  );
  await assertOk({ res: inclusionRes, action: 'include Church B time slot' });

  const builderAfterRes = await churchBAdminCtx.get(
    `/api/v1/leader/cycles/${cycleId}/builder?ministryId=${CHURCH_B_MINISTRY_ID}`,
  );
  await assertOk({
    res: builderAfterRes,
    action: 're-read Church B cycle builder',
  });
  const builderAfter = (await builderAfterRes.json()) as CycleBuilderResponse;
  const shiftId = findShiftId({ builder: builderAfter, eventId, slotId });
  if (!shiftId) throw new Error('Church B shift was not auto-created.');

  const requirementRes = await churchBAdminCtx.put(
    `/api/v1/leader/shifts/${shiftId}/requirements`,
    { data: { roleId: CHURCH_B_ROLE_USHER_ID, requiredCount: 1 } },
  );
  await assertOk({ res: requirementRes, action: 'set Church B requirement' });

  return { cycleId, eventTitle, shiftId };
}

interface BootstrapDualMemberInput {
  email: string;
  name: string;
  churchBShiftId: string;
}

interface DualMemberBootstrapResult {
  churchBVolunteerId: string;
}

interface AcceptMinistryInvitationApiOutcome {
  kind: string;
  volunteerId?: string;
}

/**
 * The dual-membership fixture identity issue #65 needs: a genuine active
 * Volunteer of Church B (Church Membership + Ministry Membership + a real,
 * future Assignment on the seat above), plus a plain Church Membership in
 * Church A — everything except the actual Church A Ministry Invitation
 * redemption, which is the browser-driven part of this journey.
 */
async function bootstrapDualMember({
  email,
  name,
  churchBShiftId,
}: BootstrapDualMemberInput): Promise<DualMemberBootstrapResult> {
  const churchBAdminCtx = await newAdminContext({
    storageState: CHURCH_B_ADMIN_STORAGE_STATE,
  });
  const churchBInvitationId = await inviteChurchMember({
    ctx: churchBAdminCtx,
    email,
    organizationId: CHURCH_B_ID,
    role: 'member',
  });
  redeemChurchInvitation({
    email,
    name,
    invitationId: churchBInvitationId,
  });

  const churchBMinistryInvitation = await mintMinistryInvitation({
    ctx: churchBAdminCtx,
    ministryId: CHURCH_B_MINISTRY_ID,
    email,
    roleIds: [CHURCH_B_ROLE_USHER_ID],
  });
  expect(churchBMinistryInvitation.kind).toBe('ministry-only');

  const userCtx = await request.newContext({ baseURL: SERVER_URL });
  const signInRes = await userCtx.post('/api/auth/sign-in/email', {
    data: { email, password: PASSWORD },
  });
  await assertOk({ res: signInRes, action: 'sign in dual member' });
  const acceptRes = await userCtx.post(
    `/api/v1/redemption/ministry/${churchBMinistryInvitation.id}/accept`,
    { data: { idempotencyKey: randomUUID() } },
  );
  await assertOk({
    res: acceptRes,
    action: 'accept Church B Ministry invitation',
  });
  const acceptOutcome =
    (await acceptRes.json()) as AcceptMinistryInvitationApiOutcome;
  expect(acceptOutcome.kind).toBe('full-success');
  const churchBVolunteerId = acceptOutcome.volunteerId;
  if (!churchBVolunteerId) {
    throw new Error('Church B Ministry acceptance returned no volunteerId.');
  }

  const assignmentRes = await churchBAdminCtx.post(
    `/api/v1/leader/shifts/${churchBShiftId}/assignments`,
    {
      data: { volunteerId: churchBVolunteerId, roleId: CHURCH_B_ROLE_USHER_ID },
    },
  );
  await assertOk({
    res: assignmentRes,
    action: 'assign the dual member in Church B',
  });

  // Church Membership in Church A too (spec's "member of both Churches") —
  // the Ministry Invitation this spec redeems in the browser is minted
  // separately, once this membership makes it a plain "ministry-only" one.
  const churchAAdminCtx = await newAdminContext({
    storageState: CHURCH_ADMIN_STORAGE_STATE,
  });
  const churchAInvitationId = await inviteChurchMember({
    ctx: churchAAdminCtx,
    email,
    organizationId: CHURCH_A_ID,
    role: 'member',
  });
  redeemChurchInvitation({
    email,
    name,
    invitationId: churchAInvitationId,
  });

  await userCtx.dispose();
  await churchBAdminCtx.dispose();
  await churchAAdminCtx.dispose();

  return { churchBVolunteerId };
}

function uniqueDualMemberEmail(): string {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `e2e-transfer-dual-member-${suffix}@test.com`;
}

interface SignInInput {
  email: string;
}

/** `/login` renders the sign-in view only (#62) — no toggle to reach it. */
async function signIn(page: Page, { email }: SignInInput): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

interface AcceptMinistryInvitationOutcome {
  kind: string;
  sourceChurchName?: string;
  destinationChurchName?: string;
}

interface ConfirmTransferOutcome {
  kind: string;
  destinationVolunteerId?: string;
}

interface MinistryOption {
  id: string;
}

interface VolunteerDashboardMinistryOptions {
  ministryOptions: MinistryOption[];
}

test.describe('#65 — a Volunteer transfers between Churches', () => {
  test('a dual-membership User redeems a Church A invitation, splits, walks all three confirmation layers, and Church B is left with the vacated seat', async ({
    browser,
    page,
  }) => {
    const email = uniqueDualMemberEmail();
    const name = 'E2E Transfer Dual Member';

    const churchBSetupCtx = await newAdminContext({
      storageState: CHURCH_B_ADMIN_STORAGE_STATE,
    });
    const seat = await makeChurchBAssignableSeat({
      churchBAdminCtx: churchBSetupCtx,
    });
    await churchBSetupCtx.dispose();

    await bootstrapDualMember({ email, name, churchBShiftId: seat.shiftId });

    const churchAAdminCtx = await newAdminContext({
      storageState: CHURCH_ADMIN_STORAGE_STATE,
    });
    const churchAMinistryInvitation = await mintMinistryInvitation({
      ctx: churchAAdminCtx,
      ministryId: CHURCH_A_MINISTRY_ID,
      email,
      roleIds: [CHURCH_A_ROLE_USHER_ID],
    });
    expect(churchAMinistryInvitation.kind).toBe('ministry-only');
    await churchAAdminCtx.dispose();

    // The browser-driven journey starts here — everything above is fixture
    // setup indistinguishable from what a real dual-membership Volunteer's
    // history would already look like.
    await page.goto(churchAMinistryInvitation.redemptionPath);
    await expect(page).toHaveURL(/\/login(\?.*)?$/);
    await signIn(page, { email });
    await expect(page).toHaveURL(
      new RegExp(`/invitations/ministry/${churchAMinistryInvitation.id}$`),
    );
    await expect(
      page.getByRole('heading', { name: /Join E2E Worship/ }),
    ).toBeVisible();

    const [acceptResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response
          .url()
          .endsWith(
            `/redemption/ministry/${churchAMinistryInvitation.id}/accept`,
          ),
      ),
      page.getByRole('button', { name: 'Accept' }).click(),
    ]);
    const acceptOutcome =
      (await acceptResponse.json()) as AcceptMinistryInvitationOutcome;
    expect(acceptOutcome.kind).toBe('church-only');
    expect(acceptOutcome.sourceChurchName).toBe(CHURCH_B_NAME);
    expect(acceptOutcome.destinationChurchName).toBe(CHURCH_A_NAME);

    // AC — the split result names both Churches and offers the transfer.
    await expect(
      page.getByRole('heading', {
        name: `You're a member of ${CHURCH_A_NAME}`,
      }),
    ).toBeVisible();
    // `destinationChurchName` (Church A) also renders inside a <strong> on
    // this screen, but only Church B's real name is the *source* — scoping
    // to the one <strong> that names it (rather than a bare substring match
    // across the whole panel) keeps this from passing against a mislabeled
    // split.
    await expect(
      page.locator('strong', { hasText: CHURCH_B_NAME }),
    ).toBeVisible();
    const moveButton = page.getByRole('button', {
      name: 'Move my Volunteer profile',
    });
    await expect(moveButton).toBeVisible();
    await expect(
      page.getByRole('button', {
        name: `Continue to ${CHURCH_A_NAME} as a member`,
      }),
    ).toBeVisible();

    // Layer 1 — choose the move.
    await moveButton.click();

    // Layer 2 — review the *actual* affected memberships and assignments.
    await expect(
      page.getByRole('heading', { name: 'Review the move' }),
    ).toBeVisible();
    await expect(page.getByText(CHURCH_B_MINISTRY_NAME)).toBeVisible();
    await expect(page.getByText(seat.eventTitle)).toBeVisible();
    await expect(page.getByText('E2E ChurchB Usher')).toBeVisible();
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Layer 3 — re-authenticate and type the destination Church name.
    await expect(
      page.getByRole('heading', { name: 'Confirm Volunteer Transfer' }),
    ).toBeVisible();
    await page.getByLabel('Password').fill(PASSWORD);
    await page
      .getByLabel(new RegExp(`Type ${CHURCH_A_NAME} to confirm`))
      .fill(CHURCH_A_NAME);

    const [confirmResponse] = await Promise.all([
      page.waitForResponse((response) =>
        response
          .url()
          .endsWith(
            `/redemption/transfer/${churchAMinistryInvitation.id}/confirm`,
          ),
      ),
      page.getByRole('button', { name: 'Confirm Volunteer Transfer' }).click(),
    ]);
    const confirmOutcome =
      (await confirmResponse.json()) as ConfirmTransferOutcome;
    expect(confirmOutcome.kind).toBe('transferred');
    expect(confirmOutcome.destinationVolunteerId).toEqual(expect.any(String));

    await expect(page).toHaveURL(/\/dashboard(\?.*)?$/);

    // The transferred User is now an active Volunteer of Church A.
    const selectRes = await page.request.post(
      `${SERVER_URL}/api/v1/active-church/select`,
      { data: { churchId: CHURCH_A_ID } },
    );
    await assertOk({ res: selectRes, action: 'select Church A as active' });
    const dashboardRes = await page.request.get(
      `${SERVER_URL}/api/v1/volunteer/dashboard`,
    );
    const { ministryOptions } =
      (await dashboardRes.json()) as VolunteerDashboardMinistryOptions;
    expect(ministryOptions.map((option) => option.id)).toContain(
      CHURCH_A_MINISTRY_ID,
    );

    // AC — Church B's roster visibly shows the hole where the transferred
    // Volunteer used to be: no assignment chip, the requirement back to 0/1.
    const churchBAdminContext = await browser.newContext({
      storageState: CHURCH_B_ADMIN_STORAGE_STATE,
    });
    const churchBAdminPage = await churchBAdminContext.newPage();
    await churchBAdminPage.goto(
      `/scheduling/rostering/${CHURCH_B_MINISTRY_ID}/${seat.cycleId}`,
    );
    await expect(churchBAdminPage.getByTestId('cycle-builder')).toBeVisible({
      timeout: 15_000,
    });
    const requirement = churchBAdminPage.getByTestId(
      `cycle-requirement-${seat.shiftId}-${CHURCH_B_ROLE_USHER_ID}`,
    );
    await expect(requirement).toContainText('0/1');
    await expect(requirement.getByTestId('assignment-chip')).toHaveCount(0);
    await churchBAdminContext.close();
  });
});

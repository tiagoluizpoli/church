import { expect, test } from '@playwright/test';
import {
  type AcceptMinistryInvitationOutcome,
  fetchActiveChurchStatus,
  fetchVolunteerMinistryOptions,
  mintMinistryInvitationAs,
  signIn,
} from '../fixtures/journeys/identity-actions';
import {
  newPersonaContext,
  requirementCellTestId,
  rosteringBuilderPath,
} from '../fixtures/journeys/rostering-church';
import { loadVolunteerTransferJourney } from '../fixtures/journeys/volunteer-transfer';

// #65 — proves the hardest identity journey end to end: a User who is a
// member of both Churches and an active Volunteer in the second (Church B)
// redeems a Ministry Invitation from the first (Church A), receives the
// cross-Church split, walks all three Volunteer Transfer confirmation layers
// (spec §8.7 — move, review the real impact, re-authenticate + type the
// destination Church name), and ends up an active Volunteer of Church A with
// Church B's roster showing the vacated seat.
//
// The journey owns both Churches (the `volunteer-transfer` recipe): the
// transferee is an active Volunteer of Church B only, holding a future
// Assignment on Church B's one seat, and a plain member of Church A. The
// Ministry Invitation, its redemption and the transfer stay product-driven.
interface ConfirmTransferOutcome {
  kind: string;
  destinationVolunteerId?: string;
}

test.describe('#65 — a Volunteer transfers between Churches', () => {
  test('a dual-membership User redeems a Church A invitation, splits, walks all three confirmation layers, and Church B is left with the vacated seat', async ({
    browser,
    page,
  }, testInfo) => {
    const journey = loadVolunteerTransferJourney({ testInfo });
    const transferee = journey.churchB.personas.transferee;
    const churchAName = journey.churchA.church.name;
    const churchBName = journey.churchB.church.name;
    const churchAMinistry = journey.churchA.ministries.worship;
    const churchBMinistry = journey.churchB.ministries.hospitality;
    const churchBRole = churchBMinistry.roles.porter;
    const { seat } = journey;

    // Before anything moves, Church B's roster shows the transferee filling
    // the seat: 1/1 with exactly one chip — so the 0/1 at the end is the
    // transfer's doing, not the starting state.
    const churchBAdminContext = await newPersonaContext({
      browser,
      persona: journey.churchB.personas.admin,
    });
    try {
      const churchBAdminPage = await churchBAdminContext.newPage();
      const seatBuilderPath = rosteringBuilderPath({
        ministryId: churchBMinistry.id,
        cycleId: seat.cycle.id,
      });
      const seatCellTestId = requirementCellTestId({
        shiftId: seat.event.shiftId,
        roleId: churchBRole.id,
      });
      await churchBAdminPage.goto(seatBuilderPath);
      await expect(churchBAdminPage.getByTestId('cycle-builder')).toBeVisible({
        timeout: 15_000,
      });
      const filledSeat = churchBAdminPage.getByTestId(seatCellTestId);
      await expect(filledSeat).toContainText('1/1');
      await expect(filledSeat.getByTestId('assignment-chip')).toHaveCount(1);

      // Church A's ChurchAdmin mints the Ministry Invitation through the
      // product; the transferee is already a member of Church A, so it is a
      // plain "ministry-only" one.
      const churchAMinistryInvitation = await mintMinistryInvitationAs({
        persona: journey.churchA.personas.admin,
        ministryId: churchAMinistry.id,
        email: transferee.email,
        roleIds: [churchAMinistry.roles.usher.id],
      });
      expect(churchAMinistryInvitation.kind).toBe('ministry-only');

      // The browser-driven journey starts here — everything above is fixture
      // setup indistinguishable from what a real dual-membership Volunteer's
      // history would already look like.
      await page.goto(churchAMinistryInvitation.redemptionPath);
      await expect(page).toHaveURL(/\/login(\?.*)?$/);
      await signIn({ page, persona: transferee });
      await expect(page).toHaveURL(
        new RegExp(`/invitations/ministry/${churchAMinistryInvitation.id}$`),
      );
      await expect(
        page.getByRole('heading', { name: `Join ${churchAMinistry.name}` }),
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
      expect(acceptOutcome.sourceChurchName).toBe(churchBName);
      expect(acceptOutcome.destinationChurchName).toBe(churchAName);

      // AC — the split result names both Churches and offers the transfer.
      await expect(
        page.getByRole('heading', {
          name: `You're a member of ${churchAName}`,
        }),
      ).toBeVisible();
      // `destinationChurchName` (Church A) also renders inside a <strong> on
      // this screen, but only Church B's real name is the *source* — scoping
      // to the one <strong> that names it (rather than a bare substring match
      // across the whole panel) keeps this from passing against a mislabeled
      // split.
      await expect(
        page.locator('strong', { hasText: churchBName }),
      ).toBeVisible();
      const moveButton = page.getByRole('button', {
        name: 'Move my Volunteer profile',
      });
      await expect(moveButton).toBeVisible();
      await expect(
        page.getByRole('button', {
          name: `Continue to ${churchAName} as a member`,
        }),
      ).toBeVisible();

      // Layer 1 — choose the move.
      await moveButton.click();

      // Layer 2 — review the *actual* affected memberships and assignments.
      await expect(
        page.getByRole('heading', { name: 'Review the move' }),
      ).toBeVisible();
      await expect(page.getByText(churchBMinistry.name)).toBeVisible();
      await expect(page.getByText(seat.event.title)).toBeVisible();
      await expect(page.getByText(churchBRole.name)).toBeVisible();
      await page.getByRole('checkbox').click();
      await page.getByRole('button', { name: 'Continue' }).click();

      // Layer 3 — re-authenticate and type the destination Church name.
      await expect(
        page.getByRole('heading', { name: 'Confirm Volunteer Transfer' }),
      ).toBeVisible();
      await page.getByLabel('Password').fill(transferee.password);
      await page
        .getByLabel(new RegExp(`Type ${churchAName} to confirm`))
        .fill(churchAName);

      const [confirmResponse] = await Promise.all([
        page.waitForResponse((response) =>
          response
            .url()
            .endsWith(
              `/redemption/transfer/${churchAMinistryInvitation.id}/confirm`,
            ),
        ),
        page
          .getByRole('button', { name: 'Confirm Volunteer Transfer' })
          .click(),
      ]);
      const confirmOutcome =
        (await confirmResponse.json()) as ConfirmTransferOutcome;
      expect(confirmOutcome.kind).toBe('transferred');
      expect(confirmOutcome.destinationVolunteerId).toEqual(expect.any(String));

      await expect(page).toHaveURL(/\/dashboard(\?.*)?$/);

      // #342 — the app itself made Church A active: the User belongs to both
      // Churches now, so without that selection the dashboard guard would have
      // sent them to /select-church.
      expect(
        await fetchActiveChurchStatus({ request: page.request }),
      ).toMatchObject({
        status: 'resolved',
        churchId: journey.churchA.church.id,
      });

      // The transferred User is now an active Volunteer of Church A.
      const ministryOptions = await fetchVolunteerMinistryOptions({
        request: page.request,
      });
      expect(ministryOptions.map((option) => option.id)).toContain(
        churchAMinistry.id,
      );

      // AC — Church B's roster visibly shows the hole where the transferred
      // Volunteer used to be: no assignment chip, the requirement back to 0/1.
      await churchBAdminPage.goto(seatBuilderPath);
      await expect(churchBAdminPage.getByTestId('cycle-builder')).toBeVisible({
        timeout: 15_000,
      });
      const requirement = churchBAdminPage.getByTestId(seatCellTestId);
      await expect(requirement).toContainText('0/1');
      await expect(requirement.getByTestId('assignment-chip')).toHaveCount(0);
    } finally {
      await churchBAdminContext.close();
    }
  });
});

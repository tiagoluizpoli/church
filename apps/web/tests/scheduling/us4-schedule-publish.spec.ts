import { m } from '@church/i18n/messages';
import { expect, test } from '@playwright/test';
import { z } from 'zod';
import {
  parseLastJsonLine,
  runE2eServerScript,
} from '@/tests/fixtures/e2e-target';
import { requiredE2eUrl } from '@/tests/fixtures/e2e-urls';
import {
  assignPreparePath,
  newPersonaContext,
  requirementCellTestId,
  shortVolunteerName,
  signInPersonaPage,
} from '@/tests/fixtures/journeys/assign-church';
import { loadSchedulePublishJourney } from '@/tests/fixtures/journeys/schedule-publish';

const SERVER_URL = requiredE2eUrl({ variable: 'VITE_SERVER_URL' });

interface ParticipationSummaryResponse {
  id: string;
  state: string;
}

interface ParticipationEventResponse {
  participation: ParticipationSummaryResponse;
}

interface ParticipationResponse {
  events: ParticipationEventResponse[];
}

test('DL4-US4 leader applies a proposal over realistic availability, publishes below full, volunteer sees published slice, sibling ministry stays unpublished', async ({
  browser,
  page,
}, testInfo) => {
  // The journey owns its Cycle and both Participations: publish is
  // cycle-wide, and the sibling Ministry must start (and stay) unpublished.
  const journey = loadSchedulePublishJourney({ testInfo });
  const worshipMinistryId = journey.ministries.worship.id;
  const careMinistryId = journey.ministries.care.id;
  const cycleId = journey.cycle.id;
  const worshipParticipationId = journey.worship.id;
  const careParticipationId = journey.care.id;
  const eventTitle = journey.event.title;
  const volunteerName = journey.personas.volunteer.name;
  const elisaName = journey.pool.elisa.name;
  const peopleNeeded = journey.worship.peopleNeeded;
  await signInPersonaPage({ page, persona: journey.personas.leader });

  await page.goto(
    assignPreparePath({
      ministryId: worshipMinistryId,
      cycleId: cycleId,
    }),
  );

  // A long Church name must leave the mobile header actions reachable.
  await page.setViewportSize({ width: 320, height: 800 });
  const header = page.getByTestId('mobile-top-header');
  const churchName = header.locator('span.truncate').first();
  await churchName.evaluate((element) => {
    element.textContent = 'A very long Church name for a narrow screen';
  });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const fontSize of [100, 125]) {
      await page.evaluate((size) => {
        document.documentElement.style.fontSize = `${size}%`;
      }, fontSize);
      const menuBox = await page
        .getByTestId('mobile-drawer-trigger')
        .boundingBox();
      if (!menuBox) throw new Error('Mobile menu is not visible');
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width);
      expect(menuBox.width).toBeGreaterThanOrEqual(44);
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '';
  });
  await page.setViewportSize({ width: 1280, height: 800 });

  const eventRow = page
    .locator('[data-testid^="prepare-event-time-block-row-"]')
    .filter({ hasText: eventTitle })
    .first();
  await expect(eventRow).toBeVisible();
  // Schedule rows now summarize Time blocks. Check the journey's initial
  // lifecycle state through the retained participation read before publish.
  const initialStateResponse = await page.request.get(
    `${SERVER_URL}/api/v1/prepare/cycles/${cycleId}/participation`,
    { params: { ministryId: worshipMinistryId } },
  );
  expect(initialStateResponse.ok()).toBeTruthy();
  const initialStateBody =
    (await initialStateResponse.json()) as ParticipationResponse;
  expect(
    initialStateBody.events.find(
      (event) => event.participation.id === worshipParticipationId,
    )?.participation.state,
  ).toBe('availability_requested');

  await page.getByTestId('open-assign-link').click();
  await expect(page).toHaveURL(
    `/app/schedules/${worshipMinistryId}/${cycleId}/assign`,
  );

  await expect(page.getByTestId('cycle-builder')).toBeVisible({
    timeout: 15_000,
  });

  const requirement = page.getByTestId(
    requirementCellTestId({
      requirementId: journey.worship.requirementId,
    }),
  );
  await expect(requirement).toContainText(`0/${peopleNeeded}`);

  // Availability (see the recipe): Rafael is free for both Shifts, Elisa only
  // for the first, Davi for none, Caio has not answered and Beatriz was never
  // asked. The scarcest Volunteer goes first, so the proposal is Elisa and
  // Rafael on the first Shift and Rafael on the second, leaving one place open
  // there. Reviewing and discarding it writes nothing; Apply adds exactly the
  // three reviewed Assignments.
  const secondRequirement = page.getByTestId(
    requirementCellTestId({
      requirementId: journey.worshipSecond.requirementId,
    }),
  );
  await expect(secondRequirement).toContainText(
    `0/${journey.worshipSecond.peopleNeeded}`,
  );
  const ptBR = { locale: 'pt-BR' } as const;
  const proposalDialog = page.getByRole('dialog', {
    name: m.builder_proposal_title({}, ptBR),
  });
  const openProposal = async () => {
    await page
      .getByRole('button', { name: m.builder_proposal_open({}, ptBR) })
      .click();
    await expect(proposalDialog).toContainText(
      m.builder_proposal_stat_additions_many({ count: 3 }, ptBR),
    );
  };
  await openProposal();
  // Every tab stays mounted; read the one on screen.
  const shiftsTab = proposalDialog.getByRole('tabpanel');
  await expect(shiftsTab.getByText(volunteerName)).toHaveCount(2);
  await expect(shiftsTab.getByText(elisaName)).toHaveCount(1);
  // Unavailable, unanswered and never-asked Volunteers are not suggested.
  for (const excluded of [
    journey.pool.davi.name,
    journey.pool.caio.name,
    journey.personas.other.name,
  ]) {
    await expect(shiftsTab.getByText(excluded)).toHaveCount(0);
  }
  await expect(proposalDialog).toContainText(
    m.builder_proposal_gap_one({}, ptBR),
  );
  await proposalDialog
    .getByRole('button', { name: m.builder_proposal_discard({}, ptBR) })
    .click();
  await expect(proposalDialog).toBeHidden();
  await expect(requirement).toContainText(`0/${peopleNeeded}`);
  await expect(secondRequirement).toContainText(
    `0/${journey.worshipSecond.peopleNeeded}`,
  );

  await openProposal();
  await proposalDialog
    .getByRole('button', {
      name: m.builder_proposal_apply_count({ selected: 3, total: 3 }, ptBR),
    })
    .click();
  await expect(
    page.getByText(m.builder_proposal_applied({ count: 3 }, ptBR)),
  ).toBeVisible();
  await expect(proposalDialog).toBeHidden();
  const chips = (cell: typeof requirement) =>
    cell.getByTestId('assignment-chip');
  await expect(chips(requirement)).toHaveCount(2);
  await expect(
    chips(requirement).filter({ hasText: volunteerName }),
  ).toHaveCount(1);
  await expect(chips(requirement).filter({ hasText: elisaName })).toHaveCount(
    1,
  );
  await expect(requirement).toContainText(`2/${peopleNeeded}`);
  await expect(chips(secondRequirement)).toHaveCount(1);
  await expect(chips(secondRequirement)).toContainText(volunteerName);
  await expect(secondRequirement).toContainText(
    `1/${journey.worshipSecond.peopleNeeded}`,
  );
  // Apply does not publish: the Schedule is still open for changes.
  await expect(
    page.getByRole('button', { name: m.builder_proposal_open({}, ptBR) }),
  ).toBeVisible();

  await page
    .getByRole('button', {
      name: m.builder_ui_publish({}, { locale: 'pt-BR' }),
    })
    .first()
    .click();
  const publishDialog = page.getByRole('dialog', {
    name: m.builder_ui_publish_title({}, { locale: 'pt-BR' }),
  });
  // One seat still open — the below-full publish; the confirm authorises it.
  await expect(publishDialog).toContainText(
    'Vagas em aberto: 1; turnos afetados: 1',
  );
  await publishDialog
    .getByRole('button', {
      name: m.builder_ui_publish({}, { locale: 'pt-BR' }),
    })
    .click();
  await expect(
    page.getByText(m.builder_logic_cycle_published({}, { locale: 'pt-BR' })),
  ).toBeVisible();
  // Assistance is not offered for an already-published Schedule: it stays
  // in place, disabled, and says why (#947).
  const proposalButton = page.getByRole('button', {
    name: m.builder_proposal_open({}, ptBR),
  });
  await expect(proposalButton).toHaveAttribute('aria-disabled', 'true');
  await expect(proposalButton).toHaveAccessibleDescription(
    m.builder_proposal_disabled_published({}, ptBR),
  );

  const [worshipStateResponse, careStateResponse] = await Promise.all([
    page.request.get(
      `${SERVER_URL}/api/v1/prepare/cycles/${cycleId}/participation`,
      { params: { ministryId: worshipMinistryId } },
    ),
    page.request.get(
      `${SERVER_URL}/api/v1/prepare/cycles/${cycleId}/participation`,
      { params: { ministryId: careMinistryId } },
    ),
  ]);
  expect(worshipStateResponse.ok()).toBeTruthy();
  expect(careStateResponse.ok()).toBeTruthy();

  const worshipStateBody =
    (await worshipStateResponse.json()) as ParticipationResponse;
  const careStateBody =
    (await careStateResponse.json()) as ParticipationResponse;

  expect(
    worshipStateBody.events.find(
      (event) => event.participation.id === worshipParticipationId,
    )?.participation.state,
  ).toBe('published');
  expect(
    careStateBody.events.find(
      (event) => event.participation.id === careParticipationId,
    )?.participation.state,
  ).toBe('availability_requested');

  const volunteerContext = await newPersonaContext({
    browser,
    persona: journey.personas.volunteer,
  });
  const volunteerPage = await volunteerContext.newPage();

  await volunteerPage.goto(`/app/my-schedule/${worshipMinistryId}/${cycleId}`);
  await expect(volunteerPage.getByText(eventTitle)).toBeVisible();
  // Rafael serves both Events.
  await expect(
    volunteerPage.getByText(journey.worshipSecond.event.title),
  ).toBeVisible();
  // Once per Event's team.
  await expect(
    volunteerPage.getByText(shortVolunteerName({ name: volunteerName }), {
      exact: true,
    }),
  ).toHaveCount(2);

  // Replace, undo, then replace again: only the final net change is sent.
  const choose = async ({ from, name }: { from: string; name: string }) => {
    await chips(requirement).filter({ hasText: from }).click();
    const picker = page.getByTestId('assignment-picker');
    await picker.getByRole('textbox').fill(name);
    await picker.getByTestId('picker-option').filter({ hasText: name }).click();
    await expect(chips(requirement).filter({ hasText: name })).toHaveCount(1);
  };
  const otherName = journey.personas.other.name;
  await choose({ from: volunteerName, name: otherName });
  const sendLabel = m.builder_send_updates({ count: 2 }, { locale: 'pt-BR' });
  await expect(page.getByRole('button', { name: sendLabel })).toBeVisible();
  await choose({ from: otherName, name: volunteerName });
  await expect(page.getByRole('button', { name: sendLabel })).toHaveCount(0);
  await expect
    .poll(async () => {
      const response = await page.request.get(
        `${SERVER_URL}/api/v1/assign/cycles/${cycleId}/builder`,
        { params: { ministryId: worshipMinistryId } },
      );
      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      return body.affectedVolunteerCount;
    })
    .toBe(0);
  const onePersonLabel = m.builder_send_updates(
    { count: 1 },
    { locale: 'pt-BR' },
  );
  await expect(page.getByRole('button', { name: onePersonLabel })).toHaveCount(
    0,
  );
  await choose({ from: volunteerName, name: otherName });
  await page.getByRole('button', { name: sendLabel }).click();
  await expect(
    page.getByText(m.schedule_updates_sent({}, { locale: 'pt-BR' })),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: sendLabel })).toHaveCount(0);

  const otherContext = await newPersonaContext({
    browser,
    persona: journey.personas.other,
  });
  const otherPage = await otherContext.newPage();
  const title = m.notification_schedule_updated_title(
    { ministryName: journey.ministries.worship.name },
    { locale: 'pt-BR' },
  );
  for (const recipient of [volunteerPage, otherPage]) {
    await recipient.goto('/app/dashboard');
    await expect
      .poll(
        async () => {
          const response = await recipient.request.get(
            `${SERVER_URL}/api/v1/notifications`,
          );
          if (!response.ok()) return false;
          const body = await response.json();
          return body.items.some(
            (item: { kind: string }) => item.kind === 'schedule_updated',
          );
        },
        { timeout: 20_000 },
      )
      .toBe(true);
    await recipient.reload();
    await recipient
      .getByRole('button', {
        name: m.notification_bell_label({}, { locale: 'pt-BR' }),
      })
      .click();
    await recipient.getByText(title, { exact: true }).click();
    await expect(recipient.getByRole('dialog')).toContainText(eventTitle);
  }
  await expect(volunteerPage.getByRole('dialog')).toContainText('Removido:');
  await expect(otherPage.getByRole('dialog')).toContainText('Adicionado:');
  const emailSchema = z.array(
    z.object({
      payload: z.object({ kind: z.string(), to: z.string() }),
      request: z.object({ text: z.string() }),
    }),
  );
  await expect
    .poll(
      () => {
        const output = runE2eServerScript({
          scriptPath: 'tests/e2e/schedule-email-inspector.ts',
          args: [journey.church.id],
          step: 'inspect J8 emails',
        });
        const emails = parseLastJsonLine({ output, schema: emailSchema });
        const published = emails.filter(
          (email) => email.payload.kind === 'schedule.published',
        );
        const updates = emails.filter(
          (email) => email.payload.kind === 'schedule.updated',
        );
        // Published to each assigned Volunteer: Rafael and Elisa, once each.
        const publishedTo = published.map(({ payload }) => payload.to).sort();
        const expectedTo = [
          journey.personas.volunteer.email,
          journey.pool.elisa.email,
        ].sort();
        if (publishedTo.join() !== expectedTo.join() || updates.length !== 2)
          return false;
        const removed = updates.find(
          (email) => email.payload.to === journey.personas.volunteer.email,
        );
        const added = updates.find(
          (email) => email.payload.to === journey.personas.other.email,
        );
        return (
          !!removed?.request.text.includes('Removido:') &&
          !!added?.request.text.includes('Adicionado:') &&
          removed.request.text.includes('/app/my-schedule') &&
          added.request.text.includes('/app/my-schedule')
        );
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  await otherContext.close();
  await volunteerContext.close();
});

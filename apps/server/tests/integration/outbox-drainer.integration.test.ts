import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import { DbOutboxDrainer } from '../../src/application/db-outbox-drainer';
import { ChurchId, MinistryId, UserId } from '../../src/domain/branded-ids';
import { CaptureEmailSender } from '../../src/infrastructure/services/capture-email-sender';
import {
  seedTwoChurchIdentityFixture,
  type TwoChurchIdentityFixture,
} from '../../src/test-support/identity-fixtures';
import { createMinistryInvitationTestHarness } from '../../src/test-support/ministry-invitation-test-harness';
import { testDb, truncateAll } from './repositories/setup';

const {
  outboxRepository,
  ministryInvitationRepository,
  churchRepository,
  ministryRepository,
  roleRepository,
  unitOfWork,
  manager,
} = createMinistryInvitationTestHarness({ db: testDb });

let fixture: TwoChurchIdentityFixture;

beforeEach(async () => {
  await truncateAll();
  fixture = await seedTwoChurchIdentityFixture({ db: testDb });
});

interface BuildDrainerInput {
  emailSender: CaptureEmailSender;
}

function buildDrainer({ emailSender }: BuildDrainerInput): DbOutboxDrainer {
  return new DbOutboxDrainer({
    outboxRepository,
    invitationRepository: ministryInvitationRepository,
    churchRepository,
    ministryRepository,
    roleRepository,
    emailSender,
    unitOfWork,
  });
}

describe('DbOutboxDrainer (integration)', () => {
  it('sends a real minted invitation end to end and marks it sent', async () => {
    await manager.mint({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      inviterId: UserId.from(fixture.adminA),
      email: `${fixture.memberNoVolunteerA}@fixture.test`,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });

    const emailSender = new CaptureEmailSender();
    const result = await buildDrainer({ emailSender }).drainOnce({ limit: 10 });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]).toMatchObject({
      kind: 'invitation.ministry',
      to: `${fixture.memberNoVolunteerA}@fixture.test`,
      churchName: fixture.churchA.name,
    });
  });

  it('two concurrent drains of the same message never send twice', async () => {
    await manager.mint({
      churchId: ChurchId.from(fixture.churchA.id),
      ministryId: MinistryId.from(fixture.ministryOneA),
      inviterId: UserId.from(fixture.adminA),
      email: `${fixture.memberNoVolunteerA}@fixture.test`,
      ministryAccessLevel: 'volunteer',
      roleIds: [],
    });

    const emailSenderA = new CaptureEmailSender();
    const emailSenderB = new CaptureEmailSender();

    const [resultA, resultB] = await Promise.all([
      buildDrainer({ emailSender: emailSenderA }).drainOnce({ limit: 1 }),
      buildDrainer({ emailSender: emailSenderB }).drainOnce({ limit: 1 }),
    ]);

    const totalClaimed = resultA.claimed + resultB.claimed;
    const totalSent = resultA.sent + resultB.sent;
    const totalCaptured = emailSenderA.sent.length + emailSenderB.sent.length;

    expect(totalClaimed).toBe(1);
    expect(totalSent).toBe(1);
    expect(totalCaptured).toBe(1);
  });
});

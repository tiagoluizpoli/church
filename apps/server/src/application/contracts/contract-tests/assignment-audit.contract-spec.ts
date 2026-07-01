import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssignmentId } from '../../../domain/entities/assignment';
import type { ChurchId } from '../../../domain/entities/church';
import type { UserId } from '../../../domain/entities/volunteer';
import type { AssignmentAuditRepository } from '../assignment-audit.repository';

export function runAssignmentAuditRepositoryContractTests(
  factory: () => Promise<AssignmentAuditRepository>,
  cleanup: () => Promise<void> = async () => {},
) {
  describe('AssignmentAuditRepository Contract', () => {
    let repo: AssignmentAuditRepository;

    beforeEach(async () => {
      repo = await factory();
    });

    afterEach(async () => {
      await cleanup();
    });

    it('should create an assignment audit', async () => {
      const created = await repo.create(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        {
          assignmentId: '99999999-9999-9999-9999-999999999991' as AssignmentId,
          actorId: '22222222-2222-2222-2222-222222222221' as UserId,
          action: 'status_change',
          reason: 'Test audit creation',
        },
      );

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.action).toBe('status_change');
    });

    it('should list audits by assignment newest-first', async () => {
      const list = await repo.listByAssignment(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '99999999-9999-9999-9999-999999999991' as AssignmentId,
      );
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0]?.id).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2'); // 11:00:00 is newer than 10:00:00
      expect(list[1]?.id).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1');
    });

    it('should list audits by church newest-first', async () => {
      const list = await repo.listByChurch(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
      );
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0]?.id).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2');
    });

    it('should list audits by actor newest-first', async () => {
      const list = await repo.listByActor(
        '11111111-1111-1111-1111-111111111111' as ChurchId,
        '22222222-2222-2222-2222-222222222221' as UserId,
      );
      expect(list.length).toBeGreaterThanOrEqual(2);
      expect(list[0]?.id).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2');
    });
  });
}

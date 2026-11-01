import { describe, expect, it, vi } from 'vitest';
import { DbEventTemplateManager } from '@/application/db-event-template-manager';
import { ChurchId, EventTemplateId } from '@/domain/branded-ids';
import type { EventTemplateRepository } from '@/domain/contracts/infrastructure/event-template.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import type { EventTemplate } from '@/domain/entities/event-template';
import { DuplicateTemplateBlockLabelError } from '@/domain/errors/duplicate-template-name';
import { InvalidTimeRangeError } from '@/domain/errors/invalid-time-range';

describe('DbEventTemplateManager', () => {
  const churchId = ChurchId.from('church-1');
  const templateId = EventTemplateId.from('template-1');
  const template = { id: templateId } as EventTemplate;

  function createRepository(): EventTemplateRepository {
    return {
      create: vi.fn().mockResolvedValue(template),
      update: vi.fn().mockResolvedValue(template),
      delete: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([template]),
      getById: vi.fn().mockResolvedValue(template),
      getByIds: vi.fn().mockResolvedValue([template]),
    };
  }

  const unitOfWork = {
    run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work('tx')),
  } as unknown as UnitOfWork;

  function createManager(repository: EventTemplateRepository) {
    return new DbEventTemplateManager({
      templateRepository: repository,
      unitOfWork,
    });
  }

  it('creates inside one transaction, trimming and ordering blocks by start time with stable ties', async () => {
    const repository = createRepository();

    const result = await createManager(repository).createTemplate({
      churchId,
      name: '  Sunday Service ',
      weekday: 0,
      blocks: [
        { label: 'Late', startTime: '11:00', endTime: '12:00' },
        { label: ' Tie A ', startTime: '09:00', endTime: '10:00' },
        { label: 'Tie B', startTime: '09:00', endTime: '09:30' },
      ],
    });

    expect(result).toBe(template);
    expect(repository.create).toHaveBeenCalledWith({
      churchId,
      name: 'Sunday Service',
      weekday: 0,
      blocks: [
        { label: 'Tie A', startTime: '09:00', endTime: '10:00', order: 0 },
        { label: 'Tie B', startTime: '09:00', endTime: '09:30', order: 1 },
        { label: 'Late', startTime: '11:00', endTime: '12:00', order: 2 },
      ],
      tx: 'tx',
    });
  });

  it('refuses equal endpoints and case-insensitive duplicate labels without writing', async () => {
    const repository = createRepository();
    const manager = createManager(repository);

    await expect(
      manager.createTemplate({
        churchId,
        name: 'X',
        weekday: 0,
        blocks: [{ label: 'A', startTime: '09:00', endTime: '09:00' }],
      }),
    ).rejects.toThrow(InvalidTimeRangeError);
    await expect(
      manager.createTemplate({
        churchId,
        name: 'X',
        weekday: 0,
        blocks: [
          { label: 'Welcome', startTime: '09:00', endTime: '10:00' },
          { label: ' welcome ', startTime: '10:00', endTime: '11:00' },
        ],
      }),
    ).rejects.toThrow(DuplicateTemplateBlockLabelError);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('accepts overnight blocks and applies the same rules on update', async () => {
    const repository = createRepository();

    await createManager(repository).updateTemplate({
      churchId,
      templateId,
      name: 'Vigil',
      weekday: 3,
      blocks: [{ label: 'Watch', startTime: '22:00', endTime: '02:00' }],
    });

    expect(repository.update).toHaveBeenCalledWith({
      churchId,
      templateId,
      name: 'Vigil',
      weekday: 3,
      blocks: [
        { label: 'Watch', startTime: '22:00', endTime: '02:00', order: 0 },
      ],
      tx: 'tx',
    });
  });

  it('delegates deleteTemplate to the repository', async () => {
    const repository = createRepository();
    const manager = createManager(repository);

    await manager.deleteTemplate({ churchId, templateId });

    expect(repository.delete).toHaveBeenCalledWith({ churchId, templateId });
  });

  it('delegates listTemplates to the repository', async () => {
    const repository = createRepository();
    const manager = createManager(repository);

    const result = await manager.listTemplates({ churchId });

    expect(result).toEqual([template]);
    expect(repository.list).toHaveBeenCalledWith({ churchId });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { DbEventTemplateManager } from '../../src/application/db-event-template-manager';
import { ChurchId, EventTemplateId } from '../../src/domain/branded-ids';
import type { EventTemplateRepository } from '../../src/domain/contracts/infrastructure/event-template.repository';
import type { EventTemplate } from '../../src/domain/entities/event-template';

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

  it('delegates createTemplate to the repository', async () => {
    const repository = createRepository();
    const manager = new DbEventTemplateManager(repository);

    const input = {
      churchId,
      name: 'Sunday Service',
      weekday: 0,
      blocks: [],
    };
    const result = await manager.createTemplate(input);

    expect(result).toBe(template);
    expect(repository.create).toHaveBeenCalledWith(input);
  });

  it('delegates updateTemplate to the repository', async () => {
    const repository = createRepository();
    const manager = new DbEventTemplateManager(repository);

    const input = {
      churchId,
      templateId,
      name: 'Renamed',
      weekday: 3,
      blocks: [],
    };
    const result = await manager.updateTemplate(input);

    expect(result).toBe(template);
    expect(repository.update).toHaveBeenCalledWith(input);
  });

  it('delegates deleteTemplate to the repository', async () => {
    const repository = createRepository();
    const manager = new DbEventTemplateManager(repository);

    await manager.deleteTemplate({ churchId, templateId });

    expect(repository.delete).toHaveBeenCalledWith({ churchId, templateId });
  });

  it('delegates listTemplates to the repository', async () => {
    const repository = createRepository();
    const manager = new DbEventTemplateManager(repository);

    const result = await manager.listTemplates({ churchId });

    expect(result).toEqual([template]);
    expect(repository.list).toHaveBeenCalledWith({ churchId });
  });
});

import { describe, expect, it } from 'vitest';
import { eventTemplateMapper } from '../../src/api/dtos/event-template.dto';
import { EventTemplate } from '../../src/domain/entities/event-template';
import { TimeBlock } from '../../src/domain/entities/time-block';

function createTemplate() {
  const blockOne = new TimeBlock({
    props: {
      churchId: '11111111-1111-1111-1111-111111111111',
      templateId: '22222222-2222-2222-2222-222222222222',
      label: 'Gathering',
      startTime: '08:30',
      endTime: '09:00',
      order: 1,
    },
    id: '33333333-3333-3333-3333-333333333331',
  });
  const blockTwo = new TimeBlock({
    props: {
      churchId: '11111111-1111-1111-1111-111111111111',
      templateId: '22222222-2222-2222-2222-222222222222',
      label: 'Welcome',
      startTime: '09:00',
      endTime: '09:30',
      order: 2,
    },
    id: '33333333-3333-3333-3333-333333333332',
  });

  return new EventTemplate({
    props: {
      churchId: '11111111-1111-1111-1111-111111111111',
      name: 'Sunday Service',
      weekday: 0,
      blocks: [blockOne, blockTwo],
    },
    id: '22222222-2222-2222-2222-222222222222',
  });
}

function createEmptyTemplate() {
  return new EventTemplate({
    props: {
      churchId: '11111111-1111-1111-1111-111111111111',
      name: 'Wednesday Prayer',
      weekday: 3,
      blocks: [],
    },
    id: '44444444-4444-4444-4444-444444444444',
  });
}

describe('eventTemplateMapper', () => {
  it('maps a template with multiple blocks to its response shape', () => {
    const template = createTemplate();

    const response = eventTemplateMapper.toResponse(template);

    expect(response.id).toBe('22222222-2222-2222-2222-222222222222');
    expect(response.churchId).toBe('11111111-1111-1111-1111-111111111111');
    expect(response.name).toBe('Sunday Service');
    expect(response.weekday).toBe(0);
    expect(response.createdAt).toBe(template.createdAt.toISOString());
    expect(response.updatedAt).toBe(template.updatedAt.toISOString());
    expect(response.blocks).toEqual([
      {
        id: '33333333-3333-3333-3333-333333333331',
        churchId: '11111111-1111-1111-1111-111111111111',
        templateId: '22222222-2222-2222-2222-222222222222',
        label: 'Gathering',
        startTime: '08:30',
        endTime: '09:00',
        order: 1,
      },
      {
        id: '33333333-3333-3333-3333-333333333332',
        churchId: '11111111-1111-1111-1111-111111111111',
        templateId: '22222222-2222-2222-2222-222222222222',
        label: 'Welcome',
        startTime: '09:00',
        endTime: '09:30',
        order: 2,
      },
    ]);
  });

  it('maps a template with zero blocks to an empty blocks array', () => {
    const template = createEmptyTemplate();

    const response = eventTemplateMapper.toResponse(template);

    expect(response.blocks).toEqual([]);
  });

  it('maps a non-empty list of templates', () => {
    const templates = [createTemplate(), createEmptyTemplate()];

    const response = eventTemplateMapper.listToResponse(templates);

    expect(response.templates).toHaveLength(2);
    expect(response.templates[0]?.id).toBe(
      '22222222-2222-2222-2222-222222222222',
    );
    expect(response.templates[1]?.id).toBe(
      '44444444-4444-4444-4444-444444444444',
    );
  });

  it('maps an empty list of templates', () => {
    const response = eventTemplateMapper.listToResponse([]);

    expect(response.templates).toEqual([]);
  });
});

import { fromDate, instantSchema, timeOfDaySchema } from '@church/time';
import { z } from 'zod';
import type { EventTemplate } from '../../domain/entities/event-template';

export const eventTemplateBlockBodySchema = z.object({
  label: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  order: z.number().int().nonnegative(),
});

export const createEventTemplateBodySchema = z.object({
  name: z.string().min(1),
  weekday: z.number().int().min(0).max(6),
  blocks: z.array(eventTemplateBlockBodySchema),
});

export const applyTemplatesBodySchema = z.object({
  templateIds: z.array(z.string()).min(1),
});

export const eventTemplateBlockResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  templateId: z.string(),
  label: z.string(),
  startTime: timeOfDaySchema,
  endTime: timeOfDaySchema,
  order: z.number(),
});

export const eventTemplateResponseSchema = z.object({
  id: z.string(),
  churchId: z.string(),
  name: z.string(),
  weekday: z.number(),
  blocks: z.array(eventTemplateBlockResponseSchema),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});

export const eventTemplateListResponseSchema = z.object({
  templates: z.array(eventTemplateResponseSchema),
});

export const generatedPlanningCountsResponseSchema = z.object({
  generatedEventCount: z.number(),
  generatedSlotCount: z.number(),
});

function toEventTemplateResponse(template: EventTemplate) {
  return {
    id: template.id as string,
    churchId: template.churchId as string,
    name: template.name,
    weekday: template.weekday,
    blocks: template.blocks.map((block) => ({
      id: block.id as string,
      churchId: block.churchId as string,
      templateId: block.templateId as string,
      label: block.label,
      startTime: block.startTime,
      endTime: block.endTime,
      order: block.order,
    })),
    createdAt: fromDate({ date: template.createdAt }),
    updatedAt: fromDate({ date: template.updatedAt }),
  };
}

export const eventTemplateMapper = {
  toResponse: toEventTemplateResponse,
  listToResponse(templates: EventTemplate[]) {
    return {
      templates: templates.map(toEventTemplateResponse),
    };
  },
};

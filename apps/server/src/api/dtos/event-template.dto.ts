import { fromDate, instantSchema, timeOfDaySchema } from '@church/time';
import { z } from 'zod';
import type { EventTemplate } from '../../domain/entities/event-template';

/** The single trim point for template names and block labels. */
const requiredTextSchema = z.string().trim().min(1).max(255);

/** Create takes no persisted id or caller-controlled order: the server derives `order`. */
export const eventTemplateTimeBlockBodySchema = z
  .object({
    label: requiredTextSchema,
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
  })
  .strict();

/** Edit may name a persisted block `id` to update it in place; absent creates a block. */
export const updateEventTemplateTimeBlockBodySchema =
  eventTemplateTimeBlockBodySchema.extend({ id: z.string().uuid().optional() });

type UpdateEventTemplateTimeBlockBody = z.infer<
  typeof updateEventTemplateTimeBlockBodySchema
>;

/** True when two blocks name the same persisted id, ignoring case. */
function hasRepeatedIds(blocks: UpdateEventTemplateTimeBlockBody[]): boolean {
  const ids = blocks.flatMap((block) =>
    block.id ? [block.id.toLowerCase()] : [],
  );
  return new Set(ids).size !== ids.length;
}

export const createEventTemplateBodySchema = z.object({
  name: requiredTextSchema,
  weekday: z.number().int().min(0).max(6),
  blocks: z.array(eventTemplateTimeBlockBodySchema).min(1),
});

export const updateEventTemplateBodySchema =
  createEventTemplateBodySchema.extend({
    blocks: z
      .array(updateEventTemplateTimeBlockBodySchema)
      .min(1)
      .refine((blocks) => !hasRepeatedIds(blocks), {
        message: 'Each block id may appear only once',
      }),
  });

export const applyTemplatesBodySchema = z.object({
  templateIds: z.array(z.string()).min(1),
});

export const eventTemplateTimeBlockResponseSchema = z.object({
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
  blocks: z.array(eventTemplateTimeBlockResponseSchema),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});

export const eventTemplateListResponseSchema = z.object({
  templates: z.array(eventTemplateResponseSchema),
});

export const eventTemplateUsageResponseSchema = z.object({
  templateId: z.string(),
  ministryCount: z.number(),
  blocks: z.array(z.object({ blockId: z.string(), ministryCount: z.number() })),
});

export const generatedPlanningCountsResponseSchema = z.object({
  generatedEventCount: z.number(),
  generatedEventTimeBlockCount: z.number(),
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

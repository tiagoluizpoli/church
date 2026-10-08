import {
  eventTemplate,
  ministryServingProfile,
  type ServingProfileHeadcount,
  type ShiftSplitSpec,
  timeBlock,
} from '@church/db';
import type { TimeOfDay } from '@church/time';
import type { SeedWriter } from '../recipe';
import { requireInsertedRow } from './require-inserted-row';

/**
 * Direct-state builders for the standing planning rules a ChurchAdmin and
 * Ministry leaders configure once: EventTemplates with their TimeBlocks, and
 * MinistryServingProfiles bound to those blocks.
 */

export type SeededEventTemplate = typeof eventTemplate.$inferSelect;
export type SeededTimeBlock = typeof timeBlock.$inferSelect;
export type SeededMinistryServingProfile =
  typeof ministryServingProfile.$inferSelect;

export interface SeedTimeBlock {
  id?: string;
  label: string;
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  /** Position in the template; defaults to the block's index. */
  order?: number;
}

export interface BuildEventTemplateInput {
  db: SeedWriter;
  churchId: string;
  id?: string;
  name: string;
  /** 0 (Sunday) … 6 (Saturday). */
  weekday: number;
  /** In order; a block without an explicit `order` takes its position. */
  blocks: readonly SeedTimeBlock[];
}

export interface SeededEventTemplateWithBlocks {
  template: SeededEventTemplate;
  blocks: SeededTimeBlock[];
}

export async function buildEventTemplate({
  db,
  churchId,
  id,
  name,
  weekday,
  blocks,
}: BuildEventTemplateInput): Promise<SeededEventTemplateWithBlocks> {
  const template = requireInsertedRow({
    rows: await db
      .insert(eventTemplate)
      .values({ id, churchId, name, weekday })
      .returning(),
    description: `Event Template ${name}`,
  });

  const seededBlocks =
    blocks.length === 0
      ? []
      : await db
          .insert(timeBlock)
          .values(
            blocks.map((block, index) => ({
              id: block.id,
              churchId,
              templateId: template.id,
              label: block.label,
              startTime: block.startTime,
              endTime: block.endTime,
              order: block.order ?? index,
            })),
          )
          .returning();

  return { template, blocks: seededBlocks };
}

export interface BuildMinistryServingProfileInput {
  db: SeedWriter;
  churchId: string;
  ministryId: string;
  sourceTemplateBlockId: string;
  id: string;
  serves: boolean;
  shiftSplit: ShiftSplitSpec;
  headcounts: ServingProfileHeadcount[];
}

/** One Ministry's standing rule for one TimeBlock. */
export async function buildMinistryServingProfile({
  db,
  churchId,
  ministryId,
  sourceTemplateBlockId,
  id,
  serves,
  shiftSplit,
  headcounts,
}: BuildMinistryServingProfileInput): Promise<SeededMinistryServingProfile> {
  return requireInsertedRow({
    rows: await db
      .insert(ministryServingProfile)
      .values({
        id,
        churchId,
        ministryId,
        sourceTemplateBlockId,
        serves,
        shiftSplit,
        headcounts,
      })
      .returning(),
    description: `Ministry Serving Profile ${id}`,
  });
}

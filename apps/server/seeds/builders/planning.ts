import {
  eventTemplate,
  type ShiftSplitSpec,
  templateTimeBlock,
  type UsualSetupHeadcount,
  usualSetup,
} from '@church/db';
import type { TimeOfDay } from '@church/time';
import type { SeedWriter } from '../recipe';
import { requireInsertedRow } from './require-inserted-row';

/**
 * Direct-state builders for the standing planning rules a ChurchAdmin and
 * Ministry leaders configure once: EventTemplates with their TemplateTimeBlocks, and
 * UsualSetups bound to those blocks.
 */

export type SeededEventTemplate = typeof eventTemplate.$inferSelect;
export type SeededTemplateTimeBlock = typeof templateTimeBlock.$inferSelect;
export type SeededUsualSetup = typeof usualSetup.$inferSelect;

export interface SeedTemplateTimeBlock {
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
  blocks: readonly SeedTemplateTimeBlock[];
}

export interface SeededEventTemplateWithBlocks {
  template: SeededEventTemplate;
  blocks: SeededTemplateTimeBlock[];
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
          .insert(templateTimeBlock)
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

export interface BuildUsualSetupInput {
  db: SeedWriter;
  churchId: string;
  ministryId: string;
  sourceTemplateTimeBlockId: string;
  id: string;
  serves: boolean;
  shiftSplit: ShiftSplitSpec;
  headcounts: UsualSetupHeadcount[];
}

/** One Ministry's standing rule for one TemplateTimeBlock. */
export async function buildUsualSetup({
  db,
  churchId,
  ministryId,
  sourceTemplateTimeBlockId,
  id,
  serves,
  shiftSplit,
  headcounts,
}: BuildUsualSetupInput): Promise<SeededUsualSetup> {
  return requireInsertedRow({
    rows: await db
      .insert(usualSetup)
      .values({
        id,
        churchId,
        ministryId,
        sourceTemplateTimeBlockId,
        serves,
        shiftSplit,
        headcounts,
      })
      .returning(),
    description: `Usual Setup ${id}`,
  });
}

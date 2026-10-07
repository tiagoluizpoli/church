import { parseTimeOfDay } from '@church/time';
import type {
  GatheringBlockKey,
  GatheringsBlueprint,
  StaffingNeed,
} from '../blueprints/gatherings';
import { deriveSeedId } from '../builders/derived-id';
import {
  buildEventTemplate,
  buildMinistryServingProfile,
} from '../builders/planning';
import type { SeedWriter } from '../recipe';

/** The ids one seeded Ministry exposes to the planning data built on it. */
export interface SeededMinistryStructure {
  ministryId: string;
  roleIdByName: Map<string, string>;
  teamIdByName: Map<string, string>;
}

export interface SeededTemplateBlock {
  key: GatheringBlockKey;
  id: string;
  templateId: string;
  templateName: string;
  label: string;
}

export interface SeededGatherings {
  blocks: readonly SeededTemplateBlock[];
}

export interface StaffingNeedIds {
  roleId: string;
  teamId?: string;
}

export interface ResolveStaffingNeedInput {
  ministry: SeededMinistryStructure;
  ministryName: string;
  need: StaffingNeed;
}

/** A blueprint need's Role and Team as ids; an unknown name fails the load. */
export function resolveStaffingNeed({
  ministry,
  ministryName,
  need,
}: ResolveStaffingNeedInput): StaffingNeedIds {
  const roleId = ministry.roleIdByName.get(need.role);
  if (!roleId) {
    throw new Error(`${ministryName} has no Role ${need.role}.`);
  }
  if (need.team === undefined) return { roleId };
  const teamId = ministry.teamIdByName.get(need.team);
  if (!teamId) {
    throw new Error(`${ministryName} has no Team ${need.team}.`);
  }
  return { roleId, teamId };
}

export interface RequireMinistryInput {
  ministries: Map<string, SeededMinistryStructure>;
  name: string;
}

export function requireMinistry({
  ministries,
  name,
}: RequireMinistryInput): SeededMinistryStructure {
  const seeded = ministries.get(name);
  if (!seeded) {
    throw new Error(`The gatherings blueprint names unknown Ministry ${name}.`);
  }
  return seeded;
}

export interface LoadGatheringsInput {
  db: SeedWriter;
  churchId: string;
  blueprint: GatheringsBlueprint;
  ministries: Map<string, SeededMinistryStructure>;
}

/**
 * The Church's standing planning rules: its EventTemplates and every
 * Ministry's serving profile for each of their TimeBlocks.
 */
export async function loadGatherings({
  db,
  churchId,
  blueprint,
  ministries,
}: LoadGatheringsInput): Promise<SeededGatherings> {
  const blocks: SeededTemplateBlock[] = [];
  for (const templateBlueprint of blueprint.templates) {
    const templateId = deriveSeedId({
      kind: 'event-template',
      parentIds: [churchId, templateBlueprint.name],
    });
    const templateBlocks = templateBlueprint.blocks.map((block) => ({
      ...block,
      id: deriveSeedId({
        kind: 'time-block',
        parentIds: [templateId, block.key],
      }),
    }));
    await buildEventTemplate({
      db,
      churchId,
      id: templateId,
      name: templateBlueprint.name,
      weekday: templateBlueprint.weekday,
      blocks: templateBlocks.map((block) => ({
        id: block.id,
        label: block.label,
        startTime: parseTimeOfDay({ value: block.startTime }),
        endTime: parseTimeOfDay({ value: block.endTime }),
      })),
    });
    blocks.push(
      ...templateBlocks.map((block) => ({
        key: block.key,
        id: block.id,
        templateId,
        templateName: templateBlueprint.name,
        label: block.label,
      })),
    );
  }

  for (const rule of blueprint.servingRules) {
    const ministry = requireMinistry({ ministries, name: rule.ministry.name });
    for (const block of blocks) {
      const needs = rule.blocks[block.key];
      await buildMinistryServingProfile({
        db,
        churchId,
        ministryId: ministry.ministryId,
        sourceTemplateBlockId: block.id,
        id: deriveSeedId({
          kind: 'ministry-serving-profile',
          parentIds: [ministry.ministryId, block.id],
        }),
        serves: needs !== null,
        shiftSplit: { kind: 'equal', count: 1 },
        headcounts: (needs ?? []).map((need) => ({
          ...resolveStaffingNeed({
            ministry,
            ministryName: rule.ministry.name,
            need,
          }),
          count: need.count,
        })),
      });
    }
  }

  return { blocks };
}

import { Entity, type LooseProps } from '@church/core';
import { type TimeOfDay, timeOfDayOffset, timeOfDaySpan } from '@church/time';
import type {
  ChurchId,
  MinistryId,
  RoleId,
  SectorId,
  TemplateTimeBlockId,
  UsualSetupId,
} from '../branded-ids';
import { DuplicateHeadcountError } from '../errors/duplicate-headcount';
import { InvalidRequiredCountError } from '../errors/invalid-required-count';
import { InvalidShiftIndexError } from '../errors/invalid-shift-index';
import { InvalidShiftSplitError } from '../errors/invalid-shift-split';
import { UsualSetupEmptyError } from '../errors/usual-setup-empty';

export interface UsualSetupEqualSplit {
  kind: 'equal';
  count: number;
}

export interface UsualSetupManualSpan {
  label?: string;
  startTime: TimeOfDay;
  endTime: TimeOfDay;
}

export interface UsualSetupManualSplit {
  kind: 'manual';
  spans: UsualSetupManualSpan[];
}

export type UsualSetupShiftSplit = UsualSetupEqualSplit | UsualSetupManualSplit;

/** One positive count for a Sector × Role in one Shift of the split. */
export interface UsualSetupHeadcount {
  /** Zero-based chronological Shift the split generates. */
  shiftIndex: number;
  sectorId: SectorId;
  roleId: RoleId;
  peopleNeeded: number;
}

export interface UsualSetupEntryInput {
  sourceTemplateTimeBlockId: TemplateTimeBlockId;
  serves: boolean;
  shiftSplit: UsualSetupShiftSplit;
  headcounts: UsualSetupHeadcount[];
}

export interface UsualSetupProps {
  churchId: ChurchId;
  ministryId: MinistryId;
  sourceTemplateTimeBlockId: TemplateTimeBlockId;
  serves: boolean;
  shiftSplit: UsualSetupShiftSplit;
  headcounts: UsualSetupHeadcount[];
}

export interface UsualSetupInput {
  props: LooseProps<UsualSetupProps>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class UsualSetup extends Entity<UsualSetupProps, UsualSetupId> {
  constructor({ props, id, createdAt, updatedAt }: UsualSetupInput) {
    assertValidShiftSplit({ shiftSplit: props.shiftSplit });
    assertValidHeadcounts({ headcounts: props.headcounts });

    super({
      props: props as UsualSetupProps,
      id: id as UsualSetupId,
      createdAt,
      updatedAt,
    });
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get ministryId(): MinistryId {
    return this._props.ministryId;
  }

  get sourceTemplateTimeBlockId(): TemplateTimeBlockId {
    return this._props.sourceTemplateTimeBlockId;
  }

  get serves(): boolean {
    return this._props.serves;
  }

  get shiftSplit(): UsualSetupShiftSplit {
    return this._props.shiftSplit;
  }

  get headcounts(): UsualSetupHeadcount[] {
    return this._props.headcounts;
  }
}

interface AssertValidShiftSplitInput {
  shiftSplit: UsualSetupShiftSplit;
}

function assertValidShiftSplit({
  shiftSplit,
}: AssertValidShiftSplitInput): void {
  if (shiftSplit.kind === 'equal') {
    if (!Number.isInteger(shiftSplit.count) || shiftSplit.count < 1) {
      throw new InvalidShiftSplitError(
        'profile equal split count must be a positive integer',
      );
    }
    return;
  }

  for (const span of shiftSplit.spans) {
    // An end earlier than its start runs past midnight; only equal is empty.
    if (
      timeOfDaySpan({ start: span.startTime, end: span.endTime })
        .durationMinutes === 0
    ) {
      throw new InvalidShiftSplitError(
        'profile manual span must have a positive duration',
      );
    }
  }
}

interface AssertValidHeadcountsInput {
  headcounts: UsualSetupHeadcount[];
}

function assertValidHeadcounts({
  headcounts,
}: AssertValidHeadcountsInput): void {
  const places = new Set<string>();
  for (const headcount of headcounts) {
    const place = `${headcount.shiftIndex}:${headcount.sectorId}:${headcount.roleId}`;
    if (places.has(place)) {
      throw new DuplicateHeadcountError();
    }
    places.add(place);

    if (
      !Number.isInteger(headcount.peopleNeeded) ||
      headcount.peopleNeeded < 1
    ) {
      throw new InvalidRequiredCountError();
    }
  }
}

interface ShiftCountInput {
  shiftSplit: UsualSetupShiftSplit;
}

/** How many Shifts the split generates; headcount indices range below it. */
export function shiftCountOf({ shiftSplit }: ShiftCountInput): number {
  return shiftSplit.kind === 'equal'
    ? shiftSplit.count
    : shiftSplit.spans.length;
}

const NOT_SERVED_SPLIT: UsualSetupEqualSplit = { kind: 'equal', count: 1 };

export interface ToSaveableUsualSetupEntryInput {
  entry: UsualSetupEntryInput;
}

/**
 * The entry a save persists. Rules a stored legacy row may break, so they hold
 * on write only: a serving entry needs a positive headcount in a Shift its
 * split generates; a non-serving entry is the canonical explicit opt-out.
 */
export function toSaveableUsualSetupEntry({
  entry,
}: ToSaveableUsualSetupEntryInput): UsualSetupEntryInput {
  if (!entry.serves) {
    return { ...entry, shiftSplit: NOT_SERVED_SPLIT, headcounts: [] };
  }
  if (entry.headcounts.length === 0) {
    throw new UsualSetupEmptyError();
  }
  assertValidShiftSplit({ shiftSplit: entry.shiftSplit });
  if (
    entry.shiftSplit.kind === 'manual' &&
    entry.shiftSplit.spans.length === 0
  ) {
    throw new InvalidShiftSplitError('manual split requires at least one span');
  }
  const shiftCount = shiftCountOf({ shiftSplit: entry.shiftSplit });
  for (const { shiftIndex } of entry.headcounts) {
    if (
      !Number.isInteger(shiftIndex) ||
      shiftIndex < 0 ||
      shiftIndex >= shiftCount
    ) {
      throw new InvalidShiftIndexError();
    }
  }
  return entry;
}

export interface AssertManualSplitFitsBlockInput {
  shiftSplit: UsualSetupShiftSplit;
  blockStartTime: TimeOfDay;
  blockEndTime: TimeOfDay;
}

/**
 * A manual split must be chronological, non-overlapping and inside the block,
 * judged by minutes after the block's start so overnight blocks and spans
 * need no dates. Touching endpoints and gaps are allowed.
 */
export function assertManualSplitFitsBlock({
  shiftSplit,
  blockStartTime,
  blockEndTime,
}: AssertManualSplitFitsBlockInput): void {
  if (shiftSplit.kind !== 'manual') return;
  const blockMinutes = timeOfDaySpan({
    start: blockStartTime,
    end: blockEndTime,
  }).durationMinutes;
  let previousEnd = 0;
  for (const span of shiftSplit.spans) {
    const start = timeOfDayOffset({ from: blockStartTime, to: span.startTime });
    const end =
      start +
      timeOfDaySpan({ start: span.startTime, end: span.endTime })
        .durationMinutes;
    if (end > blockMinutes) {
      throw new InvalidShiftSplitError('manual span must lie within the block');
    }
    if (start < previousEnd) {
      throw new InvalidShiftSplitError(
        'manual spans must be chronological and must not overlap',
      );
    }
    previousEnd = end;
  }
}

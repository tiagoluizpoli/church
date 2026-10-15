import { Entity, type LooseProps } from '@church/core';
import type { TimeOfDay } from '@church/time';
import type {
  ChurchId,
  MinistryId,
  RoleId,
  TeamId,
  TemplateTimeBlockId,
  UsualSetupId,
} from '../branded-ids';
import { InvalidRequiredCountError } from '../errors/invalid-required-count';
import { InvalidShiftSplitError } from '../errors/invalid-shift-split';

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

export interface UsualSetupHeadcount {
  roleId: RoleId;
  teamId?: TeamId;
  count: number;
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

    super(props as UsualSetupProps, id as UsualSetupId, createdAt, updatedAt);
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
    if (span.startTime >= span.endTime) {
      throw new InvalidShiftSplitError(
        'profile manual span start must precede its end',
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
  for (const headcount of headcounts) {
    if (!Number.isInteger(headcount.count) || headcount.count < 1) {
      throw new InvalidRequiredCountError();
    }
  }
}

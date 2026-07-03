import { Entity, type LooseProps } from '@church/core';
import type {
  ChurchId,
  MinistryId,
  MinistryServingProfileId,
  RoleId,
  TeamId,
  TimeBlockId,
} from '../branded-ids';
import { InvalidRequiredCountError } from '../errors/invalid-required-count';
import { InvalidShiftSplitError } from '../errors/invalid-shift-split';

export interface ServingProfileEqualSplit {
  kind: 'equal';
  count: number;
}

export interface ServingProfileManualSpan {
  label?: string;
  /** Time-of-day within the block's day, HH:mm. */
  startTime: string;
  endTime: string;
}

export interface ServingProfileManualSplit {
  kind: 'manual';
  spans: ServingProfileManualSpan[];
}

export type ServingProfileShiftSplit =
  | ServingProfileEqualSplit
  | ServingProfileManualSplit;

export interface ServingProfileHeadcount {
  roleId: RoleId;
  teamId?: TeamId;
  count: number;
}

export interface ServingProfileEntryInput {
  sourceTemplateBlockId: TimeBlockId;
  serves: boolean;
  shiftSplit: ServingProfileShiftSplit;
  headcounts: ServingProfileHeadcount[];
}

export interface MinistryServingProfileProps {
  churchId: ChurchId;
  ministryId: MinistryId;
  sourceTemplateBlockId: TimeBlockId;
  serves: boolean;
  shiftSplit: ServingProfileShiftSplit;
  headcounts: ServingProfileHeadcount[];
}

export interface MinistryServingProfileInput {
  props: LooseProps<MinistryServingProfileProps>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class MinistryServingProfile extends Entity<
  MinistryServingProfileProps,
  MinistryServingProfileId
> {
  constructor({
    props,
    id,
    createdAt,
    updatedAt,
  }: MinistryServingProfileInput) {
    assertValidShiftSplit({ shiftSplit: props.shiftSplit });
    assertValidHeadcounts({ headcounts: props.headcounts });

    super(
      props as MinistryServingProfileProps,
      id as MinistryServingProfileId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get ministryId(): MinistryId {
    return this._props.ministryId;
  }

  get sourceTemplateBlockId(): TimeBlockId {
    return this._props.sourceTemplateBlockId;
  }

  get serves(): boolean {
    return this._props.serves;
  }

  get shiftSplit(): ServingProfileShiftSplit {
    return this._props.shiftSplit;
  }

  get headcounts(): ServingProfileHeadcount[] {
    return this._props.headcounts;
  }
}

interface AssertValidShiftSplitInput {
  shiftSplit: ServingProfileShiftSplit;
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
  headcounts: ServingProfileHeadcount[];
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

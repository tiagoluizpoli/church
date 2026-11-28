import { instantSchema } from '@church/time';
import { z } from 'zod';
import { EventTimeBlockId } from '../../domain/branded-ids';
import type {
  PlanningEditPreview,
  PlanningEventGraph,
  PlanningMovePreview,
  PlanningMoveResult,
} from '../../domain/contracts/application/planning-event-manager';
import type { MoveClash } from '../../domain/services/planning/event-move.types';
import { dateFromInstantString } from '../utils/request-time';
import { eventMapper, eventResponseSchema } from './event.dto';
import {
  eventTimeBlockMapper,
  eventTimeBlockResponseSchema,
} from './event-time-block.dto';
import { idSchema } from './id.dto';
import { timeBlockPlaceFields, withOnePlace } from './time-block-place.dto';

const planningEventTimeBlockFieldsSchema = z.object({
  label: z.string().trim().min(1),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  isPublic: z.boolean().optional(),
  ...timeBlockPlaceFields,
});

/** A complete Draft Event: its fields and every Time block, saved together. */
/** Path params of a route nested under one planning Event of a Cycle. */
export const cycleEventParamsSchema = z.object({
  cycleId: idSchema,
  eventId: idSchema,
});

export const createPlanningEventBodySchema = z.object({
  title: z.string().trim().min(1),
  location: z.string().optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  eventTimeBlocks: z.array(withOnePlace(planningEventTimeBlockFieldsSchema)),
});

/**
 * The complete desired Draft Event: a block with `id` is retained and updated
 * in place, one without is created and an omitted persisted block is deleted.
 */
export const updatePlanningEventBodySchema = createPlanningEventBodySchema
  .omit({ eventTimeBlocks: true })
  .extend({
    eventTimeBlocks: z.array(
      withOnePlace(
        planningEventTimeBlockFieldsSchema.extend({
          id: idSchema.optional(),
        }),
      ),
    ),
  });

/** A Sent Event's details correction: title, optional location and the public fields of blocks. */
export const updatePlanningEventDetailsBodySchema = z.object({
  title: z.string().trim().min(1),
  location: z.string().optional(),
  eventTimeBlocks: z
    .array(
      withOnePlace(
        z.object({
          id: idSchema,
          isPublic: z.boolean(),
          ...timeBlockPlaceFields,
        }),
      ),
    )
    .optional(),
});

/** An Event with its EventTimeBlocks, as Cycle detail, create and edit return it. */
export const eventGraphResponseSchema = z.object({
  event: eventResponseSchema,
  eventTimeBlocks: z.array(eventTimeBlockResponseSchema),
});

export const eventGraphMapper = {
  toResponse(graph: PlanningEventGraph) {
    return {
      event: eventMapper.toResponse(graph.event),
      eventTimeBlocks: graph.eventTimeBlocks.map(
        eventTimeBlockMapper.toResponse,
      ),
    };
  },
};

/** The new start of the moved scope. */
export const movePlanningEventBodySchema = z.object({
  start: z.string().datetime(),
});

const instantBoundsResponseSchema = z.object({
  start: instantSchema,
  end: instantSchema,
});

/** A moved active Assignment that overlaps another active Assignment of its Volunteer. */
const moveClashResponseSchema = z.object({
  assignmentId: z.string(),
  eventTimeBlockId: z.string(),
  shiftId: z.string(),
  volunteer: z.object({ id: z.string(), name: z.string() }),
  ministry: z.object({ id: z.string(), name: z.string() }),
  proposedStart: instantSchema,
  proposedEnd: instantSchema,
});

function toMoveClashResponse({
  volunteerId,
  volunteerName,
  ministryId,
  ministryName,
  ...clash
}: MoveClash) {
  return {
    ...clash,
    volunteer: { id: volunteerId, name: volunteerName },
    ministry: { id: ministryId, name: ministryName },
  };
}

/** Proposed bounds and typed clash rows; nothing was written. */
export const eventMovePreviewResponseSchema = z.object({
  event: z.object({
    previous: instantBoundsResponseSchema,
    proposed: instantBoundsResponseSchema,
  }),
  eventTimeBlocks: z.array(
    z.object({
      id: z.string(),
      label: z.string().optional(),
      moved: z.boolean(),
      previous: instantBoundsResponseSchema,
      proposed: instantBoundsResponseSchema,
    }),
  ),
  clashes: z.array(moveClashResponseSchema),
});

export const eventMovePreviewMapper = {
  toResponse({ proposal, clashes }: PlanningMovePreview) {
    return {
      event: {
        previous: proposal.previousEvent,
        proposed: proposal.proposedEvent,
      },
      eventTimeBlocks: proposal.eventTimeBlocks.map(
        ({ eventTimeBlockId, label, moved, previous, proposed }) => ({
          id: eventTimeBlockId,
          label,
          moved,
          previous,
          proposed,
        }),
      ),
      clashes: clashes.map(toMoveClashResponse),
    };
  },
};

/** The moved Event graph and the Assignments confirm actually withdrew. */
export const eventMoveResponseSchema = eventGraphResponseSchema.extend({
  withdrawn: z.array(moveClashResponseSchema),
});

export const eventMoveMapper = {
  toResponse({ graph, withdrawn }: PlanningMoveResult) {
    return {
      ...eventGraphMapper.toResponse(graph),
      withdrawn: withdrawn.map(toMoveClashResponse),
    };
  },
};

/**
 * The complete proposed bounds and blocks of a sent Event: a block with `id`
 * keeps that block, one without is added and a left-out block is dropped.
 */
export const editPlanningEventBodySchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  eventTimeBlocks: z.array(
    z.object({
      id: idSchema.optional(),
      label: z.string().trim().min(1),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
    }),
  ),
});

export type EditPlanningEventBody = z.infer<typeof editPlanningEventBodySchema>;

type CreatePlanningEventBody = z.infer<typeof createPlanningEventBodySchema>;
type UpdatePlanningEventBody = z.infer<typeof updatePlanningEventBodySchema>;
type UpdatePlanningEventDetailsBody = z.infer<
  typeof updatePlanningEventDetailsBodySchema
>;

/** The one rule for a submitted block id: absent means a new block. */
function eventTimeBlockIdFromBody(id: string | undefined) {
  return id === undefined ? undefined : EventTimeBlockId.from(id);
}

/** A padded location is trimmed; a blank one is no location. */
function locationFromBody(location: string | undefined) {
  const trimmed = location?.trim();
  return trimmed ? trimmed : undefined;
}

type PlanningEventTimeBlockBody =
  CreatePlanningEventBody['eventTimeBlocks'][number];

function eventTimeBlockFromBody(block: PlanningEventTimeBlockBody) {
  return {
    label: block.label,
    startTime: dateFromInstantString({ value: block.startTime }),
    endTime: dateFromInstantString({ value: block.endTime }),
    isPublic: block.isPublic,
    place: block.place,
    placeAddressId: block.placeAddressId,
  };
}

/** Planning Event bodies as the manager reads them. */
export const planningEventBodyMapper = {
  create(body: CreatePlanningEventBody) {
    return {
      title: body.title,
      location: locationFromBody(body.location),
      start: dateFromInstantString({ value: body.start }),
      end: dateFromInstantString({ value: body.end }),
      eventTimeBlocks: body.eventTimeBlocks.map(eventTimeBlockFromBody),
    };
  },

  update(body: UpdatePlanningEventBody) {
    return {
      title: body.title,
      location: locationFromBody(body.location),
      start: dateFromInstantString({ value: body.start }),
      end: dateFromInstantString({ value: body.end }),
      eventTimeBlocks: body.eventTimeBlocks.map((block) => ({
        id: eventTimeBlockIdFromBody(block.id),
        ...eventTimeBlockFromBody(block),
      })),
    };
  },

  details(body: UpdatePlanningEventDetailsBody) {
    return {
      title: body.title,
      location: locationFromBody(body.location),
      eventTimeBlocks: body.eventTimeBlocks?.map((block) => ({
        ...block,
        id: EventTimeBlockId.from(block.id),
      })),
    };
  },

  /** The edit body: the same for preview and apply. */
  edit(body: EditPlanningEventBody) {
    return {
      start: dateFromInstantString({ value: body.start }),
      end: dateFromInstantString({ value: body.end }),
      eventTimeBlocks: body.eventTimeBlocks.map(
        ({ id, label, startTime, endTime }) => ({
          id: eventTimeBlockIdFromBody(id),
          label,
          startTime: dateFromInstantString({ value: startTime }),
          endTime: dateFromInstantString({ value: endTime }),
        }),
      ),
    };
  },
};

/** Proposed bounds, a row per block and typed clash rows; nothing was written. */
export const eventEditPreviewResponseSchema = z.object({
  event: z.object({
    previous: instantBoundsResponseSchema,
    proposed: instantBoundsResponseSchema,
  }),
  eventTimeBlocks: z.array(
    z.object({
      id: z.string().nullable(),
      label: z.string().optional(),
      change: z.enum(['kept', 'added', 'dropped']),
      previous: instantBoundsResponseSchema.nullable(),
      proposed: instantBoundsResponseSchema.nullable(),
    }),
  ),
  clashes: z.array(moveClashResponseSchema),
});

export const eventEditPreviewMapper = {
  toResponse({ proposal, clashes }: PlanningEditPreview) {
    return {
      event: {
        previous: proposal.previousEvent,
        proposed: proposal.proposedEvent,
      },
      eventTimeBlocks: proposal.eventTimeBlocks.map(
        ({ eventTimeBlockId, label, change, previous, proposed }) => ({
          id: eventTimeBlockId ?? null,
          label,
          change,
          previous: previous ?? null,
          proposed: proposed ?? null,
        }),
      ),
      clashes: clashes.map(toMoveClashResponse),
    };
  },
};

/** The typed gate: the locale's fixed word, trimmed and case-insensitive. */
export const cancelPlanningEventBodySchema = z.object({
  confirmation: z.string(),
  /** Also hide the cancelled scope; absent means shown. */
  hidden: z.boolean().optional(),
});

export const setPlanningHiddenBodySchema = z.object({ hidden: z.boolean() });

/** What a cancellation affects: preview and confirm both return it. */
export const cancellationImpactResponseSchema = z.object({
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('event') }),
    z.object({
      kind: z.literal('eventTimeBlock'),
      eventTimeBlockId: z.string(),
    }),
  ]),
  eventId: z.string(),
  eventTitle: z.string(),
  /** The selected scope's own bounds. */
  start: instantSchema,
  end: instantSchema,
  /** Distinct published Volunteers told now. */
  volunteerCount: z.number().int().nonnegative(),
  /** Ministries those Volunteers span. */
  ministryCount: z.number().int().nonnegative(),
  /** Every participating Ministry with its told count, possibly 0. */
  ministries: z.array(
    z.object({
      ministryId: z.string(),
      ministryName: z.string(),
      volunteerCount: z.number().int().nonnegative(),
    }),
  ),
  openSwapRequestCount: z.number().int().nonnegative(),
});

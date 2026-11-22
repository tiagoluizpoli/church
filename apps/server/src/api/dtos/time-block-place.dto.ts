import { z } from 'zod';

/**
 * The place of a TemplateTimeBlock or EventTimeBlock: a Church Address of the
 * same Church (`placeAddressId`), short free text (`place`), or nothing. An
 * empty place is stored as none.
 */
export const timeBlockPlaceFields = {
  place: z.string().trim().max(120).optional(),
  placeAddressId: z.string().uuid().toLowerCase().nullable().optional(),
};

interface PlaceFields {
  place?: string;
  placeAddressId?: string | null;
}

/** Refuses a block that names its place both as an address and as free text. */
export function withOnePlace<T extends z.ZodType<PlaceFields>>(schema: T) {
  return schema.refine((block) => !(block.place && block.placeAddressId), {
    message: 'Give the place as a Church Address or as free text, not both',
    path: ['placeAddressId'],
  });
}

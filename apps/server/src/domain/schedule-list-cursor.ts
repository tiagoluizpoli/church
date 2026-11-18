import { decodeListCursor, encodeListCursor } from './list-cursor';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Current Schedules take buckets 0..4 by stage rank; every Past Schedule shares the last one. */
export const SCHEDULE_LIST_PAST_BUCKET = 5;

/** A Schedule's place in the list order; the order is total over these fields. */
export interface ScheduleListPosition {
  bucket: number;
  startDate: string;
  endDate: string;
  cycleId: string;
  ministryNameKey: string;
  ministryId: string;
}

/** Opaque, URL-safe position. */
export function encodeScheduleListCursor({
  bucket,
  startDate,
  endDate,
  cycleId,
  ministryId,
  ministryNameKey,
}: ScheduleListPosition): string {
  return encodeListCursor({
    owner: 'schedules',
    fields: [
      String(bucket),
      startDate,
      endDate,
      cycleId,
      ministryId,
      ministryNameKey,
    ],
  });
}

export interface DecodeScheduleListCursorInput {
  cursor: string;
}

/** Returns undefined for anything `encodeScheduleListCursor` could not have produced. */
export function decodeScheduleListCursor({
  cursor,
}: DecodeScheduleListCursorInput): ScheduleListPosition | undefined {
  const fields = decodeListCursor({ owner: 'schedules', cursor, size: 6 });
  if (!fields) return undefined;
  const [bucketText, startDate, endDate, cycleId, ministryId, ministryNameKey] =
    fields;
  const bucket = /^\d$/.test(bucketText ?? '') ? Number(bucketText) : -1;
  if (
    bucket < 0 ||
    bucket > SCHEDULE_LIST_PAST_BUCKET ||
    !CALENDAR_DAY.test(startDate ?? '') ||
    !CALENDAR_DAY.test(endDate ?? '') ||
    !UUID.test(cycleId ?? '') ||
    !UUID.test(ministryId ?? '')
  ) {
    return undefined;
  }
  return {
    bucket,
    startDate: startDate as string,
    endDate: endDate as string,
    cycleId: cycleId as string,
    ministryId: ministryId as string,
    ministryNameKey: ministryNameKey as string,
  };
}

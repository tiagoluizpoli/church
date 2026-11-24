interface IsCancelledEventTimeBlockInput {
  eventStatus: string;
  eventTimeBlockStatus: string;
}

/** Cancelling an Event leaves its blocks active, so a block is cancelled by either. */
export function isCancelledEventTimeBlock({
  eventStatus,
  eventTimeBlockStatus,
}: IsCancelledEventTimeBlockInput): boolean {
  return eventStatus === 'cancelled' || eventTimeBlockStatus === 'cancelled';
}

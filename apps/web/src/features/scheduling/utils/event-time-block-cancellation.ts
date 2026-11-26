interface IsCancelledEventInput {
  eventStatus: string;
}

export function isCancelledEvent({ eventStatus }: IsCancelledEventInput) {
  return eventStatus === 'cancelled';
}

interface IsCancelledEventTimeBlockInput extends IsCancelledEventInput {
  eventTimeBlockStatus: string;
}

/** Cancelling an Event leaves its blocks active, so a block is cancelled by either. */
export function isCancelledEventTimeBlock({
  eventStatus,
  eventTimeBlockStatus,
}: IsCancelledEventTimeBlockInput): boolean {
  return (
    isCancelledEvent({ eventStatus }) || eventTimeBlockStatus === 'cancelled'
  );
}

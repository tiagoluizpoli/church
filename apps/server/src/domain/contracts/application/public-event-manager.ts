import type { Instant } from '@church/time';
import type { ChurchId } from '../../branded-ids';
import type {
  PublicEventCursor,
  PublicEventPage,
} from '../../entities/public-event';

export interface ListPublicEventsInput {
  churchId: ChurchId;
  /** Items past at this instant are dropped. */
  now: Instant;
  limit: number;
  after?: PublicEventCursor;
}

export interface IPublicEventManager {
  listPublicEvents(input: ListPublicEventsInput): Promise<PublicEventPage>;
}

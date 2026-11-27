import type { Instant } from '@church/time';
import type { ChurchId } from '../../branded-ids';
import type {
  PublicEventCursor,
  PublicEventPage,
} from '../../entities/public-event';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { PublicEventRepository } from '@/domain/contracts/infrastructure/public-event.repository';

export interface ListPublicEventsInput {
  churchId: ChurchId;
  /** Items past at this instant are dropped. */
  now: Instant;
  limit: number;
  after?: PublicEventCursor;
}

export interface ListPublicEventsBySlugInput {
  /** A live or old Church Slug, as the visitor typed it. */
  slug: string;
  after?: PublicEventCursor;
}

export interface PublicChurchEvents {
  timezone: string;
  page: PublicEventPage;
}

export interface IPublicEventManager {
  /** `null` when no Church ever held the slug. */
  listPublicEventsBySlug(
    input: ListPublicEventsBySlugInput,
  ): Promise<PublicChurchEvents | null>;
  listPublicEvents(input: ListPublicEventsInput): Promise<PublicEventPage>;
}

export interface DbPublicEventManagerDependencies {
  publicEventRepository: PublicEventRepository;
  churchRepository: ChurchRepository;
}

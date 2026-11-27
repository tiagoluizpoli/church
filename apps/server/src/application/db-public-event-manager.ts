import { now } from '@church/time';
import type {
  DbPublicEventManagerDependencies,
  IPublicEventManager,
  ListPublicEventsBySlugInput,
  ListPublicEventsInput,
  PublicChurchEvents,
} from '../domain/contracts/application/public-event-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { PublicEventRepository } from '../domain/contracts/infrastructure/public-event.repository';
import type { PublicEventPage } from '../domain/entities/public-event';

const PUBLIC_EVENTS_PAGE_SIZE = 20;

/** Public Events: public blocks of sent-Cycle Events, readable without a session. */
export class DbPublicEventManager implements IPublicEventManager {
  private readonly publicEventRepository: PublicEventRepository;
  private readonly churchRepository: ChurchRepository;

  constructor({
    publicEventRepository,
    churchRepository,
  }: DbPublicEventManagerDependencies) {
    this.publicEventRepository = publicEventRepository;
    this.churchRepository = churchRepository;
  }

  listPublicEvents(input: ListPublicEventsInput): Promise<PublicEventPage> {
    return this.publicEventRepository.listPublicEvents(input);
  }

  async listPublicEventsBySlug({
    slug,
    after,
  }: ListPublicEventsBySlugInput): Promise<PublicChurchEvents | null> {
    const identity = await this.churchRepository.findPublicIdentityBySlug({
      slug,
    });
    if (!identity) return null;
    const { churchId, timezone } = identity;
    const page = await this.publicEventRepository.listPublicEvents({
      churchId,
      now: now(),
      limit: PUBLIC_EVENTS_PAGE_SIZE,
      after,
    });
    return { timezone, page };
  }
}

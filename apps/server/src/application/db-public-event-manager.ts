import type {
  IPublicEventManager,
  ListPublicEventsInput,
} from '../domain/contracts/application/public-event-manager';
import type { PublicEventRepository } from '../domain/contracts/infrastructure/public-event.repository';
import type { PublicEventPage } from '../domain/entities/public-event';

interface DbPublicEventManagerDependencies {
  publicEventRepository: PublicEventRepository;
}

/** Public Events: public blocks of sent-Cycle Events, no public endpoint yet. */
export class DbPublicEventManager implements IPublicEventManager {
  private readonly publicEventRepository: PublicEventRepository;

  constructor({ publicEventRepository }: DbPublicEventManagerDependencies) {
    this.publicEventRepository = publicEventRepository;
  }

  listPublicEvents(input: ListPublicEventsInput): Promise<PublicEventPage> {
    return this.publicEventRepository.listPublicEvents(input);
  }
}

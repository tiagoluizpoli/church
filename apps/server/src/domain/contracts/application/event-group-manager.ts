import type { ChurchId, MinistryId } from '../../branded-ids';
import type {
  EventGroupRepository,
  EventGroupSetup,
  EventGroupTemplate,
  SavedEventGroup,
} from '@/domain/contracts/infrastructure/event-group.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';

export interface ReadEventGroupsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
}

export interface SaveEventGroupsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  groups: SavedEventGroup[];
  catchAllName: string | null;
}

/** The setup and every EventTemplate the tab can put in a group. */
export interface EventGroupsView extends EventGroupSetup {
  templates: EventGroupTemplate[];
}

/**
 * A Ministry's Event groups. Callers have already admitted the manager; each
 * EventTemplate sits in at most one group.
 */
export interface IEventGroupManager {
  read(input: ReadEventGroupsInput): Promise<EventGroupsView>;
  /** Last save wins. `NotFoundError` for a template outside the Church. */
  save(input: SaveEventGroupsInput): Promise<EventGroupsView>;
}

export interface DbEventGroupManagerDependencies {
  eventGroupRepository: EventGroupRepository;
  unitOfWork: UnitOfWork;
}

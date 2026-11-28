import type { ChurchId, MinistryId } from '../../branded-ids';
import type { TransactionContext } from './transaction-context';

/** An EventTemplate as the Event group tab names it. */
export interface EventGroupTemplate {
  id: string;
  name: string;
}

/** A named Event group with its EventTemplates, in the leader's order. */
export interface EventGroup {
  name: string;
  templates: EventGroupTemplate[];
}

/**
 * A Ministry's Event groups in order. No groups means one plain list; the
 * catch-all is never a group, only its custom name is kept.
 */
export interface EventGroupSetup {
  groups: EventGroup[];
  /** Null keeps the default name. */
  catchAllName: string | null;
}

export interface EventGroupScopeInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

export interface ListChurchEventTemplatesInput {
  churchId: ChurchId;
  tx?: TransactionContext;
}

/** A group as saved: its name and its EventTemplates' ids, in order. */
export interface SavedEventGroup {
  name: string;
  templateIds: string[];
}

export interface ReplaceEventGroupSetupInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  groups: SavedEventGroup[];
  catchAllName: string | null;
  tx: TransactionContext;
}

/** A Ministry's saved Event groups (#1247). */
export interface EventGroupRepository {
  findSetup(input: EventGroupScopeInput): Promise<EventGroupSetup>;
  /** Every EventTemplate of the Church, alphabetical ignoring case. */
  listChurchTemplates(
    input: ListChurchEventTemplatesInput,
  ): Promise<EventGroupTemplate[]>;
  /** Replaces the whole setup; concurrent saves run one after another. */
  replaceSetup(input: ReplaceEventGroupSetupInput): Promise<void>;
}

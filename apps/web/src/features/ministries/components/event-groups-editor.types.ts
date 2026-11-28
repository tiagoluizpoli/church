import type {
  GetEventGroups200,
  GetEventGroups200TemplatesItem,
} from '@/infrastructure/api/churchAPI.schemas';

export type Template = GetEventGroups200TemplatesItem;

export type Mode = 'single' | 'split';

/** A group being edited; `key` stays put while the leader renames or moves it. */
export interface DraftGroup {
  key: number;
  name: string;
  templateIds: string[];
}

export interface GroupChange {
  key: number;
  change: (group: DraftGroup) => DraftGroup;
}

export interface TemplateAddition {
  key: number;
  templateId: string;
}

export interface GroupMove {
  index: number;
  by: number;
}

export interface EventGroupsEditorProps {
  ministryId: string;
  /** The Schedule the leader came from, to link back and reopen the export. */
  cycleId?: string;
}

export interface EventGroupsFormProps {
  ministryId: string;
  saved: GetEventGroups200;
}

export interface GroupCardProps {
  group: DraftGroup;
  first: boolean;
  last: boolean;
  groups: DraftGroup[];
  templates: Template[];
  templateById: Map<string, Template>;
  onRename: (name: string) => void;
  onAddTemplate: (templateId: string) => void;
  onRemoveTemplate: (templateId: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

export interface CatchAllCardProps {
  name: string;
  onRename: (name: string) => void;
}

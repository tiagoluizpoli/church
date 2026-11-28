import { m } from '@church/i18n/messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import type {
  CatchAllCardProps,
  DraftGroup,
  EventGroupsEditorProps,
  EventGroupsFormProps,
  GroupCardProps,
  GroupChange,
  GroupMove,
  Mode,
  TemplateAddition,
} from './event-groups-editor.types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pending } from '@/components/ui/pending';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  eventGroupsQueryKey,
  useEventGroups,
} from '@/features/ministries/ministry-queries';
import { useCallerCapabilitiesScope } from '@/shared/components/caller-capabilities-scope';
import { adminApi } from '@/utils/api-instances';

/**
 * The Ministry's "Grupos de eventos" tab (#1247): one plain list, or named
 * groups of EventTemplates with the catch-all fixed last. Saved whole.
 */
export function EventGroupsEditor({
  ministryId,
  cycleId,
}: EventGroupsEditorProps) {
  const query = useEventGroups({ ministryId });
  const back = cycleId ? (
    <Link
      to="/app/schedules/$ministryId/$cycleId"
      params={{ ministryId, cycleId }}
      search={{ export: true }}
      className="text-sm underline underline-offset-2"
    >
      {m.event_groups_back_to_schedule()}
    </Link>
  ) : null;
  if (query.isPending) {
    return (
      <Pending label={m.event_groups_loading()} className="space-y-3">
        <Skeleton className="h-8 w-full max-w-96" />
        <Skeleton className="h-24 w-full" />
      </Pending>
    );
  }
  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{m.event_groups_load_failed()}</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="max-w-3xl space-y-5">
      {back}
      <EventGroupsForm ministryId={ministryId} saved={query.data} />
    </div>
  );
}

function EventGroupsForm({ ministryId, saved }: EventGroupsFormProps) {
  const queryClient = useQueryClient();
  const churchId = useCallerCapabilitiesScope()?.churchId;
  const nextKey = useRef(saved.groups.length);
  const [mode, setMode] = useState<Mode>(
    saved.groups.length > 0 ? 'split' : 'single',
  );
  const [groups, setGroups] = useState<DraftGroup[]>(() =>
    saved.groups.map((group, key) => ({
      key,
      name: group.name,
      templateIds: group.templates.map((template) => template.id),
    })),
  );
  const [catchAllName, setCatchAllName] = useState(saved.catchAllName ?? '');
  const [nameMissing, setNameMissing] = useState(false);
  const templateById = new Map(
    saved.templates.map((template) => [template.id, template]),
  );

  const save = useMutation({
    mutationFn: () =>
      adminApi.saveEventGroups(ministryId, {
        groups:
          mode === 'single'
            ? []
            : groups.map((group) => ({
                name: group.name.trim(),
                templateIds: group.templateIds,
              })),
        catchAllName: catchAllName.trim() || null,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(
        eventGroupsQueryKey({ churchId, ministryId }),
        data,
      );
      toast.success(m.event_groups_saved());
    },
    onError: () => toast.error(m.event_groups_save_failed()),
  });

  function addGroup() {
    setGroups((current) => [
      ...current,
      {
        key: nextKey.current++,
        name: m.event_groups_new_group_name(),
        templateIds: [],
      },
    ]);
  }

  function changeMode(next: Mode) {
    setMode(next);
    if (next === 'split' && groups.length === 0) addGroup();
  }

  function update({ key, change }: GroupChange) {
    setGroups((current) =>
      current.map((group) => (group.key === key ? change(group) : group)),
    );
  }

  /** Adds the template to this group, taking it out of the one it was in. */
  function addTemplate({ key, templateId }: TemplateAddition) {
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        templateIds:
          group.key === key
            ? [...group.templateIds, templateId]
            : group.templateIds.filter((id) => id !== templateId),
      })),
    );
  }

  function move({ index, by }: GroupMove) {
    setGroups((current) => {
      const next = [...current];
      const [group] = next.splice(index, 1);
      if (group) next.splice(index + by, 0, group);
      return next;
    });
  }

  function submit() {
    const unnamed =
      mode === 'split' && groups.some((group) => group.name.trim() === '');
    setNameMissing(unnamed);
    if (!unnamed) save.mutate();
  }

  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm">{m.event_groups_intro()}</p>
      <RadioGroup
        aria-label={m.event_groups_mode_label()}
        value={mode}
        onValueChange={(next) => changeMode(next as Mode)}
        className="gap-2"
      >
        {(['single', 'split'] as const).map((option) => (
          <div key={option} className="flex items-start gap-3">
            <RadioGroupItem
              value={option}
              id={`event-groups-mode-${option}`}
              aria-describedby={`event-groups-mode-${option}-hint`}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label
                htmlFor={`event-groups-mode-${option}`}
                className="font-medium text-sm"
              >
                {option === 'single'
                  ? m.event_groups_mode_single()
                  : m.event_groups_mode_split()}
              </Label>
              <p
                id={`event-groups-mode-${option}-hint`}
                className="text-muted-foreground text-xs"
              >
                {option === 'single'
                  ? m.event_groups_mode_single_hint()
                  : m.event_groups_mode_split_hint()}
              </p>
            </div>
          </div>
        ))}
      </RadioGroup>

      {mode === 'split' ? (
        <div className="space-y-3">
          {groups.map((group, index) => (
            <GroupCard
              key={group.key}
              group={group}
              first={index === 0}
              last={index === groups.length - 1}
              groups={groups}
              templates={saved.templates}
              templateById={templateById}
              onRename={(name) =>
                update({ key: group.key, change: (g) => ({ ...g, name }) })
              }
              onAddTemplate={(templateId) =>
                addTemplate({ key: group.key, templateId })
              }
              onRemoveTemplate={(templateId) =>
                update({
                  key: group.key,
                  change: (g) => ({
                    ...g,
                    templateIds: g.templateIds.filter(
                      (id) => id !== templateId,
                    ),
                  }),
                })
              }
              onMoveUp={() => move({ index, by: -1 })}
              onMoveDown={() => move({ index, by: 1 })}
              onDelete={() =>
                setGroups((current) =>
                  current.filter((g) => g.key !== group.key),
                )
              }
            />
          ))}
          <Button
            type="button"
            variant="outline"
            className="min-h-11 md:min-h-8"
            onClick={addGroup}
          >
            {m.event_groups_add_group()}
          </Button>
          <CatchAllCard name={catchAllName} onRename={setCatchAllName} />
        </div>
      ) : null}

      {nameMissing ? (
        <p role="alert" className="text-destructive text-sm">
          {m.event_groups_name_required()}
        </p>
      ) : null}
      <Button
        type="button"
        className="min-h-11 md:min-h-8"
        disabled={save.isPending}
        onClick={submit}
      >
        {save.isPending ? <Spinner /> : null}
        {m.event_groups_save()}
      </Button>
    </div>
  );
}

function GroupCard({
  group,
  first,
  last,
  groups,
  templates,
  templateById,
  onRename,
  onAddTemplate,
  onRemoveTemplate,
  onMoveUp,
  onMoveDown,
  onDelete,
}: GroupCardProps) {
  const nameId = useId();
  const choices = templates.filter(
    (template) => !group.templateIds.includes(template.id),
  );
  const ownerOf = (templateId: string) =>
    groups.find((other) => other.templateIds.includes(templateId));
  const label = group.name;
  return (
    <fieldset
      aria-label={label}
      className="radius-surface min-w-0 space-y-3 border border-border p-3"
    >
      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label htmlFor={nameId}>{m.event_groups_group_name_label()}</Label>
          <Input
            id={nameId}
            value={group.name}
            onChange={(event) => onRename(event.target.value)}
            maxLength={255}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={first}
          aria-label={m.event_groups_move_up({ group: label })}
          onClick={onMoveUp}
        >
          <ArrowUpIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={last}
          aria-label={m.event_groups_move_down({ group: label })}
          onClick={onMoveDown}
        >
          <ArrowDownIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={m.event_groups_delete_group({ group: label })}
          onClick={onDelete}
        >
          <Trash2Icon />
        </Button>
      </div>
      {group.templateIds.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {m.event_groups_no_templates()}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {group.templateIds.map((templateId) => {
            const name = templateById.get(templateId)?.name ?? '';
            return (
              <li
                key={templateId}
                className="flex items-center gap-1 rounded-full border border-border bg-muted py-0.5 ps-3 pe-1 text-sm"
              >
                {name}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={m.event_groups_remove_template({
                    template: name,
                    group: label,
                  })}
                  onClick={() => onRemoveTemplate(templateId)}
                >
                  <XIcon />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <Select
        value={null}
        disabled={choices.length === 0}
        onValueChange={(templateId) => {
          if (typeof templateId === 'string') onAddTemplate(templateId);
        }}
      >
        <SelectTrigger
          aria-label={m.event_groups_add_template()}
          className="min-h-11 w-full md:min-h-0 md:w-72"
        >
          <SelectValue placeholder={m.event_groups_add_template()} />
        </SelectTrigger>
        <SelectContent>
          {choices.map((template) => {
            const owner = ownerOf(template.id);
            return (
              <SelectItem key={template.id} value={template.id}>
                {owner
                  ? m.event_groups_template_moves({
                      template: template.name,
                      group: owner.name,
                    })
                  : template.name}
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </fieldset>
  );
}

/** Every Event no group holds; always last, renamable, never deleted. */
function CatchAllCard({ name, onRename }: CatchAllCardProps) {
  const nameId = useId();
  return (
    <fieldset
      aria-label={m.event_groups_catch_all_title()}
      className="radius-surface min-w-0 space-y-2 border border-border border-dashed p-3"
    >
      <h3 className="font-medium text-sm">
        {m.event_groups_catch_all_title()}
      </h3>
      <p className="text-muted-foreground text-xs">
        {m.event_groups_catch_all_hint()}
      </p>
      <div className="space-y-1">
        <Label htmlFor={nameId}>{m.event_groups_catch_all_name_label()}</Label>
        <Input
          id={nameId}
          value={name}
          placeholder={m.export_catch_all_default()}
          onChange={(event) => onRename(event.target.value)}
          maxLength={255}
        />
      </div>
    </fieldset>
  );
}

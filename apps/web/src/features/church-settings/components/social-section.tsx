import {
  detectSocialNetwork,
  SOCIAL_NETWORK_KEYS,
  SOCIAL_NETWORKS,
  type SocialNetwork,
} from '@church/domain-rules/social-networks';
import { m } from '@church/i18n/messages';
import { ArrowDown, ArrowUp, Link2, Plus, Trash2, Type } from 'lucide-react';
import * as React from 'react';
import { IconInputField } from '@/components/icon-input-field';
import { networkIcon } from '@/components/social-network-icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SocialLinkDraft } from '@/features/church-settings/church-settings-form';
import { GroupField } from '@/features/church-settings/components/group-field';
import { useControlSizes } from '@/features/church-settings/use-control-sizes';

type FieldErrors = Record<string, string>;

interface DetectedNetworkInput {
  url: string;
}

/** The network a typed URL belongs to, or `null` while it is empty, unfinished or refused; the row's selector shows this and nothing else. */
export function detectedNetwork({
  url,
}: DetectedNetworkInput): SocialNetwork | null {
  const detection = detectSocialNetwork({ url });
  return 'network' in detection ? detection.network : null;
}

interface SwitchNetworkInput {
  url: string;
  to: SocialNetwork;
}

/** The link once a network is picked on its row: an empty or untouched link takes the network's address start, a handle typed after the current start moves to the new one, and anything else stays as typed. */
export function switchNetwork({ url, to }: SwitchNetworkInput): string {
  const typed = url.trim();
  const starts = SOCIAL_NETWORK_KEYS.map((key) => SOCIAL_NETWORKS[key].prefix);
  if (typed === '' || starts.some((start) => start === typed)) {
    return SOCIAL_NETWORKS[to].prefix;
  }
  const from = detectedNetwork({ url });
  const start = from ? SOCIAL_NETWORKS[from].prefix : null;
  if (from === to || !start || !url.startsWith(start)) return url;
  return SOCIAL_NETWORKS[to].prefix + url.slice(start.length);
}

interface RowErrorsInput {
  errors: FieldErrors;
  index: number;
}

/** The refusals of one row, keyed by field name (`socialLinks.2.url` → `url`). */
function rowErrors({ errors, index }: RowErrorsInput): FieldErrors {
  const prefix = `socialLinks.${index}.`;
  return Object.fromEntries(
    Object.entries(errors)
      .filter(([field]) => field.startsWith(prefix))
      .map(([field, message]) => [field.slice(prefix.length), message]),
  );
}

interface MoveInput {
  index: number;
  by: -1 | 1;
}

interface SocialSectionProps {
  links: SocialLinkDraft[];
  /** The existing Contact Groups, suggested on each row. */
  groups: string[];
  errors: FieldErrors;
  onChange: (links: SocialLinkDraft[]) => void;
}

/** The Church's Social Links: always public, staged into the screen's save bar. */
export function SocialSection({
  links,
  groups,
  errors,
  onChange,
}: SocialSectionProps) {
  const sizes = useControlSizes();
  const counter = React.useRef(0);

  const add = (url: string) => {
    counter.current += 1;
    onChange([
      ...links,
      { key: `new-${counter.current}`, url, description: '', group: '' },
    ]);
  };

  const update = ({ key, changes }: UpdateInput) =>
    onChange(
      links.map((link) => (link.key === key ? { ...link, ...changes } : link)),
    );

  const move = ({ index, by }: MoveInput) => {
    const next = [...links];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row as SocialLinkDraft);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {m.church_settings_social_public_note()}{' '}
        {links.length ? m.church_settings_group_note() : null}
      </p>
      {links.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed p-4">
          <p className="text-muted-foreground text-sm">
            {m.church_settings_social_empty()}
          </p>
          <AddMenu onAdd={add} />
        </div>
      ) : (
        <>
          {/* One line per link once the list is wide enough; narrower, the link takes its own full-width line. */}
          <ul className="@container divide-y rounded-lg border">
            {links.map((link, index) => {
              const network = detectedNetwork({ url: link.url });
              const name = network
                ? SOCIAL_NETWORKS[network].label
                : m.church_settings_social_untitled({ position: index + 1 });
              const own = rowErrors({ errors, index });
              return (
                <li
                  key={link.key}
                  className="grid @5xl:grid-cols-[minmax(0,0.8fr)_11rem_minmax(0,1.5fr)_minmax(0,1fr)_auto] grid-cols-[minmax(0,1fr)_10rem] items-end gap-x-3 gap-y-2 p-3"
                >
                  <GroupField
                    value={link.group}
                    suggestions={groups}
                    rowLabel={String(index + 1)}
                    error={own.group}
                    onChange={(group) =>
                      update({ key: link.key, changes: { group } })
                    }
                  />
                  <div className="flex flex-col gap-1.5">
                    <Label className="font-medium text-sm">
                      {m.church_settings_social_network()}
                    </Label>
                    <Select
                      value={network ?? ''}
                      onValueChange={(next) => {
                        if (!isSocialNetwork(next)) return;
                        const url = switchNetwork({ url: link.url, to: next });
                        if (url !== link.url)
                          update({ key: link.key, changes: { url } });
                      }}
                    >
                      <SelectTrigger
                        aria-label={`${m.church_settings_social_network()} ${index + 1}`}
                        className="w-full"
                      >
                        <SelectValue
                          placeholder={m.church_settings_social_network_unknown()}
                        >
                          {network ? (
                            <NetworkLabel network={network} />
                          ) : undefined}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {SOCIAL_NETWORK_KEYS.map((key) => (
                          <SelectItem key={key} value={key}>
                            <NetworkLabel network={key} />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="@5xl:col-span-1 col-span-2">
                    <IconInputField
                      icon={Link2}
                      label={m.church_settings_social_url()}
                      aria-label={`${m.church_settings_social_url()} ${index + 1}`}
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={link.url}
                      title={link.url || undefined}
                      className="truncate"
                      error={own.url}
                      onChange={(event) =>
                        update({
                          key: link.key,
                          changes: { url: event.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="col-span-2 flex @5xl:contents flex-wrap items-end gap-x-3 gap-y-2">
                    <div className="min-w-48 flex-1">
                      <IconInputField
                        icon={Type}
                        label={m.church_settings_social_description()}
                        aria-label={`${m.church_settings_social_description()} ${index + 1}`}
                        placeholder={m.church_settings_social_description_placeholder()}
                        hint={m.church_settings_social_description_hint()}
                        hideHint
                        value={link.description}
                        error={own.description}
                        onChange={(event) =>
                          update({
                            key: link.key,
                            changes: { description: event.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center">
                      <Button
                        variant="ghost"
                        size={sizes.icon}
                        aria-label={m.church_settings_social_move_up({ name })}
                        disabled={index === 0}
                        onClick={() => move({ index, by: -1 })}
                      >
                        <ArrowUp aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size={sizes.icon}
                        aria-label={m.church_settings_social_move_down({
                          name,
                        })}
                        disabled={index === links.length - 1}
                        onClick={() => move({ index, by: 1 })}
                      >
                        <ArrowDown aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size={sizes.icon}
                        aria-label={m.church_settings_social_delete({ name })}
                        onClick={() =>
                          onChange(links.filter((row) => row.key !== link.key))
                        }
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <AddMenu onAdd={add} />
        </>
      )}
    </div>
  );
}

interface UpdateInput {
  key: string;
  changes: Partial<SocialLinkDraft>;
}

interface AddMenuProps {
  onAdd: (url: string) => void;
}

/** *+ Rede social*: pick a network (its address start is pre-filled) or paste a link. */
function AddMenu({ onAdd }: AddMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Plus aria-hidden /> {m.church_settings_social_add()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {SOCIAL_NETWORK_KEYS.map((key) => (
          <DropdownMenuItem
            key={key}
            onClick={() => onAdd(SOCIAL_NETWORKS[key].prefix)}
          >
            <NetworkLabel network={key} />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAdd('')}>
          {m.church_settings_social_paste()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function isSocialNetwork(value: unknown): value is SocialNetwork {
  return SOCIAL_NETWORK_KEYS.some((key) => key === value);
}

interface NetworkLabelProps {
  network: SocialNetwork;
}

/** A network's icon and name, as the menu, the options and the picked value show it. */
function NetworkLabel({ network }: NetworkLabelProps) {
  const Icon = networkIcon({ network });
  return (
    <>
      <Icon aria-hidden className="size-4" />
      {SOCIAL_NETWORKS[network].label}
    </>
  );
}

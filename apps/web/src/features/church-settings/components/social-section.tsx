import {
  detectSocialNetwork,
  SOCIAL_NETWORK_KEYS,
  SOCIAL_NETWORKS,
  type SocialNetwork,
} from '@church/app-config/social-networks';
import { m } from '@church/i18n/messages';
import { ArrowDown, ArrowUp, Link2, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { IconInputField } from '@/components/icon-input-field';
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
  errors: FieldErrors;
  onChange: (links: SocialLinkDraft[]) => void;
}

/** The Church's Social Links: always public, staged into the screen's save bar. */
export function SocialSection({ links, errors, onChange }: SocialSectionProps) {
  const counter = React.useRef(0);

  const add = (url: string) => {
    counter.current += 1;
    onChange([
      ...links,
      { key: `new-${counter.current}`, url, description: '' },
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
        {m.church_settings_social_public_note()}
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
          <ul className="divide-y rounded-lg border">
            {links.map((link, index) => {
              const network = detectedNetwork({ url: link.url });
              const name = network
                ? SOCIAL_NETWORKS[network].label
                : m.church_settings_social_untitled({ position: index + 1 });
              const own = rowErrors({ errors, index });
              return (
                <li key={link.key} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="w-44 space-y-1.5">
                      <Label className="font-medium text-sm">
                        {m.church_settings_social_network()}
                      </Label>
                      <Select
                        value={network ?? ''}
                        onValueChange={(next) =>
                          update({
                            key: link.key,
                            changes: {
                              url: SOCIAL_NETWORKS[next as SocialNetwork]
                                .prefix,
                            },
                          })
                        }
                      >
                        <SelectTrigger
                          aria-label={`${m.church_settings_social_network()} ${index + 1}`}
                          className="w-full"
                        >
                          <SelectValue
                            placeholder={m.church_settings_social_network_unknown()}
                          >
                            {network
                              ? SOCIAL_NETWORKS[network].label
                              : undefined}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {SOCIAL_NETWORK_KEYS.map((key) => (
                            <SelectItem key={key} value={key}>
                              {SOCIAL_NETWORKS[key].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="min-w-56 flex-1">
                      <IconInputField
                        icon={Link2}
                        label={m.church_settings_social_url()}
                        aria-label={`${m.church_settings_social_url()} ${index + 1}`}
                        inputMode="url"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={link.url}
                        error={own.url}
                        onChange={(event) =>
                          update({
                            key: link.key,
                            changes: { url: event.target.value },
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-56 flex-1">
                      <IconInputField
                        icon={Link2}
                        label={m.church_settings_social_description()}
                        aria-label={`${m.church_settings_social_description()} ${index + 1}`}
                        hint={m.church_settings_social_description_hint()}
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
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={m.church_settings_social_move_up({ name })}
                        disabled={index === 0}
                        onClick={() => move({ index, by: -1 })}
                      >
                        <ArrowUp aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
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
                        size="icon"
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
            {SOCIAL_NETWORKS[key].label}
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

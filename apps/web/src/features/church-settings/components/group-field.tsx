import { m } from '@church/i18n/messages';
import { Users } from 'lucide-react';
import * as React from 'react';
import { IconInputField } from '@/components/icon-input-field';

interface GroupFieldProps {
  value: string;
  /** The existing groups, suggested while typing; a new name creates one. */
  suggestions: string[];
  error?: string;
  /** Names the row for assistive tech, e.g. its position. */
  rowLabel: string;
  onChange: (group: string) => void;
}

/** *Pessoa ou ministério*: free text with the Church's groups suggested. */
export function GroupField({
  value,
  suggestions,
  error,
  rowLabel,
  onChange,
}: GroupFieldProps) {
  const listId = React.useId();
  return (
    <>
      <IconInputField
        icon={Users}
        label={m.church_settings_group_label()}
        aria-label={`${m.church_settings_group_label()} ${rowLabel}`}
        placeholder={m.church_settings_group_placeholder()}
        hint={m.church_settings_group_hint()}
        list={listId}
        autoComplete="off"
        value={value}
        error={error}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}

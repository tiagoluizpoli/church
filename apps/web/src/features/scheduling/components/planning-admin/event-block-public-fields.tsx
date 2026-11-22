import { m } from '@church/i18n/messages';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';

export interface EventBlockPublicFieldsProps {
  idPrefix: string;
  isPublic: boolean;
  place: string;
  /** The block has started: the server refuses a change. */
  locked: boolean;
  onIsPublicChange: (value: boolean) => void;
  onPlaceChange: (value: string) => void;
}

/** Público checkbox and place of one Time block; a ChurchAdmin decision (ADR 0009). */
export function EventBlockPublicFields({
  idPrefix,
  isPublic,
  place,
  locked,
  onIsPublicChange,
  onPlaceChange,
}: EventBlockPublicFieldsProps) {
  const { isChurchAdmin } = useCallerCapabilities();
  if (!isChurchAdmin) return null;
  return (
    <div
      className="grid gap-3 sm:grid-cols-2"
      data-testid="event-block-public-fields"
    >
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${idPrefix}-public`}
          data-testid="event-block-public-checkbox"
          checked={isPublic}
          disabled={locked}
          onCheckedChange={onIsPublicChange}
        />
        <Label htmlFor={`${idPrefix}-public`}>
          {m.event_editor_block_public()}
        </Label>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-place`}>
          {m.event_editor_block_place()}
        </Label>
        <Input
          id={`${idPrefix}-place`}
          data-testid="event-block-place-input"
          maxLength={120}
          value={place}
          disabled={locked}
          placeholder={m.event_editor_block_place_placeholder()}
          onChange={(event) => onPlaceChange(event.target.value)}
        />
      </div>
    </div>
  );
}

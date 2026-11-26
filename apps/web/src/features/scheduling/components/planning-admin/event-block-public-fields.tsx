import { m } from '@church/i18n/messages';
import {
  type TimeBlockPlace,
  TimeBlockPlacePicker,
} from './time-block-place-picker';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';

export interface EventBlockPublicFieldsProps {
  idPrefix: string;
  isPublic: boolean;
  place: string;
  placeAddressId: string | null;
  /** The block has started: the server refuses a change. */
  locked: boolean;
  onIsPublicChange: (value: boolean) => void;
  onPlaceChange: (value: TimeBlockPlace) => void;
}

/** Público checkbox and place of one Time block; a ChurchAdmin decision (ADR 0009). */
export function EventBlockPublicFields({
  idPrefix,
  isPublic,
  place,
  placeAddressId,
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
      <TimeBlockPlacePicker
        id={`${idPrefix}-place`}
        testIdPrefix="event-block"
        label={m.event_editor_block_place()}
        placeholder={m.event_editor_block_place_placeholder()}
        place={place}
        placeAddressId={placeAddressId}
        disabled={locked}
        onChange={onPlaceChange}
      />
    </div>
  );
}

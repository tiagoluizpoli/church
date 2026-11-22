import { m } from '@church/i18n/messages';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { addressSummary } from '@/features/church-settings/church-settings-form';
import { useChurchSettings } from '@/features/church-settings/church-settings-queries';

/** A time block's place: a Church Address, free text, or nothing (both empty). */
export interface TimeBlockPlace {
  place: string;
  placeAddressId: string | null;
}

export interface TimeBlockPlacePickerProps extends TimeBlockPlace {
  id: string;
  /** `template-time-block` or `event-block`: prefixes the test ids. */
  testIdPrefix: string;
  label: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: TimeBlockPlace) => void;
}

const NONE = 'none';
const TYPED_PLACE = 'typed';

/**
 * Picks one of the Church's addresses, free text or no place. With no
 * addresses recorded it is the free-text field alone.
 */
export function TimeBlockPlacePicker({
  id,
  testIdPrefix,
  label,
  placeholder,
  disabled,
  place,
  placeAddressId,
  onChange,
}: TimeBlockPlacePickerProps) {
  const addresses = useChurchSettings().data?.addresses ?? [];
  const [freeTextChosen, setFreeTextChosen] = useState(place !== '');
  const choice = placeAddressId
    ? placeAddressId
    : freeTextChosen || place !== ''
      ? TYPED_PLACE
      : NONE;
  const showText = addresses.length === 0 || choice === TYPED_PLACE;
  const nameOf = (value: string) => {
    if (value === NONE) return m.time_block_place_none();
    if (value === TYPED_PLACE) return m.time_block_place_free_text();
    const address = addresses.find((candidate) => candidate.id === value);
    return address ? (address.label ?? addressSummary({ address })) : '';
  };

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {addresses.length > 0 ? (
        <Select
          value={choice}
          disabled={disabled}
          onValueChange={(value) => {
            if (!value) return;
            setFreeTextChosen(value === TYPED_PLACE);
            onChange(
              value === NONE || value === TYPED_PLACE
                ? { place: '', placeAddressId: null }
                : { place: '', placeAddressId: value },
            );
          }}
        >
          <SelectTrigger
            id={id}
            data-testid={`${testIdPrefix}-place-select`}
            className="w-full"
          >
            <SelectValue>{nameOf(choice)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{nameOf(NONE)}</SelectItem>
            {addresses.map((address) => (
              <SelectItem key={address.id} value={address.id}>
                {nameOf(address.id)}
              </SelectItem>
            ))}
            <SelectItem value={TYPED_PLACE}>{nameOf(TYPED_PLACE)}</SelectItem>
          </SelectContent>
        </Select>
      ) : null}
      {showText ? (
        <Input
          id={addresses.length > 0 ? `${id}-text` : id}
          aria-label={addresses.length > 0 ? label : undefined}
          data-testid={`${testIdPrefix}-place-input`}
          maxLength={120}
          value={place}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) =>
            onChange({ place: event.target.value, placeAddressId: null })
          }
        />
      ) : null}
    </div>
  );
}

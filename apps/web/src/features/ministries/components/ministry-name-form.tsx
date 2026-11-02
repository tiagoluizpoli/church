import { m } from '@church/i18n/messages';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type NameRefusal,
  toNameRefusal,
  validateMinistryName,
} from '@/features/ministries/ministry-name';

interface SaveInput {
  name: string;
}

export interface MinistryNameFormProps {
  initialName: string;
  /** Rejects to keep the form open with the typed name and the refusal shown. */
  onSave: (input: SaveInput) => Promise<unknown>;
  /** Submit and cancel controls, given whether a save is pending. */
  renderActions: (pending: boolean) => ReactNode;
  autoFocus?: boolean;
}

/** One labelled name field; a failed save never discards the typed name. */
export function MinistryNameForm({
  initialName,
  onSave,
  renderActions,
  autoFocus,
}: MinistryNameFormProps) {
  const inputId = useId();
  const errorId = useId();
  const [name, setName] = useState(initialName);
  const [refusal, setRefusal] = useState<NameRefusal>({});
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nameError = validateMinistryName({ name });
    if (nameError) {
      setRefusal({ nameError });
      return;
    }
    setPending(true);
    try {
      await onSave({ name: name.trim() });
    } catch (error) {
      setRefusal(toNameRefusal({ error }));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="space-y-4" noValidate onSubmit={submit}>
      <div className="space-y-1">
        <Label htmlFor={inputId}>{m.ministries_name_label()}</Label>
        <Input
          id={inputId}
          value={name}
          maxLength={255}
          autoFocus={autoFocus}
          aria-invalid={refusal.nameError ? true : undefined}
          aria-describedby={refusal.nameError ? errorId : undefined}
          onChange={(event) => {
            setRefusal({});
            setName(event.target.value);
          }}
        />
        {refusal.nameError ? (
          <p id={errorId} className="text-destructive text-sm">
            {refusal.nameError}
          </p>
        ) : null}
      </div>
      {refusal.formError ? (
        <p className="text-destructive text-sm" role="alert">
          {refusal.formError}
        </p>
      ) : null}
      {renderActions(pending)}
    </form>
  );
}

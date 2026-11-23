import { m } from '@church/i18n/messages';
import { ArrowDown, ArrowUp, AtSign, Phone, Trash2, Type } from 'lucide-react';
import * as React from 'react';
import { IconInputField } from '@/components/icon-input-field';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type {
  ContactForm,
  ContactType,
} from '@/features/church-settings/church-settings-form';
import { GroupField } from '@/features/church-settings/components/group-field';
import { useControlSizes } from '@/features/church-settings/use-control-sizes';

const CONTACT_TYPES: ContactType[] = ['mobile', 'landline', 'email'];

const TYPE_LABELS: Record<ContactType, () => string> = {
  mobile: m.church_settings_contact_kind_mobile,
  landline: m.church_settings_contact_kind_landline,
  email: m.church_settings_contact_kind_email,
};

function isContactType(value: unknown): value is ContactType {
  return CONTACT_TYPES.some((type) => type === value);
}

interface UpdateInput {
  key: string;
  changes: Partial<ContactForm>;
}

interface MoveInput {
  index: number;
  offset: number;
}

interface ContactsSectionProps {
  contacts: ContactForm[];
  /** The existing Contact Groups, suggested on each row. */
  groups: string[];
  /** Refusals by field, e.g. `contacts.1.value`. */
  errors: Record<string, string>;
  onChange: (contacts: ContactForm[]) => void;
}

/** The *Contatos* section: any number of Church Contacts, private until confirmed public. */
export function ContactsSection({
  contacts,
  groups,
  errors,
  onChange,
}: ContactsSectionProps) {
  const sizes = useControlSizes();
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const counter = React.useRef(0);
  const confirmingContact = contacts.find(({ key }) => key === confirming);

  const update = ({ key, changes }: UpdateInput) =>
    onChange(
      contacts.map((contact) =>
        contact.key === key ? { ...contact, ...changes } : contact,
      ),
    );

  const add = () => {
    counter.current += 1;
    onChange([
      ...contacts,
      {
        key: `new-${counter.current}`,
        type: 'mobile',
        value: '',
        description: '',
        isWhatsApp: false,
        isPublic: false,
        group: '',
      },
    ]);
  };

  const move = ({ index, offset }: MoveInput) => {
    const next = [...contacts];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(index + offset, 0, moved);
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {contacts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm">
          {m.church_settings_contacts_empty()}
        </p>
      ) : (
        <ul className="space-y-3">
          {contacts.map((contact, index) => {
            const position = index + 1;
            const isEmail = contact.type === 'email';
            return (
              <li
                key={contact.key}
                className="space-y-3 rounded-lg border p-3"
                data-testid="church-contact-row"
              >
                <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                  <div className="space-y-1.5">
                    <Label className="font-medium text-sm">
                      {m.church_settings_contact_kind_label()}
                    </Label>
                    <Select
                      value={contact.type}
                      onValueChange={(type) => {
                        if (isContactType(type))
                          update({ key: contact.key, changes: { type } });
                      }}
                    >
                      <SelectTrigger
                        aria-label={`${m.church_settings_contact_kind_label()} ${position}`}
                        className="w-full"
                      >
                        <SelectValue>{TYPE_LABELS[contact.type]()}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {CONTACT_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {TYPE_LABELS[type]()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <IconInputField
                    icon={isEmail ? AtSign : Phone}
                    label={
                      isEmail
                        ? m.church_settings_contact_email_label()
                        : m.church_settings_contact_phone_label()
                    }
                    value={contact.value}
                    error={errors[`contacts.${index}.value`]}
                    inputMode={isEmail ? 'email' : 'tel'}
                    autoComplete="off"
                    onChange={(event) =>
                      update({
                        key: contact.key,
                        changes: { value: event.target.value },
                      })
                    }
                  />
                </div>
                <GroupField
                  value={contact.group}
                  suggestions={groups}
                  rowLabel={String(position)}
                  error={errors[`contacts.${index}.group`]}
                  onChange={(group) =>
                    update({ key: contact.key, changes: { group } })
                  }
                />
                <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
                  <div className="min-w-48 flex-1">
                    <IconInputField
                      icon={Type}
                      label={m.church_settings_contact_description_label()}
                      placeholder={m.church_settings_contact_description_placeholder()}
                      value={contact.description}
                      error={errors[`contacts.${index}.description`]}
                      onChange={(event) =>
                        update({
                          key: contact.key,
                          changes: { description: event.target.value },
                        })
                      }
                    />
                  </div>
                  {isEmail ? null : (
                    <Label className="flex min-h-11 items-center gap-2 text-sm">
                      <Checkbox
                        checked={contact.isWhatsApp}
                        onCheckedChange={(checked) =>
                          update({
                            key: contact.key,
                            changes: { isWhatsApp: checked === true },
                          })
                        }
                      />
                      {m.church_settings_contact_whatsapp()}
                    </Label>
                  )}
                  <div className="flex min-h-11 items-center gap-2 text-sm">
                    <Switch
                      aria-label={m.church_settings_contact_public()}
                      checked={contact.isPublic}
                      onCheckedChange={(checked) => {
                        if (checked) setConfirming(contact.key);
                        else
                          update({
                            key: contact.key,
                            changes: { isPublic: false },
                          });
                      }}
                    />
                    <span aria-hidden>
                      {m.church_settings_contact_public()}
                    </span>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size={sizes.icon}
                      disabled={index === 0}
                      aria-label={m.church_settings_contact_move_up({
                        position,
                      })}
                      onClick={() => move({ index, offset: -1 })}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size={sizes.icon}
                      disabled={index === contacts.length - 1}
                      aria-label={m.church_settings_contact_move_down({
                        position,
                      })}
                      onClick={() => move({ index, offset: 1 })}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size={sizes.icon}
                      aria-label={m.church_settings_contact_remove({
                        position,
                      })}
                      onClick={() =>
                        onChange(
                          contacts.filter(({ key }) => key !== contact.key),
                        )
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
      )}
      <Button variant="outline" onClick={add}>
        {m.church_settings_contacts_add()}
      </Button>
      <AlertDialog
        open={confirmingContact !== undefined}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.church_settings_contact_public_confirm_title()}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.church_settings_contact_public_confirm_body({
                value: confirmingContact?.value ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {m.church_settings_contact_public_confirm_cancel()}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming)
                  update({ key: confirming, changes: { isPublic: true } });
                setConfirming(null);
              }}
            >
              {m.church_settings_contact_public_confirm_action()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

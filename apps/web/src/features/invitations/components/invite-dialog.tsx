import { m } from '@church/i18n/messages';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { ResponsiveFormSurface } from '@/components/responsive-form-surface';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { INVITATIONS_QUERY_KEY } from '@/features/invitations/invitation-queries';
import { useMinistryList } from '@/features/ministries/ministry-queries';
import { useMinistryRoles } from '@/features/ministries/role-queries';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantOf } from '@/shared/utils/church-time';
import { adminApi } from '@/utils/api-instances';

type AccessLevel = 'leader' | 'volunteer';

// Same shape check as the server's; the server stays authoritative.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RefusalBody {
  error?: string;
  reason?: string;
  existingInvitation?: { createdAt: string };
}

const REFUSAL_MESSAGES: Record<string, () => string> = {
  INVITEE_ALREADY_MINISTRY_MEMBER: m.error_invitee_already_ministry_member,
  INVALID_INVITATION_ROLE: m.error_invalid_invitation_role,
  INSUFFICIENT_INVITATION_AUTHORITY: m.error_insufficient_invitation_authority,
  MINISTRY_NOT_FOUND: m.error_ministry_not_found,
};

interface RefusalMessageInput {
  error: unknown;
  timeZone: string;
}

function refusalMessage({ error, timeZone }: RefusalMessageInput): string {
  const body = isAxiosError<RefusalBody>(error)
    ? error.response?.data
    : undefined;
  if (body?.error === 'PENDING_MINISTRY_INVITATION_EXISTS') {
    const createdAt = body.existingInvitation?.createdAt;
    return createdAt
      ? m.invitations_invite_already_invited({
          date: formatInstantOf({ value: createdAt, timeZone }),
        })
      : m.error_pending_ministry_invitation_exists();
  }
  if (body?.reason === 'INVITATION_ROLE_REQUIRED') {
    return m.error_validation_invitation_role_required();
  }
  const known = body?.error ? REFUSAL_MESSAGES[body.error] : undefined;
  return known ? known() : m.invitations_invite_failed();
}

interface NewTabLinkProps {
  href: string;
  label: string;
}

/** A setup shortcut that keeps the half-filled form open in this tab. */
function NewTabLink({ href, label }: NewTabLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="font-medium underline underline-offset-4"
    >
      {label} <span className="sr-only">{m.invitations_invite_new_tab()}</span>
    </a>
  );
}

interface ToggleRoleInput {
  roleId: string;
  checked: boolean;
}

interface RolePickerProps {
  ministryId: string;
  selected: string[];
  onChange: (roleIds: string[]) => void;
  errorId?: string;
}

/** The Ministry's active Roles; Select all picks only what is offered here. */
function RolePicker({
  ministryId,
  selected,
  onChange,
  errorId,
}: RolePickerProps) {
  const rolesQuery = useMinistryRoles({ ministryId });
  const roles = rolesQuery.data?.roles ?? [];
  const legendId = useId();

  if (rolesQuery.isLoading) {
    return (
      <p className="text-muted-foreground text-sm">
        {m.invitations_invite_roles_loading()}
      </p>
    );
  }
  if (rolesQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center gap-3">
          <span>{m.invitations_invite_options_failed()}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => rolesQuery.refetch()}
          >
            {m.invitations_retry()}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (roles.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {m.invitations_invite_no_roles()}{' '}
        <NewTabLink
          href={`/ministries/${ministryId}/roles`}
          label={m.invitations_invite_add_role()}
        />
      </p>
    );
  }

  const toggle = ({ roleId, checked }: ToggleRoleInput) =>
    onChange(
      checked ? [...selected, roleId] : selected.filter((id) => id !== roleId),
    );

  return (
    <fieldset
      className="space-y-2"
      aria-labelledby={legendId}
      aria-describedby={errorId}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id={legendId} className="font-medium text-sm">
          {m.ministry_invitation_roles_label()}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange(roles.map((role) => role.id))}
        >
          {m.invitations_invite_select_all()}
        </Button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {roles.map((role) => (
          <li key={role.id} className="flex items-center gap-2">
            <Checkbox
              id={`invite-role-${role.id}`}
              checked={selected.includes(role.id)}
              onCheckedChange={(checked) =>
                toggle({ roleId: role.id, checked: checked === true })
              }
            />
            <Label htmlFor={`invite-role-${role.id}`} className="break-words">
              {role.name}
            </Label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

interface FieldErrors {
  email?: string;
  ministry?: string;
  roles?: string;
}

/**
 * Invite into a Ministry. Admins choose leader or Volunteer; leaders invite
 * Volunteers only. A failed send keeps every input for a retry.
 */
export function InviteDialog() {
  const { isChurchAdmin } = useCallerCapabilities();
  const { churchTimezone } = useTimezone();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ministriesQuery = useMinistryList({ enabled: open });
  const ministries = ministriesQuery.data?.ministries ?? [];

  const [email, setEmail] = useState('');
  const [ministryId, setMinistryId] = useState('');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('volunteer');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);

  const formId = useId();
  const emailId = useId();
  const emailErrorId = useId();
  const ministryErrorId = useId();
  const rolesErrorId = useId();

  // A leader of exactly one Ministry never has to pick it.
  const onlyMinistry =
    !isChurchAdmin && ministries.length === 1 ? ministries[0] : undefined;
  useEffect(() => {
    if (onlyMinistry && !ministryId) setMinistryId(onlyMinistry.id);
  }, [onlyMinistry, ministryId]);

  const level: AccessLevel = isChurchAdmin ? accessLevel : 'volunteer';

  const reset = () => {
    setEmail('');
    setMinistryId('');
    setAccessLevel('volunteer');
    setRoleIds([]);
    setErrors({});
    setFormError(undefined);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const next: FieldErrors = {};
    if (!EMAIL_PATTERN.test(email.trim())) {
      next.email = m.invitations_invite_email_invalid();
    }
    if (!ministryId) next.ministry = m.invitations_invite_ministry_required();
    if (ministryId && level === 'volunteer' && roleIds.length === 0) {
      next.roles = m.error_validation_invitation_role_required();
    }
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    try {
      const trimmed = email.trim();
      await adminApi.mintMinistryInvitation(ministryId, {
        email: trimmed,
        ministryAccessLevel: level,
        roleIds: [...new Set(roleIds)],
      });
      toast.success(m.invitations_invite_sent_toast({ email: trimmed }));
      setOpen(false);
      reset();
      await queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY });
    } catch (error) {
      setFormError(refusalMessage({ error, timeZone: churchTimezone }));
    } finally {
      setPending(false);
    }
  };

  const noMinistry = ministriesQuery.isSuccess && ministries.length === 0;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {m.invitations_invite_open()}
      </Button>
      <ResponsiveFormSurface
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
        }}
        title={m.invitations_invite_title()}
        description={m.invitations_invite_description()}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              {m.invitations_invite_cancel()}
            </Button>
            <Button
              type="submit"
              form={formId}
              disabled={pending || noMinistry}
            >
              {pending
                ? m.invitations_invite_submitting()
                : m.invitations_invite_submit()}
            </Button>
          </>
        }
      >
        <form id={formId} className="space-y-4" noValidate onSubmit={submit}>
          <div className="space-y-1">
            <Label htmlFor={emailId}>
              {m.invitations_invite_email_label()}
            </Label>
            <Input
              id={emailId}
              type="email"
              autoComplete="off"
              autoFocus
              value={email}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? emailErrorId : undefined}
              onChange={(event) => setEmail(event.target.value)}
            />
            {errors.email ? (
              <p id={emailErrorId} className="text-destructive text-sm">
                {errors.email}
              </p>
            ) : null}
          </div>

          {ministriesQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center gap-3">
                <span>{m.invitations_invite_options_failed()}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => ministriesQuery.refetch()}
                >
                  {m.invitations_retry()}
                </Button>
              </AlertDescription>
            </Alert>
          ) : noMinistry ? (
            <p className="text-muted-foreground text-sm">
              {m.invitations_invite_no_ministry()}{' '}
              {isChurchAdmin ? (
                <NewTabLink
                  href="/ministries"
                  label={m.invitations_invite_create_ministry()}
                />
              ) : null}
            </p>
          ) : (
            <div className="space-y-1">
              <Label id={`${formId}-ministry`}>
                {m.invitations_invite_ministry_label()}
              </Label>
              <Select
                value={ministryId || null}
                onValueChange={(value) => {
                  if (!value || value === ministryId) return;
                  setMinistryId(value);
                  // Roles belong to one Ministry; never carry them over.
                  setRoleIds([]);
                }}
              >
                <SelectTrigger
                  className="w-full"
                  aria-labelledby={`${formId}-ministry`}
                  aria-invalid={errors.ministry ? true : undefined}
                  aria-describedby={
                    errors.ministry ? ministryErrorId : undefined
                  }
                >
                  <SelectValue
                    placeholder={m.invitations_invite_ministry_placeholder()}
                  >
                    {(value: string | null) =>
                      ministries.find((ministry) => ministry.id === value)
                        ?.name ?? m.invitations_invite_ministry_placeholder()
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ministries.map((ministry) => (
                    <SelectItem key={ministry.id} value={ministry.id}>
                      {ministry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.ministry ? (
                <p id={ministryErrorId} className="text-destructive text-sm">
                  {errors.ministry}
                </p>
              ) : null}
            </div>
          )}

          {isChurchAdmin ? (
            <fieldset className="space-y-2">
              <legend className="font-medium text-sm">
                {m.ministry_invitation_access_level_label()}
              </legend>
              <RadioGroup
                value={accessLevel}
                onValueChange={(value) => setAccessLevel(value as AccessLevel)}
                className="flex flex-wrap gap-4"
              >
                {(['volunteer', 'leader'] as const).map((value) => (
                  <div key={value} className="flex items-center gap-2">
                    <RadioGroupItem value={value} id={`${formId}-${value}`} />
                    <Label htmlFor={`${formId}-${value}`}>
                      {value === 'leader'
                        ? m.ministry_invitation_access_leader()
                        : m.ministry_invitation_access_volunteer()}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>
          ) : null}

          {ministryId ? (
            <RolePicker
              ministryId={ministryId}
              selected={roleIds}
              onChange={(next) => {
                setErrors((current) => ({ ...current, roles: undefined }));
                setRoleIds(next);
              }}
              errorId={errors.roles ? rolesErrorId : undefined}
            />
          ) : null}
          {errors.roles ? (
            <p id={rolesErrorId} className="text-destructive text-sm">
              {errors.roles}
            </p>
          ) : null}

          {formError ? (
            <p className="text-destructive text-sm" role="alert">
              {formError}
            </p>
          ) : null}
        </form>
      </ResponsiveFormSurface>
    </>
  );
}

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
import { PEOPLE_QUERY_KEY } from '@/features/people/people-queries';
import type { MintMinistryInvitation409ExistingInvitation } from '@/infrastructure/api/churchAPI.schemas';
import { useCallerCapabilities } from '@/shared/hooks/use-caller-capabilities';
import { useTimezone } from '@/shared/hooks/use-timezone';
import { formatInstantOf } from '@/shared/utils/church-time';
import { adminApi, invitationsApi } from '@/utils/api-instances';

type AccessLevel = 'leader' | 'volunteer';
/** What an admin invites as: a Ministry Access Level, or ChurchAdmin. */
type InviteAs = AccessLevel | 'admin';

// Same shape check as the server's; the server stays authoritative.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RefusalBody {
  error?: string;
  reason?: string;
  existingInvitation?: MintMinistryInvitation409ExistingInvitation;
}

const REFUSAL_MESSAGES: Record<string, () => string> = {
  INVITEE_ALREADY_MINISTRY_MEMBER: m.error_invitee_already_ministry_member,
  INVITEE_ALREADY_CHURCH_MEMBER: m.error_invitee_already_church_member,
  PENDING_CHURCH_INVITATION_EXISTS: m.error_pending_church_invitation_exists,
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

interface RolePickerRole {
  id: string;
  name: string;
}

interface RolePickerProps {
  ministryId: string;
  selected: string[];
  onChange: (roleIds: string[]) => void;
  errorId?: string;
  /** Archived Roles the member already holds: labelled and removable, never offered anew. */
  heldArchived?: RolePickerRole[];
  /** Keeps checkbox ids unique per surface. */
  idPrefix?: string;
  /** Select all adds the active Roles to the current choice (keeping held archived ones) instead of replacing it. */
  selectAllKeepsSelection?: boolean;
}

/** The Ministry's active Roles; Select all picks every active Role. */
export function RolePicker({
  ministryId,
  selected,
  onChange,
  errorId,
  heldArchived = [],
  idPrefix = 'invite',
  selectAllKeepsSelection = false,
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
  if (roles.length === 0 && heldArchived.length === 0) {
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

  const selectAll = () => {
    const activeIds = roles.map(({ id }) => id);
    const next = selectAllKeepsSelection
      ? new Set([...selected, ...activeIds])
      : activeIds;
    onChange([...next]);
  };

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
        <Button type="button" size="sm" variant="outline" onClick={selectAll}>
          {m.invitations_invite_select_all()}
        </Button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {[...roles, ...heldArchived].map((role) => (
          <li key={role.id} className="flex items-center gap-2">
            <Checkbox
              id={`${idPrefix}-role-${role.id}`}
              checked={selected.includes(role.id)}
              onCheckedChange={(checked) =>
                toggle({ roleId: role.id, checked: checked === true })
              }
            />
            <Label
              htmlFor={`${idPrefix}-role-${role.id}`}
              className="break-words"
            >
              {heldArchived.includes(role)
                ? `${role.name} · ${m.people_role_archived()}`
                : role.name}
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

interface InviteDialogProps {
  /** Prefills the email on every opening. */
  initialEmail?: string;
  /** Ministry offers only: no Admin invitation option (People entry point). */
  ministryOnly?: boolean;
  onSuccess?: () => void;
}

/**
 * Invite into a Ministry, or (admins only) invite an Admin by email alone.
 * Admins choose Volunteer, leader or Admin; leaders invite Volunteers only.
 * A failed send keeps every input for a retry.
 */
export function InviteDialog({
  initialEmail,
  ministryOnly = false,
  onSuccess,
}: InviteDialogProps = {}) {
  const { isChurchAdmin } = useCallerCapabilities();
  const { churchTimezone } = useTimezone();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ministriesQuery = useMinistryList({ enabled: open });
  const ministries = ministriesQuery.data?.ministries ?? [];

  const [email, setEmail] = useState('');
  const [ministryId, setMinistryId] = useState('');
  const [inviteAs, setInviteAs] = useState<InviteAs>('volunteer');
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

  const asAdmin = !ministryOnly && isChurchAdmin && inviteAs === 'admin';
  const level: AccessLevel =
    isChurchAdmin && inviteAs === 'leader' ? 'leader' : 'volunteer';

  const reset = () => {
    setEmail('');
    setMinistryId('');
    setInviteAs('volunteer');
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
    if (!asAdmin && !ministryId) {
      next.ministry = m.invitations_invite_ministry_required();
    }
    if (!asAdmin && ministryId && level === 'volunteer' && !roleIds.length) {
      next.roles = m.error_validation_invitation_role_required();
    }
    setErrors(next);
    setFormError(undefined);
    if (Object.keys(next).length > 0) return;

    setPending(true);
    try {
      const trimmed = email.trim();
      if (asAdmin) {
        const { outcome } = await invitationsApi.mintAdminInvitation({
          email: trimmed,
        });
        toast.success(
          outcome === 'upgraded'
            ? m.invitations_invite_upgraded_toast({ email: trimmed })
            : m.invitations_invite_sent_toast({ email: trimmed }),
        );
      } else {
        await adminApi.mintMinistryInvitation(ministryId, {
          email: trimmed,
          ministryAccessLevel: level,
          roleIds: [...new Set(roleIds)],
        });
        toast.success(m.invitations_invite_sent_toast({ email: trimmed }));
      }
      setOpen(false);
      reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: INVITATIONS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: PEOPLE_QUERY_KEY }),
      ]);
      onSuccess?.();
    } catch (error) {
      setFormError(refusalMessage({ error, timeZone: churchTimezone }));
    } finally {
      setPending(false);
    }
  };

  const noMinistry =
    !asAdmin && ministriesQuery.isSuccess && ministries.length === 0;

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          if (initialEmail !== undefined) setEmail(initialEmail);
          setOpen(true);
        }}
      >
        {ministryOnly ? m.people_invite_open() : m.invitations_invite_open()}
      </Button>
      <ResponsiveFormSurface
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
        }}
        title={
          asAdmin
            ? m.invitations_invite_admin_title()
            : m.invitations_invite_title()
        }
        description={
          asAdmin
            ? m.invitations_invite_admin_description()
            : m.invitations_invite_description()
        }
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

          {isChurchAdmin ? (
            <fieldset className="space-y-2">
              <legend className="font-medium text-sm">
                {m.invitations_invite_as_label()}
              </legend>
              <RadioGroup
                value={inviteAs}
                onValueChange={(value) => {
                  const next = value as InviteAs;
                  setInviteAs(next);
                  // An Admin offer carries no Ministry or Roles; never send stale ones.
                  if (next === 'admin') {
                    setMinistryId('');
                    setRoleIds([]);
                    setErrors((current) => ({ email: current.email }));
                  }
                }}
                className="flex flex-wrap gap-4"
              >
                {(ministryOnly
                  ? (['volunteer', 'leader'] as const)
                  : (['volunteer', 'leader', 'admin'] as const)
                ).map((value) => (
                  <div key={value} className="flex items-center gap-2">
                    <RadioGroupItem value={value} id={`${formId}-${value}`} />
                    <Label htmlFor={`${formId}-${value}`}>
                      {value === 'admin'
                        ? m.invitations_invite_as_admin()
                        : value === 'leader'
                          ? m.ministry_invitation_access_leader()
                          : m.ministry_invitation_access_volunteer()}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </fieldset>
          ) : null}

          {asAdmin ? null : ministriesQuery.isError ? (
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

          {!asAdmin && ministryId ? (
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

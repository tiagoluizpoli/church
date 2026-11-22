import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { ArrowRight, CircleAlert, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

export const THROTTLED_STATUS = 429;

export type ChurchAccessLevel = 'member' | 'admin';

export const CHURCH_ACCESS_LABELS: Record<ChurchAccessLevel, () => string> = {
  member: m.join_church_access_member,
  admin: m.join_church_access_admin,
};

interface AlertProps {
  children: ReactNode;
}

export function Alert({ children }: AlertProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3"
    >
      <CircleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
      <div className="text-sm">{children}</div>
    </div>
  );
}

interface UnavailableNoticeProps {
  /** Where sign-in sends the caller back to. */
  returnTo: string;
}

export function UnavailableNotice({ returnTo }: UnavailableNoticeProps) {
  return (
    <div className="space-y-4">
      <Alert>
        <p className="font-medium">
          {m.ministry_invitation_unavailable_title()}
        </p>
        <p className="text-muted-foreground">
          {m.ministry_invitation_unavailable_description()}
        </p>
      </Alert>
      <Link
        to="/login"
        search={{ redirect: returnTo }}
        className="inline-flex min-h-11 items-center font-medium text-primary text-sm underline-offset-4 hover:underline"
      >
        {m.ministry_invitation_login()}
      </Link>
    </div>
  );
}

interface ThrottledNoticeProps {
  onRetry: () => void;
}

export function ThrottledNotice({ onRetry }: ThrottledNoticeProps) {
  return (
    <div className="space-y-4">
      <Alert>
        <p className="font-medium">{m.ministry_invitation_throttled_title()}</p>
        <p className="text-muted-foreground">
          {m.ministry_invitation_throttled_description()}
        </p>
      </Alert>
      <Button variant="outline" onClick={onRetry}>
        {m.ministry_invitation_retry()}
      </Button>
    </div>
  );
}

interface WrongLoginNoticeProps {
  maskedEmail: string;
  onLogOut: () => void;
  /** Shows the shield icon above the title. */
  withIcon?: boolean;
}

export function WrongLoginNotice({
  maskedEmail,
  onLogOut,
  withIcon = true,
}: WrongLoginNoticeProps) {
  return (
    <div className="space-y-4">
      {withIcon ? (
        <div className="flex size-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <ShieldAlert className="size-5" />
        </div>
      ) : null}
      <h1 className="text-balance font-semibold text-2xl tracking-tight">
        {m.ministry_invitation_wrong_login_title()}
      </h1>
      <p className="text-pretty text-muted-foreground text-sm">
        {m.ministry_invitation_wrong_login_description({ maskedEmail })}
      </p>
      <Button onClick={onLogOut}>{m.ministry_invitation_logout()}</Button>
    </div>
  );
}

interface AlreadyAcceptedNoticeProps {
  isPending: boolean;
  onContinue: () => void;
}

export function AlreadyAcceptedNotice({
  isPending,
  onContinue,
}: AlreadyAcceptedNoticeProps) {
  return (
    <div className="space-y-4">
      <h1 className="text-balance font-semibold text-2xl tracking-tight">
        {m.ministry_invitation_already_accepted_title()}
      </h1>
      <p className="text-pretty text-muted-foreground text-sm">
        {m.ministry_invitation_already_accepted_description()}
      </p>
      <Button className="w-full" disabled={isPending} onClick={onContinue}>
        {m.ministry_invitation_continue_home()}
        {isPending ? <Spinner /> : <ArrowRight />}
      </Button>
    </div>
  );
}

interface InvitationFactProps {
  label: string;
  value: string;
}

export function InvitationFact({ label, value }: InvitationFactProps) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
    </div>
  );
}

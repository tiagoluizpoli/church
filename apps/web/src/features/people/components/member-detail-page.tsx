import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkspacePage } from '@/components/workspace-page';
import { InviteDialog } from '@/features/invitations/components/invite-dialog';
import { MinistryCard } from '@/features/people/components/ministry-card';
import { usePerson } from '@/features/people/people-queries';
import type { GetPerson200 } from '@/infrastructure/api/churchAPI.schemas';

interface MemberDetailProps {
  person: GetPerson200;
}

/** The scoped member detail; Church access renders only when the server sent it. */
export function MemberDetail({ person }: MemberDetailProps) {
  const { churchAccess } = person;
  return (
    <WorkspacePage className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-3xl tracking-[-0.02em]">
          {person.name}
        </h1>
        <p className="break-all text-muted-foreground">{person.email}</p>
        {person.canInviteToMinistry ? (
          <InviteDialog initialEmail={person.email} ministryOnly />
        ) : null}
      </header>
      {churchAccess ? (
        <section aria-labelledby="people-church-access" className="space-y-2">
          <h2 id="people-church-access" className="font-medium text-lg">
            {m.people_church_access()}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {churchAccess.accessLevel === 'admin'
                ? m.people_church_access_admin()
                : m.people_church_access_member()}
            </Badge>
            {churchAccess.isLastAdmin ? (
              <span className="text-muted-foreground text-sm">
                {m.people_last_admin_note()}
              </span>
            ) : null}
          </div>
        </section>
      ) : null}
      <section aria-labelledby="people-ministries" className="space-y-2">
        <h2 id="people-ministries" className="font-medium text-lg">
          {m.people_detail_ministries()}
        </h2>
        {person.ministries.length === 0 ? (
          <p className="text-muted-foreground" role="status">
            {m.people_detail_no_ministries()}
          </p>
        ) : (
          <ul className="grid gap-3">
            {person.ministries.map((card) => (
              <MinistryCard key={card.membershipId} card={card} />
            ))}
          </ul>
        )}
      </section>
    </WorkspacePage>
  );
}

interface MemberDetailPageProps {
  memberId: string;
}

/** Loads one member; a missing or out-of-scope id and a refusal replace the whole page. */
export function MemberDetailPage({ memberId }: MemberDetailPageProps) {
  const query = usePerson({ memberId });

  if (query.isLoading) {
    return (
      <div className="space-y-3" data-testid="person-loading">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-8 w-96" />
      </div>
    );
  }
  if (query.isError) {
    const status = isAxiosError(query.error)
      ? query.error.response?.status
      : undefined;
    if (status === 403 || status === 404) {
      return (
        <div className="space-y-3" role="status">
          <p className="text-muted-foreground">
            {status === 403 ? m.shell_no_access() : m.people_detail_not_found()}
          </p>
          <Link to="/people" className="text-sm underline underline-offset-2">
            {m.people_detail_back()}
          </Link>
        </div>
      );
    }
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex items-center gap-3">
          <span>{m.people_detail_load_failed()}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => query.refetch()}
          >
            {m.invitations_retry()}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  return query.data ? <MemberDetail person={query.data} /> : null;
}

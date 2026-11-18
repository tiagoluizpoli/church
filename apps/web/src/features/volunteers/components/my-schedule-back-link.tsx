import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';

/** Below md the shell shows no breadcrumb, so the page carries its own way back. */
export function MyScheduleBackLink() {
  return (
    <Link
      to="/my-schedule"
      className="radius-control -ml-2 inline-flex min-h-11 items-center gap-1 px-2 font-medium text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring md:hidden"
    >
      <ChevronLeft aria-hidden="true" className="size-5" />
      {m.nav_my_schedule()}
    </Link>
  );
}

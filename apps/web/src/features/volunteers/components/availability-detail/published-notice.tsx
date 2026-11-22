import { m } from '@church/i18n/messages';
import { Link } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import { LINK_CLASS, SECONDARY_TONE } from './style';
import { cn } from '@/lib/utils';

export function MyScheduleLink() {
  return (
    <Link to="/app/my-schedule" className={LINK_CLASS}>
      {m.availability_detail_published_link()}
    </Link>
  );
}

/** "Escala publicada · Ver Minha escala": the outcome, not an availability answer. */
export function PublishedNotice() {
  return (
    <p
      className={cn(
        'flex flex-wrap items-center gap-x-1.5 text-sm md:text-xs',
        SECONDARY_TONE,
      )}
    >
      <Lock aria-hidden className="size-3.5 shrink-0" />
      {m.availability_detail_published_day()}
      <span aria-hidden>·</span> <MyScheduleLink />
    </p>
  );
}

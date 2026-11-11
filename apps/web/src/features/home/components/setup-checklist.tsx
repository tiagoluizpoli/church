import { m } from '@church/i18n/messages';
import { Circle, CircleCheck } from 'lucide-react';
import type { GetSetupProgress200 } from '@/infrastructure/api/churchAPI.schemas';

interface SetupChecklistProps {
  progress: GetSetupProgress200;
}

interface SetupStep {
  done: boolean;
  label: string;
  /** The owning page; Home never opens its dialogs. */
  href: string;
}

/** The five setup facts as a read-only checklist; each step opens its page in a new tab. */
export function SetupChecklist({ progress }: SetupChecklistProps) {
  const steps: SetupStep[] = [
    {
      done: progress.hasMinistry,
      label: m.home_setup_ministry(),
      href: '/ministries',
    },
    {
      done: progress.hasMinistryWithSectorsAndRoles,
      label: m.home_setup_sectors_roles(),
      href: '/ministries',
    },
    {
      done: progress.hasInvitedLeader,
      label: m.home_setup_leader(),
      href: '/invitations',
    },
    {
      done: progress.hasEventTemplate,
      label: m.home_setup_template(),
      href: '/event-templates',
    },
    {
      done: progress.hasEverSentCycle,
      label: m.home_setup_cycle(),
      href: '/cycles',
    },
  ];

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <h3 className="font-medium">{m.home_setup_title()}</h3>
      <ol className="space-y-2">
        {steps.map(({ done, label, href }) => (
          <li key={label} className="flex items-center gap-2">
            {done ? (
              <CircleCheck aria-hidden className="size-5 text-primary" />
            ) : (
              <Circle aria-hidden className="size-5 text-muted-foreground" />
            )}
            <span className="sr-only">
              {done ? m.home_setup_done() : m.home_setup_to_do()}
            </span>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:underline"
            >
              {label} <span className="sr-only">{m.home_opens_new_tab()}</span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

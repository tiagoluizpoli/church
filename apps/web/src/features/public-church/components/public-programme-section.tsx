import { m } from '@church/i18n/messages';
import { getLocale } from '@church/i18n/runtime';
import type { GetPublicChurchProfile200 } from '@/infrastructure/api/churchAPI.schemas';
import { describeRecurrence } from '@/shared/utils/recurrence-phrase';

interface PublicProgrammeSectionProps {
  programme: GetPublicChurchProfile200['programme'];
}

/** The Church Programme in the server's order; hidden when empty. */
export function PublicProgrammeSection({
  programme,
}: PublicProgrammeSectionProps) {
  if (programme.length === 0) return null;
  const locale = getLocale();
  return (
    <section aria-labelledby="public-programme-title" className="mt-8">
      <h2
        id="public-programme-title"
        className="font-semibold text-xl tracking-tight"
      >
        {m.public_programme_title()}
      </h2>
      <ul className="mt-4 flex flex-col gap-2">
        {programme.map(
          ({ recurrence, exceptOrdinals, startTime, label, place }) => (
            <li key={`${JSON.stringify(recurrence)}-${startTime}-${label}`}>
              {[
                describeRecurrence({ recurrence, exceptOrdinals, locale }),
                startTime,
                label,
                place,
              ]
                .filter(Boolean)
                .join(' · ')}
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

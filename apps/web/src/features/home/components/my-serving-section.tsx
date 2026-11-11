import { m } from '@church/i18n/messages';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';

/**
 * Home slot: mounted by `HomePage` only when the `serving` capacity is held. The
 * owning ticket replaces this body; keep the props and the heading contract.
 */
export function MyServingSection({ churchId, userId }: HomeSectionProps) {
  return (
    <section
      aria-labelledby="home-section-serving"
      data-church-id={churchId}
      data-user-id={userId}
    >
      <h2 id="home-section-serving" className="font-semibold text-xl">
        {m.home_section_serving()}
      </h2>
    </section>
  );
}

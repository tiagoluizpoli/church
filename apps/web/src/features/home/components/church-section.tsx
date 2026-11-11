import { m } from '@church/i18n/messages';
import type { HomeSectionProps } from '@/features/home/components/home-section-props';

/**
 * Home slot: mounted by `HomePage` only when the `church` capacity is held. The
 * owning ticket replaces this body; keep the props and the heading contract.
 */
export function ChurchSection({ churchId, userId }: HomeSectionProps) {
  return (
    <section
      aria-labelledby="home-section-church"
      data-church-id={churchId}
      data-user-id={userId}
    >
      <h2 id="home-section-church" className="font-semibold text-xl">
        {m.home_section_church()}
      </h2>
    </section>
  );
}

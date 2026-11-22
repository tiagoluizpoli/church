import { m } from '@church/i18n/messages';
import { formatCnpj } from '@/features/church-settings/church-settings-form';
import type { GetPublicChurchProfile200 } from '@/infrastructure/api/churchAPI.schemas';

interface PublicLegalSectionProps {
  legalProfile: GetPublicChurchProfile200['legalProfile'];
}

/** The legal name and CNPJ the Church made public; hidden otherwise. */
export function PublicLegalSection({ legalProfile }: PublicLegalSectionProps) {
  if (!legalProfile) return null;
  return (
    <section aria-labelledby="public-legal-title" className="mt-8">
      <h2
        id="public-legal-title"
        className="font-semibold text-xl tracking-tight"
      >
        {m.public_legal_title()}
      </h2>
      <p className="mt-4">{legalProfile.legalName}</p>
      <p className="text-muted-foreground text-sm">
        {m.public_legal_cnpj()} {formatCnpj({ digits: legalProfile.cnpj })}
      </p>
    </section>
  );
}

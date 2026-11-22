import type {
  MainAddressArea,
  PublicChurchAddress,
} from '../../church-address';
import type { ChurchContact } from '../../church-contact';
import type { RegularActivity } from '../../entities/regular-activity';
import type { ChurchSocialLink } from '../../social-link';

export interface GetPublicChurchProfileInput {
  /** A live or old Church Slug, as the visitor typed it. */
  slug: string;
}

export interface PublicContactGroup {
  /** `null` is "Da igreja". */
  name: string | null;
  contacts: Pick<
    ChurchContact,
    'kind' | 'phoneType' | 'value' | 'description' | 'isWhatsApp'
  >[];
  socialLinks: Pick<ChurchSocialLink, 'url' | 'network' | 'description'>[];
}

/** What a signed-out visitor sees of a Church; `slug` is always the current one. */
export interface PublicChurchProfile {
  slug: string;
  name: string;
  accentColor: string | null;
  /** Anonymous URL of the logo; `null` when there is none. */
  logoUrl: string | null;
  /** The Church Programme; a place is left out when it is the Main Address. */
  programme: Omit<RegularActivity, 'atMainAddress'>[];
  /** Public Church Addresses, Main first. */
  addresses: PublicChurchAddress[];
  /** The Main Address's bairro and city/UF, even when it is private. */
  mainAddressArea: MainAddressArea | null;
  /** "Da igreja" first, then Contact Groups in the admin's order; empty groups absent. */
  contactGroups: PublicContactGroup[];
  /** Legal name and CNPJ digits, only when public. */
  legalProfile: { legalName: string; cnpj: string } | null;
}

export interface IPublicChurchProfileManager {
  /** `null` when no Church ever held the slug. */
  getProfile(
    input: GetPublicChurchProfileInput,
  ): Promise<PublicChurchProfile | null>;
}

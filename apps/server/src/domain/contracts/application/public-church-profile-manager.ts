import type {
  MainAddressArea,
  PublicChurchAddress,
} from '../../church-address';
import type { RegularActivity } from '../../entities/regular-activity';

export interface GetPublicChurchProfileInput {
  /** A live or old Church Slug, as the visitor typed it. */
  slug: string;
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
}

export interface IPublicChurchProfileManager {
  /** `null` when no Church ever held the slug. */
  getProfile(
    input: GetPublicChurchProfileInput,
  ): Promise<PublicChurchProfile | null>;
}

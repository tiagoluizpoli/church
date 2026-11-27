import type { MainAddressArea } from '../../domain/church-address';

/** What the `/{slug}` head says about the Church. */
export interface ChurchPageHeadChurch {
  slug: string;
  name: string;
  logoUrl: string | null;
  mainAddressArea: MainAddressArea | null;
}

export interface ChurchPageHeadInput {
  indexHtml: string;
  appName: string;
  publicOrigin: string;
  church: ChurchPageHeadChurch;
}

import type {
  GetPublicChurchProfileInput,
  IPublicChurchProfileManager,
  PublicChurchProfile,
  PublicContactGroup,
} from '../domain/contracts/application/public-church-profile-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { ChurchProgrammeRepository } from '../domain/contracts/infrastructure/church-programme.repository';
import type { ObjectStorage } from '../domain/contracts/infrastructure/object-storage';

interface DbPublicChurchProfileManagerDependencies {
  churchRepository: ChurchRepository;
  objectStorage: ObjectStorage;
  programmeRepository: ChurchProgrammeRepository;
}

/** The sign-in-free Public Church Profile, resolved by live or old slug. */
export class DbPublicChurchProfileManager
  implements IPublicChurchProfileManager
{
  private readonly churchRepository: ChurchRepository;
  private readonly objectStorage: ObjectStorage;
  private readonly programmeRepository: ChurchProgrammeRepository;

  constructor({
    churchRepository,
    objectStorage,
    programmeRepository,
  }: DbPublicChurchProfileManagerDependencies) {
    this.churchRepository = churchRepository;
    this.objectStorage = objectStorage;
    this.programmeRepository = programmeRepository;
  }

  async getProfile({
    slug,
  }: GetPublicChurchProfileInput): Promise<PublicChurchProfile | null> {
    const identity = await this.churchRepository.findPublicIdentityBySlug({
      slug,
    });
    if (!identity) return null;
    const activities = await this.programmeRepository.listRegularActivities({
      churchId: identity.churchId,
    });
    const { addresses, mainAddressArea } =
      await this.churchRepository.findPublicAddresses({
        churchId: identity.churchId,
      });
    const details = await this.churchRepository.getPublicContactDetails({
      churchId: identity.churchId,
    });
    const contactGroups = [null, ...details.groupNames]
      .map(
        (name): PublicContactGroup => ({
          name,
          contacts: details.contacts
            .filter(({ group }) => group === name)
            .map(({ kind, phoneType, value, description, isWhatsApp }) => ({
              kind,
              phoneType,
              value,
              description,
              isWhatsApp,
            })),
          socialLinks: details.socialLinks
            .filter(({ group }) => group === name)
            .map(({ url, network, description }) => ({
              url,
              network,
              description,
            })),
        }),
      )
      .filter(
        ({ contacts, socialLinks }) =>
          contacts.length > 0 || socialLinks.length > 0,
      );
    return {
      addresses,
      mainAddressArea,
      slug: identity.slug,
      name: identity.name,
      accentColor: identity.accentColor,
      logoUrl: identity.logoKey
        ? this.objectStorage.publicUrl({ key: identity.logoKey })
        : null,
      contactGroups,
      legalProfile: details.legalProfile
        ? {
            legalName: details.legalProfile.legalName,
            cnpj: details.legalProfile.cnpj,
          }
        : null,
      programme: activities.map(({ atMainAddress, place, ...activity }) => ({
        ...activity,
        place: atMainAddress ? null : place,
      })),
    };
  }
}

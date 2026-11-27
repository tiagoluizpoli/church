import { formatChurchLocality } from '../domain/church-locality';
import type {
  ActiveChurchResolution,
  IActiveChurchResolver,
} from '../domain/contracts/application/active-church-resolver';
import type {
  ApplicationArea,
  ChurchSelectionOption,
  DbActiveChurchSelectionManagerDependencies,
  GetChurchTimezoneInput,
  IActiveChurchSelectionManager,
  ListSelectableChurchesInput,
  SelectActiveChurchInput,
  ToSelectionOptionInput,
} from '../domain/contracts/application/active-church-selection-manager';
import type { IAuthorityManager } from '../domain/contracts/application/authority-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { ChurchMembershipRepository } from '../domain/contracts/infrastructure/church-membership.repository';
import type { ObjectStorage } from '../domain/contracts/infrastructure/object-storage';
import { churchLogoUrl } from './church-logo-url';

function toSelectionOption({
  comparison,
  objectStorage,
  availableAreas,
}: ToSelectionOptionInput): ChurchSelectionOption {
  return {
    churchId: comparison.churchId,
    name: comparison.churchName,
    timezone: comparison.timezone,
    accessLevel: comparison.accessLevel,
    availableAreas,
    logoUrl: churchLogoUrl({ objectStorage, logoKey: comparison.logoKey }),
    accentColor: comparison.accentColor,
    lastOpenedAt: comparison.lastOpenedAt,
    locality: formatChurchLocality(comparison.mainAddress),
  };
}

export class DbActiveChurchSelectionManager
  implements IActiveChurchSelectionManager
{
  private readonly membershipRepository: ChurchMembershipRepository;
  private readonly authorityManager: IAuthorityManager;
  private readonly activeChurchResolver: IActiveChurchResolver;
  private readonly churchRepository: ChurchRepository;
  private readonly objectStorage: Pick<ObjectStorage, 'publicUrl'>;

  constructor({
    membershipRepository,
    authorityManager,
    activeChurchResolver,
    churchRepository,
    objectStorage,
  }: DbActiveChurchSelectionManagerDependencies) {
    this.membershipRepository = membershipRepository;
    this.authorityManager = authorityManager;
    this.activeChurchResolver = activeChurchResolver;
    this.churchRepository = churchRepository;
    this.objectStorage = objectStorage;
  }

  async listSelectableChurches(
    input: ListSelectableChurchesInput,
  ): Promise<ChurchSelectionOption[]> {
    const comparisons = await this.membershipRepository.listComparisonsByUserId(
      { userId: input.userId },
    );

    if (comparisons.length === 0) return [];
    const churchIds = comparisons.map(({ churchId }) => churchId);
    // `dashboard` is granted to every Church Member; `scheduling` mirrors the
    // signal the app-shell nav gates on (`useCallerRoles`), asked here for all
    // candidate Churches at once rather than only the active one.
    const schedulingIds = await this.authorityManager.listSchedulingChurchIds({
      userId: input.userId,
      churchIds,
    });
    const schedulingChurchIds = new Set(schedulingIds);

    return comparisons.map((comparison) => {
      const availableAreas: ApplicationArea[] = schedulingChurchIds.has(
        comparison.churchId,
      )
        ? ['dashboard', 'scheduling']
        : ['dashboard'];
      return toSelectionOption({
        comparison,
        objectStorage: this.objectStorage,
        availableAreas,
      });
    });
  }

  async selectActiveChurch(
    input: SelectActiveChurchInput,
  ): Promise<ActiveChurchResolution> {
    const resolution = await this.activeChurchResolver.resolve({
      userId: input.userId,
      activeOrganizationId: input.churchId,
    });

    if (resolution.status === 'resolved') {
      await this.membershipRepository.touchOpened({
        userId: input.userId,
        churchId: input.churchId,
      });
    }

    return resolution;
  }

  /**
   * The Church Timezone the client resolves every CalendarDay and displayed
   * time through (ADR-0003). Read on every resolved status/select call — the
   * entry gate runs on each navigation under the Active Church layout, so a
   * changed Church Timezone reaches the client on its next navigation.
   */
  async getChurchTimezone(input: GetChurchTimezoneInput): Promise<string> {
    const church = await this.churchRepository.getById({ id: input.churchId });
    return church.timezone;
  }
}

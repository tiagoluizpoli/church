import { inject, injectable } from 'tsyringe';
import type { ChurchId } from '../domain/branded-ids';
import type {
  ActiveChurchResolution,
  IActiveChurchResolver,
} from '../domain/contracts/application/active-church-resolver';
import type {
  ApplicationArea,
  ChurchSelectionOption,
  GetChurchTimezoneInput,
  IActiveChurchSelectionManager,
  ListSelectableChurchesInput,
  SelectActiveChurchInput,
} from '../domain/contracts/application/active-church-selection-manager';
import type { IAuthorityManager } from '../domain/contracts/application/authority-manager';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type {
  ChurchMembershipComparison,
  ChurchMembershipRepository,
} from '../domain/contracts/infrastructure/church-membership.repository';

interface ToSelectionOptionInput {
  comparison: ChurchMembershipComparison;
  availableAreas: ApplicationArea[];
}

function toSelectionOption({
  comparison,
  availableAreas,
}: ToSelectionOptionInput): ChurchSelectionOption {
  return {
    churchId: comparison.churchId,
    name: comparison.churchName,
    timezone: comparison.timezone,
    accessLevel: comparison.accessLevel,
    availableAreas,
    lastOpenedAt: comparison.lastOpenedAt,
  };
}

interface ResolveAvailableAreasInput {
  userId: ListSelectableChurchesInput['userId'];
  churchId: ChurchId;
}

@injectable()
export class DbActiveChurchSelectionManager
  implements IActiveChurchSelectionManager
{
  constructor(
    @inject('IChurchMembershipRepository')
    private readonly membershipRepository: ChurchMembershipRepository,
    @inject('IAuthorityManager')
    private readonly authorityManager: IAuthorityManager,
    @inject('IActiveChurchResolver')
    private readonly activeChurchResolver: IActiveChurchResolver,
    @inject('IChurchRepository')
    private readonly churchRepository: ChurchRepository,
  ) {}

  async listSelectableChurches(
    input: ListSelectableChurchesInput,
  ): Promise<ChurchSelectionOption[]> {
    const comparisons = await this.membershipRepository.listComparisonsByUserId(
      { userId: input.userId },
    );

    return Promise.all(
      comparisons.map(async (comparison) => {
        const availableAreas = await this.resolveAvailableAreas({
          userId: input.userId,
          churchId: comparison.churchId,
        });
        return toSelectionOption({ comparison, availableAreas });
      }),
    );
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

  /**
   * `dashboard` is granted to every Church Member; `scheduling` mirrors the
   * same `hasSchedulingAccess` signal the app-shell nav already gates on
   * (`useCallerRoles`), computed here per candidate Church rather than only
   * the currently-active one.
   */
  private async resolveAvailableAreas(
    input: ResolveAvailableAreasInput,
  ): Promise<ApplicationArea[]> {
    const hasSchedulingAccess =
      await this.authorityManager.hasSchedulingAccess(input);
    return hasSchedulingAccess ? ['dashboard', 'scheduling'] : ['dashboard'];
  }
}

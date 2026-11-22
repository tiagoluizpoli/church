import type { ChurchId } from '../../branded-ids';
import type {
  ChurchSettings,
  ChurchSettingsChanges,
  ChurchSlugAvailability,
} from '../../church-settings';

/** Church Settings plus the web origin the public `…/slug` address is shown under. */
export interface ChurchSettingsView extends ChurchSettings {
  publicOrigin: string;
}

export interface GetChurchSettingsInput {
  churchId: ChurchId;
}

export interface UpdateChurchSettingsInput {
  churchId: ChurchId;
  /** Already normalised by the Church Settings value objects. */
  changes: ChurchSettingsChanges;
}

export interface SlugAvailabilityInput {
  churchId: ChurchId;
  slug: string;
}

export interface IChurchSettingsManager {
  /** Free, taken, reserved, or held in this Church's own history; never says who holds a taken slug. */
  getSlugAvailability(
    input: SlugAvailabilityInput,
  ): Promise<ChurchSlugAvailability>;
  getChurchSettings(input: GetChurchSettingsInput): Promise<ChurchSettingsView>;
  /** Saves every field in one transaction (last write wins) and reads back the result. */
  updateChurchSettings(
    input: UpdateChurchSettingsInput,
  ): Promise<ChurchSettingsView>;
}

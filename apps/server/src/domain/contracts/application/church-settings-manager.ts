import type { ChurchId } from '../../branded-ids';
import type {
  ChurchSettings,
  ChurchSettingsChanges,
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

export interface IChurchSettingsManager {
  getChurchSettings(input: GetChurchSettingsInput): Promise<ChurchSettingsView>;
  /** Saves every field in one transaction (last write wins) and reads back the result. */
  updateChurchSettings(
    input: UpdateChurchSettingsInput,
  ): Promise<ChurchSettingsView>;
}

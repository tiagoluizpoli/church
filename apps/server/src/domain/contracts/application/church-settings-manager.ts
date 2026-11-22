import type { ChurchId } from '../../branded-ids';
import type {
  ChurchSettings,
  ChurchSettingsChanges,
} from '../../church-settings';

/** Church Settings plus the web origin the public `…/slug` address is shown under. */
export interface ChurchSettingsView extends ChurchSettings {
  publicOrigin: string;
  /** Anonymous URL of the logo, built from its key; `null` when there is none. */
  logoUrl: string | null;
}

export interface UploadChurchLogoInput {
  churchId: ChurchId;
  /** The uploaded file as received; at most 5 MB (the multipart limit). */
  bytes: Uint8Array;
}

export interface RestoreChurchLogoInput {
  churchId: ChurchId;
  key: string;
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
  /** Validates, normalises and stores the logo, then points the Church at it at once. */
  uploadLogo(input: UploadChurchLogoInput): Promise<ChurchSettingsView>;
  /** Drops the Church's logo reference; the stored object stays. */
  removeLogo(input: GetChurchSettingsInput): Promise<ChurchSettingsView>;
  /** Re-applies one of the Church's earlier logo keys (*Desfazer*). */
  restoreLogo(input: RestoreChurchLogoInput): Promise<ChurchSettingsView>;
}

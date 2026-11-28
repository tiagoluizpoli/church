/** Characters a file name may not hold on Windows, macOS or Linux. */
const BANNED_FILE_NAME_CHARACTERS = /[\\/:*?"<>|\p{Cc}]/gu;

export interface ExportFileNameInput {
  /** The localized name, such as `Escala - <Ministry> - <Cycle>`. */
  name: string;
  /** Appended after ` - ` in order, such as `Rascunho`. */
  suffixes?: string[];
}

/**
 * An export's file name, the same on the server and in the browser: banned
 * characters dropped, runs of spaces collapsed. Names stay as the church wrote them.
 */
export function exportFileName({
  name,
  suffixes = [],
}: ExportFileNameInput): string {
  return [name, ...suffixes]
    .join(' - ')
    .replace(BANNED_FILE_NAME_CHARACTERS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

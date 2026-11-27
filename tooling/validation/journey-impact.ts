/** The commit trailer that skips browser journeys for a pure refactor. */
export const JOURNEY_IMPACT_TRAILER = 'Journey-Impact: none - <reason>';

// Spaces only after the dash: `\s` would borrow the next line as the reason.
const TRAILER_PATTERN = /^Journey-Impact:[ \t]*none[ \t]*-(.*)$/gim;

/** The reasons of every `Journey-Impact` trailer; a blank reason does not count. */
export function readJourneyImpactTrailers({
  messages,
}: {
  messages: string[];
}): string[] {
  return messages
    .flatMap((message) => [...message.matchAll(TRAILER_PATTERN)])
    .map((match) => (match[1] ?? '').trim())
    .filter((reason) => reason.length > 0);
}

const BLANK_TRAILER_PATTERN =
  /^Journey-Impact:[ \t]*none[ \t]*(?:-[ \t]*)?$/gim;

/** Every `Journey-Impact` trailer line that gives no reason, to be refused aloud. */
export function readBlankJourneyImpactTrailers({
  messages,
}: {
  messages: string[];
}): string[] {
  return messages
    .flatMap((message) => [...message.matchAll(BLANK_TRAILER_PATTERN)])
    .map(([line]) => line.trim());
}

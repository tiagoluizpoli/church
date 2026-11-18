export interface FormatVolunteerInitialsInput {
  volunteerName: string | null | undefined;
}

/**
 * Up to two initials for an avatar fallback ("Carla Mendes" → "CM").
 *
 * - Single-token names yield one initial ("Madonna" → "M").
 * - Middle names are ignored; only the first and last token count.
 * - Empty / whitespace-only input returns "?" so the avatar is never blank.
 */
export function formatVolunteerInitials({
  volunteerName,
}: FormatVolunteerInitialsInput): string {
  if (!volunteerName) return '?';
  const tokens = volunteerName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '?';
  const first = tokens[0][0];
  const last = tokens.length > 1 ? tokens[tokens.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

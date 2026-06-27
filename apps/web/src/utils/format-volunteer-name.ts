/**
 * Formats a full name as "First L." (first name + last initial).
 *
 * - Single-token names return the token unchanged ("Madonna" → "Madonna").
 * - Empty / whitespace-only input returns an empty string.
 * - Extra internal whitespace is collapsed.
 */
export function formatVolunteerName(name: string | null | undefined): string {
  if (!name) return '';
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  if (tokens.length === 1) return tokens[0];
  const first = tokens[0];
  const lastInitial = tokens[tokens.length - 1][0];
  return `${first} ${lastInitial.toUpperCase()}.`;
}

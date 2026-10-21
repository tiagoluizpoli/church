/** First letter upper-cased; Intl lowercases weekdays and months in pt-BR. */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

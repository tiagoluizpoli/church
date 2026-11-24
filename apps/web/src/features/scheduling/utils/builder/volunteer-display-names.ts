/**
 * Characters of a name the rail card shows before it clips. The card's name
 * column is ~150px of 14px text; a deterministic budget stands in for the real
 * CSS clip because measuring it would re-render the list as widths settle (and
 * a measured value that flips with its own output loops).
 */
export const NAME_VISIBLE_CHARS = 20;

interface VolunteerDisplayNamesInput {
  names: string[];
  budget?: number;
}

function firstAndLast(name: string): string {
  const tokens = name.trim().split(/\s+/);
  return tokens.length > 2 ? `${tokens[0]} ${tokens.at(-1)}` : name;
}

/**
 * Maps each full name to what the card shows. Names are shown in full unless
 * two different names would read the same once clipped at `budget`; those show
 * first + last name (middle names dropped) so they differ. A group whose
 * shortened forms still collide keeps its full names.
 */
export function volunteerDisplayNames({
  names,
  budget = NAME_VISIBLE_CHARS,
}: VolunteerDisplayNamesInput): Map<string, string> {
  const distinct = [...new Set(names)];
  const byVisible = new Map<string, string[]>();
  for (const name of distinct) {
    const visible = name.slice(0, budget);
    byVisible.set(visible, [...(byVisible.get(visible) ?? []), name]);
  }
  const display = new Map(distinct.map((name) => [name, name]));
  for (const group of byVisible.values()) {
    if (group.length < 2) continue;
    const shortened = group.map(firstAndLast);
    if (new Set(shortened).size !== group.length) continue;
    for (const [index, name] of group.entries()) {
      display.set(name, shortened[index]);
    }
  }
  return display;
}

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Regression guard, not a design test. The qualification model went from
 * "hard filter" to "soft constraint with friction" (B-2), and the comment
 * describing it drifted back to the old, wrong story three separate times in
 * the same ticket lineage — including once inside the fix meant to close the
 * drift out. A stale comment here is how the next session re-introduces the
 * bug it already fixed, so this is a grep gate, not a style nit.
 *
 * If this test fails on a genuinely new file, that file's comment almost
 * certainly needs the same correction, not an exemption from the list below.
 */
const FILES_THAT_MUST_NOT_CLAIM_A_HARD_FILTER = [
  'board/cycle-builder-matrix.tsx',
  '../../utils/builder/cycle-builder-fit.utils.ts',
  '../../utils/builder/cycle-builder-ranking.utils.ts',
  '../../utils/builder/cycle-builder-assignment-index.utils.ts',
  'board/cycle-builder-cell.tsx',
  'board/cycle-builder-cell-parts.tsx',
  'volunteer-rail/volunteer-card.tsx',
  'assignment/assignment-picker.tsx',
  'assignment/override-dialog.tsx',
];

const BANNED_PHRASES = [
  /qualification is a hard filter/i,
  /qualified? .{0,40}never reaches the (rail|picker)/i,
];

describe('qualification model documentation (regression guard)', () => {
  it.each(
    FILES_THAT_MUST_NOT_CLAIM_A_HARD_FILTER,
  )('%s does not describe qualification as a hard filter', (fileName) => {
    const contents = readFileSync(join(DIR, fileName), 'utf8');
    for (const phrase of BANNED_PHRASES) {
      expect(contents).not.toMatch(phrase);
    }
  });
});

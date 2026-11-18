import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const SERVER_KEYS_PATH = 'apps/server/seeds/e2e/journey-keys.ts';
const WEB_FIXTURES_DIR = 'apps/web/tests/fixtures';
const RECIPE_CONSTANT =
  /const\s+[A-Z][A-Z0-9_]*RECIPE(?:_NAME)?\s*=\s*'([^']+)'/g;
const SERVER_RECIPE_BLOCK =
  /export const E2E_JOURNEY_RECIPE_NAMES = \{([\s\S]*?)\} as const/;
const SERVER_RECIPE_VALUE = /^\s*\w+:\s*'([^']+)',?\s*$/gm;

interface ReadTextInput {
  path: string;
}

function readText({ path }: ReadTextInput): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function serverRecipeNames(): string[] {
  const block = SERVER_RECIPE_BLOCK.exec(readText({ path: SERVER_KEYS_PATH }));
  if (!block?.[1]) throw new Error('E2E_JOURNEY_RECIPE_NAMES not found');
  return [...block[1].matchAll(SERVER_RECIPE_VALUE)].map(
    (match) => match[1] ?? '',
  );
}

interface WebRecipeConstant {
  path: string;
  name: string;
}

function webRecipeConstants(): WebRecipeConstant[] {
  const paths = [
    ...readdirSync(join(REPO_ROOT, WEB_FIXTURES_DIR)),
    ...readdirSync(join(REPO_ROOT, WEB_FIXTURES_DIR, 'journeys')).map(
      (file) => `journeys/${file}`,
    ),
  ]
    .filter((file) => file.endsWith('.ts') && !file.includes('.test.'))
    .map((file) => `${WEB_FIXTURES_DIR}/${file}`);

  return paths.flatMap((path) =>
    [...readText({ path }).matchAll(RECIPE_CONSTANT)].map((match) => ({
      path,
      name: match[1] ?? '',
    })),
  );
}

describe('E2E journey recipe names', () => {
  const constants = webRecipeConstants();
  const serverNames = serverRecipeNames();

  it('finds the server registry and the web constants that mirror it', () => {
    expect(serverNames.length).toBeGreaterThan(0);
    expect(constants.length).toBeGreaterThan(0);
  });

  it.each(
    constants.map(({ path, name }) => [`${path}: ${name}`, name]),
  )('%s exists in E2E_JOURNEY_RECIPE_NAMES', (_label, name) => {
    expect(serverNames).toContain(name);
  });
});

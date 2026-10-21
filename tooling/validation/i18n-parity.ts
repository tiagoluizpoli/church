import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const catalogSchema = z.record(z.string(), z.string());

interface ExtractParamsInput {
  message: string;
}

interface CheckI18nParityInput {
  en: Record<string, string>;
  ptBR: Record<string, string>;
}

interface ReadCatalogInput {
  dir: string;
  file: string;
}

function readCatalog({ dir, file }: ReadCatalogInput): Record<string, string> {
  return catalogSchema.parse(JSON.parse(readFileSync(join(dir, file), 'utf8')));
}

function extractParams({ message }: ExtractParamsInput): Set<string> {
  const params = new Set<string>();
  for (const match of message.matchAll(/\{(\w+)\}/g)) {
    if (match[1]) params.add(match[1]);
  }
  return params;
}

export function checkI18nParity({ en, ptBR }: CheckI18nParityInput): string[] {
  const failures: string[] = [];

  const enKeys = new Set(Object.keys(en).filter((k) => k !== '$schema'));
  const ptBRKeys = new Set(Object.keys(ptBR).filter((k) => k !== '$schema'));

  for (const key of enKeys) {
    if (!ptBRKeys.has(key)) failures.push(`pt-BR missing key: ${key}`);
  }
  for (const key of ptBRKeys) {
    if (!enKeys.has(key)) failures.push(`en missing key: ${key}`);
  }

  for (const key of enKeys) {
    if (!ptBRKeys.has(key)) continue;
    const enParams = extractParams({ message: en[key] ?? '' });
    const ptBRParams = extractParams({ message: ptBR[key] ?? '' });
    for (const p of enParams) {
      if (!ptBRParams.has(p))
        failures.push(`${key}: pt-BR missing param {${p}}`);
    }
    for (const p of ptBRParams) {
      if (!enParams.has(p)) failures.push(`${key}: en missing param {${p}}`);
    }
  }

  return failures;
}

if (import.meta.main) {
  const messagesDir = join(import.meta.dir, '../../packages/i18n/messages');
  const en = readCatalog({ dir: messagesDir, file: 'en.json' });
  const ptBR = readCatalog({ dir: messagesDir, file: 'pt-BR.json' });

  const failures = checkI18nParity({ en, ptBR });
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const Dirname = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.join(Dirname, 'detector', 'detect-antipatterns.mjs'),
  path.join(Dirname, '..', '..', 'cli', 'engine', 'detect-antipatterns.mjs'),
];
const detectorPath = candidates.find((p) => fs.existsSync(p));

if (!detectorPath) {
  process.stderr.write('Error: bundled detector not found.\n');
  process.exit(1);
}

const { detectCli } = await import(pathToFileURL(detectorPath));

await detectCli();

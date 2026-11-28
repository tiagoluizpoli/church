import { resolve } from 'node:path';

/** The Typst version `bun run typst:install` pins; part of the cache key. */
export const TYPST_VERSION = '0.15.1';

const SERVER_ROOT = resolve(import.meta.dirname, '../../..');

export const TYPST_BINARY = resolve(SERVER_ROOT, '../../.tools/bin/typst');
export const TYPST_FONTS_DIR = resolve(SERVER_ROOT, 'typst/fonts');
export const TYPST_TEMPLATES_DIR = resolve(SERVER_ROOT, 'typst/templates');

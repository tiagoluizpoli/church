import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** The parsed `.github/workflows/ci.yml` the CI lane tests assert on. */

export interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
}

export interface WorkflowService {
  env?: Record<string, string>;
  ports?: string[];
}

export interface WorkflowJob {
  env?: Record<string, string>;
  services?: Record<string, WorkflowService>;
  steps: WorkflowStep[];
}

export interface Workflow {
  jobs: Record<string, WorkflowJob>;
}

export const ROOT = resolve(import.meta.dir, '../../..');

export const workflow = Bun.YAML.parse(
  readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8'),
) as Workflow;

export const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

import { spawnSync } from 'node:child_process';

/**
 * `bun run compile` of `@church/i18n`, run from that package. Under load,
 * Paraglide can fail to open its Lix project in time, so each output retries
 * once on that error and on no other.
 */

const COMPILE_SCRIPTS = ['compile:locale-modules', 'compile:message-modules'];
const LIX_TIMEOUT = 'Lix open did not settle';

interface ScriptInput {
  script: string;
}

function runScript(input: ScriptInput) {
  const result = spawnSync(process.execPath, ['run', input.script], {
    encoding: 'utf8',
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  const output = result.stdout + result.stderr;

  return {
    status: result.status ?? 1,
    timedOut: output.includes(LIX_TIMEOUT),
  };
}

for (const script of COMPILE_SCRIPTS) {
  let result = runScript({ script });
  if (result.status !== 0 && result.timedOut) {
    console.error(`⚠ ${script}: "${LIX_TIMEOUT}", retrying once.`);
    result = runScript({ script });
  }
  if (result.status !== 0) process.exit(result.status);
}

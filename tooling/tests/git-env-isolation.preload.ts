// A git hook (lefthook pre-push → validate:affected → bun test tooling)
// exports GIT_DIR and friends; tests that run git in temp dirs would
// otherwise write to the repository the hook runs in.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('GIT_')) delete process.env[key];
}

// Bun.spawn/spawnSync default to the env captured at startup, not the
// current process.env, so the deletion above alone does not reach them.
for (const name of ['spawn', 'spawnSync'] as const) {
  const original = Bun[name] as (...args: unknown[]) => unknown;
  Object.defineProperty(Bun, name, {
    value: (...args: unknown[]) => {
      const options = Array.isArray(args[0]) ? (args[1] ?? {}) : args[0];
      const withEnv = { env: process.env, ...(options as object) };
      return Array.isArray(args[0])
        ? original(args[0], withEnv)
        : original(withEnv);
    },
  });
}

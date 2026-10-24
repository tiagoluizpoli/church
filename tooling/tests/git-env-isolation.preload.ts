// A git hook (lefthook pre-push → validate:affected → bun test tooling)
// exports GIT_DIR and friends; tests that run git in temp dirs would
// otherwise write to the repository the hook runs in.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('GIT_')) delete process.env[key];
}

const withEnv = (options: unknown) => {
  const object = typeof options === 'object' && options !== null ? options : {};
  // After the spread, so an explicit `env: undefined` still gets process.env.
  return {
    ...object,
    env: ('env' in object ? object.env : undefined) ?? process.env,
  };
};

// Bun.spawn/spawnSync default to the env captured at startup, not the
// current process.env, so the deletion above alone does not reach them.
for (const name of ['spawn', 'spawnSync'] as const) {
  const original = Bun[name];
  // Bun's own property is non-configurable; keep it writable for spyOn.
  Object.defineProperty(Bun, name, {
    value: (...args: unknown[]) =>
      Array.isArray(args[0])
        ? Reflect.apply(original, Bun, [args[0], withEnv(args[1])])
        : Reflect.apply(original, Bun, [withEnv(args[0])]),
    writable: true,
  });
}

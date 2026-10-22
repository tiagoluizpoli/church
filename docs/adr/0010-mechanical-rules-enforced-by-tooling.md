# Mechanical repo rules are enforced by tooling, judgement calls by review

## Status

accepted

## Context

In Spec 07 ([#481](https://github.com/tiagoluizpoli/church/issues/481)) the code review found constitution VII (Explicit Parameter Contracts) breaches in six new modules, which cost an extra fix worker and review cycle. VII was enforced only by review, plus a narrow grit plugin that caught inline object types inside `mutationFn`/`queryFn`. Decided in [Turn mechanical repo rules into lint checks](https://github.com/tiagoluizpoli/church/issues/535).

## Decision

- **Mechanical rules fail `bun run lint`.** A rule that is a fixed pattern (syntax shape, banned API, import shape, file location) gets a tool check wired into `lint` and `validate:affected`. Rules that need judgement stay with review. The inventory of rules and their checks lives in `docs/agents/tooling.md`.
- **VII is the first case, at full constitution scope.** Every function, method and constructor in application code (`apps/*/src`, `packages/*/src`, excluding generated files and `tests/`) takes at most one parameter, with no exception for `tx`, signals or options: "what counts as data" is a judgement a tool cannot make. The same limit applies to our own declarations without a body: interface method signatures and function types. Constitution VII is amended to say so. Inline object types are banned in parameter, variable, return and `as` positions.
- **Framework-controlled signatures are exempt by type information or a reasoned inline comment.** A function passed directly as a call argument or object property value is exempt only when the callee's declaration lives outside our code (a dependency); a callback to one of our own helpers is checked like any function. A named function whose signature a framework controls (Fastify plugins, handlers) carries an inline suppression comment stating the reason. No path or name allowlists.
- **Existing violations are fixed, not baselined.** The rule turns on only once the codebase passes it.
- **The check is a TypeScript compiler-API guard in `tooling/validation/`**, like the test-placement guard, not a Biome grit plugin. The narrow grit rule it supersedes is deleted.

## Considered Options

- **Exported functions only** (as first proposed). Rejected: weaker than the constitution, so review would still have to check internal helpers and methods, which is exactly the cost being removed.
- **A baseline of known violations.** Rejected: every later change to a baselined file would again depend on someone remembering VII.
- **A Biome grit plugin**, like the date-time seam guard. Rejected: in Biome 2.4 a plain parameter-count pattern did not fire and `biome-ignore lint/plugin` had no effect, and the callback exemption is awkward to express. The cost is losing in-editor diagnostics.

## Consequences

- About 215 existing signatures change (repository methods and their 61 interface signatures taking `(churchId, …, tx)`, entity constructors, mappers, function types, inline types), together with their callers and tests.
- The guard needs a type-checked program (not just parsed files) to resolve callees, so it costs roughly a typecheck per run.
- These rules are not specific to this repo; moving the inventory and checks to the shared global TypeScript guidance is a later step.

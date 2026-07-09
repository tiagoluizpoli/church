## Branch Skip Rules (Step 4a)

Skip `speckit.git.feature` (4a) only when the current branch is already a
feature branch — i.e., it is NOT one of the protected branches below:

| Protected branch pattern | Examples |
|---|---|
| `main` | `main` |
| `master` | `master` |
| `develop` | `develop` |
| `release/*` | `release/1.4`, `release/2026-q3` |
| `hotfix/*` | `hotfix/critical-bug` |

If on any of the above, always run 4a first. If on any other branch name,
treat it as an existing feature branch and skip 4a.

---



Disclosed detail for Step 3 (sync) and phase-scoping rules.

---

## Drift-Log Format

File: `.specify/memory/drift-log.md`

```markdown
## [YYYY-MM-DD] Drift sync — <branch-name>

**Phase**: <phase label from user, e.g. "4.1 manual fixes and code stabilization">

### Artifact changes
| Artifact | Divergence | Action taken |
|---|---|---|
| specs/NNN-<name>/spec.md | <what drifted> | <how patched> |
| specs/NNN-<name>/plan.md | <what drifted> | <how patched> |
| specs/NNN-<name>/tasks.md | <what drifted> | <how patched> |

### Notes
<any additional context>
```

Create `.specify/memory/drift-log.md` if it does not exist yet.
Append each sync as a new level-2 heading — never overwrite prior entries.

---

## Phase-Scoping Rules

When the user names a **phase** (e.g. "phase 4.1 manual fixes"):

1. Read the phase's task list from `tasks.md` — identify which tasks belong
   to that phase by their phase heading or task-ID range.
2. Limit the codebase diff in Step 3 to the files named in those tasks.
3. Record the phase label in the `drift-log.md` entry under `**Phase**:`.
4. Scope `impeccable polish` in Step 6 to the same file set.

Do not expand scope beyond the named phase unless the user explicitly asks.

---

## Skill Invocation Map

| Step | Skill to invoke |
|---|---|
| 1 — Route | `find-skills` |
| 2 — Enhance | `prompt-optimizer` |
| 3 — Sync | *(built-in drift steps — no external skill)* |
| 4 — Plan | `speckit-specify`, `speckit-plan`, `speckit-tasks` |
| 5 — Implement | `speckit-implement` + `karpathy-guidelines` |
| 6 — Polish | `impeccable polish` |

**Critical**: invoke each skill by reading its `SKILL.md` and following its
instructions. Do not paraphrase or shortcut a skill's own protocol.

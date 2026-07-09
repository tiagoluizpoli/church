---
name: vibe-coder
description: Repeatable vibe-change session pipeline. Routes skills, enhances the brief, syncs spec drift, runs the speckit plan pipeline, implements, then polishes. Use when the user says "vibe coder", "vibe change", "vibe session", or invokes /vibe-coder.
argument-hint: "Describe the vibe change you want to make"
user-invocable: true
disable-model-invocation: false
---

# Vibe Coder — Session Pipeline

Complete each step fully before advancing.
**Invoke each named skill — never re-implement it.**

---

## Step 0 · Compress (`caveman`)

Invoke `caveman` immediately. All session output runs in caveman mode until the session closes.

Completion criterion: all subsequent output is compressed.

---

## Step 1 · Route (`find-skills`)

Invoke `find-skills` on the user's request.

Completion criterion: active specialist squad announced.

---

## Step 2 · Optimize (`prompt-optimizer`)

Invoke `prompt-optimizer` with the raw user request.

Completion criterion: high-fidelity engineering brief produced with governance
blocks and measurable success criteria.

---

## Step 3 · Sync (spec drift)

**Sync** planning artifacts to what was actually built before writing any new plan.

1. `git branch --show-current` → note branch.
2. Read `.specify/feature.json` → locate active feature directory.
3. Read `spec.md`, `plan.md`, `tasks.md` (skip missing files).
4. For each file named in those docs, read it and note divergences from the spec.
5. Patch every divergent spec artifact in place (update, don't recreate).
6. Append to `.specify/memory/drift-log.md` — format in [REFERENCE.md](REFERENCE.md).

Completion criterion: every divergence patched and recorded in `drift-log.md`.
Zero unresolved gaps.

> No `.specify/feature.json`? Skip steps 2–6 and go directly to Step 4.

---

## Step 4 · Plan (speckit pipeline)

**4a. Branch — MANDATORY** (`speckit.git.feature`):
Invoke `speckit.git.feature` with the feature description.
Wait for JSON output — capture `BRANCH_NAME` and `FEATURE_NUM`.
Do NOT proceed to 4b until the branch is created and checked out.
Verify with `git branch --show-current`.

> Skip 4a only if already on a feature branch. See [REFERENCE.md](REFERENCE.md) for
> protected-branch list and skip rules.

**4b.** Invoke `speckit-specify`.
**4c.** Invoke `speckit-plan`.
**4d.** Invoke `speckit-tasks`.

Present the plan. **Wait for explicit user approval before continuing.**

Completion criterion: user approves AND `git branch --show-current` is a feature branch.

---

## Step 5 · Implement (`speckit-implement`)

Invoke `speckit-implement`. Load `karpathy-guidelines` and apply its four
rules for every task (think before coding, minimum code, surgical changes,
verify or fail).

Completion criterion: every task in `tasks.md` marked `[x]` and the build
passes (`pnpm guard` or equivalent quality gate).

---

## Step 6 · Polish (`impeccable polish`)

Invoke `impeccable polish` on every UI surface touched in Step 5.

Completion criterion: the polish report lists zero P0/P1 findings on the
modified surfaces. If findings remain, address them and re-run before closing
the session.

---

## Session rules

- Steps 0–3 are mandatory even for "tiny" changes — drift compounds.
- User approval gates Step 5; never self-approve.
- If the user names a **phase** (e.g. "phase 4.1 manual fixes"), scope the
  sync and polish to that phase's files only. Log the phase label in `drift-log.md`.
- If a required skill is unavailable, stop and name the missing skill.

See [REFERENCE.md](REFERENCE.md) for drift-log format, phase-scoping, and branch rules.

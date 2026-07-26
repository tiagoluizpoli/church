# Backlog Management Guide

To minimize token usage and context pollution during feature development, the Volunteer Scheduling backlog is organized as a modular structure. 

Instead of reading or writing a single large `BACKLOG.md` file, agents and developers work with individual files per item under the `items/` directory. A central tabular index file (`index.md`) links them all.

> [!IMPORTANT]
> **Agent Consumption Rule (Token Saving)**
> - **DO NOT** read individual files inside `items/` by default or during initial context gathering.
> - When looking for a backlog item, first scan the table in [index.md](./index.md). 
> - Open **only** the specific markdown file (e.g., `items/BL-001.md`) associated with the item you have been explicitly asked to check or implement.
> - Do not read or load other files in the `items/` directory. YAGNI (You Aren't Gonna Need It).

## Directory Structure

```
backlog/
├── README.md        # This guide
├── index.md         # The central table index of all active items
└── items/
    ├── BL-001.md    # Detail file for BL-001
    ├── BL-003.md    # Detail file for BL-003
    └── ...
```

---

## The backlog is ordered

Since 2026-07-26, [index.md](./index.md) is the **source of truth for order**, not just a list. It has three sections, and every item lives in exactly one of them:

- **Ranked Backlog** — queued work. Carries `Rank` (a strict ordinal), `Wave` (the tier of the ordering criterion), `Blocked by`, and `Issue`. Every ranked item has a `backlog`-labelled GitHub issue.
- **Parked** — a real gap that is **not queued**. No rank, no issue. Carries a **promotion trigger**: a falsifiable condition that moves it into the ranked table.
- **Closed during reconciliation** — verdict recorded, file kept for history.

The ordering criterion is **pain now → rework cost → new capability**, mapped onto waves 1/2/3. Waves are purely ordinal: no dates, no effort estimates.

> [!IMPORTANT]
> **A new item is not automatically ranked.** Adding a row to the ranked table asserts it is queued *at that position*, which shifts everything below it. If you are not making that claim, park it — a parked item with a written trigger is a complete, honest backlog entry.

---

## How to Add a New Backlog Item

When you identify a new requirement, enhancement, or deferred task:

1. **Find the Next ID**:
   - Open [index.md](./index.md) and locate the highest `BL-XXX` ID across **all three** sections (ranked, parked, closed) — IDs are never reused.
   - The next ID is sequential.

2. **Create the Detail File**:
   - Create a new markdown file: `items/BL-XXX.md` (substituting `XXX` with your padded ID).
   - Use the **Item Template** below, including its status block.

3. **Decide: ranked or parked?**
   - **Ranked** — someone is blocked, or the cost of waiting is rising. Pick the wave from the criterion, then a rank *within* it, and write a one-line **"Why it sits here"** tying the position to the criterion. Note any real `Blocked by` dependency — a genuine dependency, not an ordering preference.
   - **Parked** — the gap is real but nobody has asked for it. Write a **promotion trigger** instead: a falsifiable condition, not a priority label. For usage-gated items the convention is the **second occurrence** — one request is an anecdote, two is a pattern.

4. **If ranked, create the GitHub issue**:
   - `gh issue create -R tiagoluizpoli/church -l backlog -t "BL-XXX — Title" -b "…"`
   - The body links back to `items/BL-XXX.md` and restates rank, wave and the "Why it sits here" line.
   - Wire any dependency as a **native** GitHub `blocked by` relationship so it renders in the tracker UI:
     `gh api -X POST repos/tiagoluizpoli/church/issues/<blocked#>/dependencies/blocked_by -F issue_id=<blocker's numeric id>`
   - Label with **`backlog` only** — no area or wave labels. `index.md` already carries the category, and a wave label would duplicate the ordering into a second place that must be relabelled on every re-rank. Revisit only if the ranked set grows past ~25.

5. **Update the Index**:
   - **Ranked**: `| Rank | [BL-XXX](./items/BL-XXX.md) | Title | Category | Wave | Blocked by | Issue |`, inserted at its rank, renumbering the items below it.
   - **Parked**: `| [BL-XXX](./items/BL-XXX.md) | Title | Category | Promotion trigger |`.

### Closing or parking an existing item

Do not delete the file. Add a status block at the top recording the verdict, the date, the evidence, and a link to the decision, then move its row into the **Parked** or **Closed during reconciliation** section. A resolved item that leaves the table silently loses the reason it was ever raised.

---

## Item Template

Use this format when creating a new backlog item under `items/`:

```markdown
# BL-XXX — [Item Title]

<!-- Status block. Use the RANKED form or the PARKED form, never both. -->

> ## 📌 Rank N · Wave W (tier W) · Issue [#NN](https://github.com/tiagoluizpoli/church/issues/NN)
>
> **Why it sits here** — [one or two sentences tying this position to the criterion: what is broken now, what gets more expensive, or what new surface this opens.]
>
> **Blocked by [BL-YYY](./BL-YYY.md)** — [why it is a real dependency, not a preference. Omit this line if there is none.]

<!-- or -->

> ## 🅿️ Parked YYYY-MM-DD — not queued, no rank
>
> [Why it is parked: the gap is real, but nobody has asked / the decision it needs is unmade.]
>
> **Promotion trigger** — [a falsifiable condition. Usage-gated items use the second-occurrence threshold.]

**Status**: Ranked — wave W, rank N   *(or: Parked / Closed — <verdict>)*
**Feature area**: [e.g. Schedule Builder / Volunteer Dashboard / Backend Architecture]

## Summary

[A brief description of what is requested and what the change accomplishes.]

## Full Context

[Include any relevant context from spec drafting, grilling sessions, or design decisions. Be descriptive but concise.]

## Suggested Approach

[Technical guidance or suggested starting points for the implementation.]

## Prerequisites / Dependencies

[List any files, features, database migrations, or specs that must be completed first.]

## Success Criteria

1. [Criterion 1]
2. [Criterion 2]
```

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

## How to Add a New Backlog Item

When you identify a new requirement, enhancement, or deferred task:

1. **Find the Next ID**:
   - Open [index.md](./index.md) and locate the highest `BL-XXX` ID (e.g., `BL-018`).
   - The next ID will be sequential (e.g., `BL-019`).

2. **Create the Detail File**:
   - Create a new markdown file: `items/BL-XXX.md` (substituting `XXX` with your padded ID).
   - Use the **Item Template** below.

3. **Update the Index**:
   - Open [index.md](./index.md).
   - Add a new row to the table referencing your new item:
     `| [BL-XXX](./items/BL-XXX.md) | Your Title | Category | Status |`

---

## Item Template

Use this format when creating a new backlog item under `items/`:

```markdown
# BL-XXX — [Item Title]

**Status**: Backlog / Review / Proposed
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

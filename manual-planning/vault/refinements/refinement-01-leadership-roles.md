# Refinement 01: Leadership Roles & Team Simplification

## Context & Architectural Decision
During the local seeding implementation, we identified a redundancy in how Team Leadership is handled across the schema:
1. The `team` entity has a hardcoded `leader_id` column (creating a single-leader bottleneck).
2. The `ministry_volunteer` join table has a `system_role` column (`leader`, `sub_leader`, `volunteer`), which supports multi-role and contextual leadership (a volunteer can be a leader in one ministry and a regular volunteer in another).

**Decisions:**
- **Remove `leader_id` from the `team` entity.** We will rely entirely on the `ministry_volunteer` join table to determine leadership.
- **Role Context:** A `leader` in `ministry_volunteer` implies a Ministry Leader. A `sub_leader` implies a Team Leader (or equivalent). A `volunteer` is a regular member.
- **Seeding Realism:** The local database seeder needs to backfill these roles so that every Ministry has at least one `leader` and every Team has at least one `sub_leader`, rather than hardcoding everyone as a regular `volunteer`.

---

## Instructions for Specification Updates
The following manual planning files must be updated incrementally. **Do not touch any code until all specifications are updated.**

### 1. Update `specifications/01-core-entities.md`
- **Section 4. Team Entity:** Remove the line `- **leader_id**: UUID (Foreign Key to Volunteer - optional sub-leader)`.
- **Section 5. Volunteer Entity (Ministry_Volunteer Join Table):** Add a brief note clarifying that `system_role` is the sole mechanism for designating Ministry Leaders (`leader`) and Team Leaders (`sub_leader`).

### 2. Update `specifications/S1-db-schema.md`
- **Section IV. Ministry_Volunteer (Join Table):** Add a note:
  > *Leadership is determined by `system_role`. A volunteer with role `leader` or `sub_leader` in a given ministry/team membership is the leader for that context. One volunteer can hold different roles across different ministries.*
- **Section 3. Testing Requirements:** Add an integration test requirement to verify that Team leadership queries rely on the join table, not on a team column.

### 3. Update `specifications/S3-local-seeding.md`
- **Generators / Rules:** Update the rules for Volunteer generation. 
- **Rule Addition:** Instead of defaulting all `system_role` values to `volunteer`, the seeder must implement contextual assignment:
  - The first volunteer attached to a ministry gets `system_role: 'leader'`.
  - The second volunteer (or first attached to a specific team) gets `system_role: 'sub_leader'`.
  - The rest get `system_role: 'volunteer'`.
- **Assertions:** Require an integration test assertion ensuring every Ministry has at least one `leader` and every Team has at least one `sub_leader`.

---

## SpecKit Agent Handoff & Instructions

This file serves as the context for the next chat session. 

### 1. Git Flow & Execution Strategy
To maintain repository organization, the agent must follow this strict branching and merging flow:
- **Baseline:** The current active branch (`003-local-seeding`) must first be merged into `develop`.
- **Manual Planning Phase:** The updates to the `manual-planning/` files defined in this document must be committed directly to the `develop` branch.
- **SpecKit Execution Phase (Per Specification):** When SpecKit kicks in to update the `specs/` files and implement the code, it must isolate work by specification:
  1. Check out the specific feature branch for the specification being updated (e.g., `001-db-schema` or `003-local-seeding`). If the branch was deleted, recreate it from `develop`.
  2. Merge the updated `develop` branch into this feature branch.
  3. Execute the SpecKit planning update (modifying the `specs/` files) and the code implementation on this branch.
  4. Merge the feature branch back into `develop`.
  5. Repeat this cycle for the next specification branch.

### 2. Instructions for the SpecKit Agent
1. **Target:** Your goal is to **complement the existing specification planning files** (`specs/` directory) with the changes defined above, following the Git flow strictly.
2. **Action:** Read the existing `01-core-entities.md`, `S1-db-schema.md`, and `S3-local-seeding.md` files in the `manual-planning` directory, and surgically apply the updates to their respective generated `specs/` files.
3. **Constraint:** Do not rewrite the files from scratch. Integrate these refinements into the existing context.
4. **Stop Condition:** Once the manual planning specifications have been successfully updated to reflect these decisions, **STOP**. 

**DO NOT execute any code implementation automatically.** The user will review the updated planning files and manually invoke the implementation phase (e.g., via `/speckit.implement`) on the respective branches when ready.

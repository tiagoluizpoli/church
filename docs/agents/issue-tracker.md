# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json title,body,labels,comments`, filtering with `--jq`. The plain-text `gh issue view` fails in this repo (Projects classic deprecation error).
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --json title,body,labels,comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42 --json number` and fall back to `gh issue view 42 --json number`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --json title,body,labels,comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.

## Wrapper operations

A **wrapper** is how this repo batches work: one parent issue whose children are run together and land in one PR. [#1218](https://github.com/tiagoluizpoli/church/issues/1218) is the reference.

- **Wrapper**: a single issue titled `Wrapper: <summary>`, with no labels of its own. Its body stands alone, so a run needs no other handoff. It holds:
  - an intro listing every ticket, marking the isolated ones;
  - `## Run instructions (orchestrator)`, with a `### Batches` table (batch, child, notes) and the expected merge conflicts;
  - `## Worker rules (copy into every brief)`;
  - `## Not in this wrapper`.
- **Children**: every child is a native sub-issue of the wrapper _and_ carries the `wrapper:<n>` label, where `<n>` is the wrapper's number. A task list or a mention in the body doesn't replace either.
  - Create the label once: `gh label create wrapper:<n> --color BFD4F2 --description "Child of wrapper #<n>"`.
  - Label a child: `gh issue edit <child> --add-label "wrapper:<n>"`.
  - Link it: `gh api -X POST repos/<owner>/<repo>/issues/<n>/sub_issues -F sub_issue_id=<child-db-id>`, where `<child-db-id>` is `gh api repos/<owner>/<repo>/issues/<child> --jq .id` (the database id, _not_ the `#number`).
  - Read them back: `gh api repos/<owner>/<repo>/issues/<n>/sub_issues`.
- **Specs**: a spec is added as a single child. Its tickets stay its own sub-issues; don't link or label them under the wrapper.
- **Board**: add the wrapper and every child to the Church System board (project 5): `gh project item-add 5 --owner tiagoluizpoli --url <issue-url>`. `gh project` needs the `project` token scope (`gh auth refresh -s project`).
- **Branch and PR**: one integration branch, `spec/<n>-ticket-batch`, cut from `develop`, and one PR into `develop` that closes the wrapper and its children (and a child spec's tickets).
  - An isolated child (for example, a proposal-only review) is named as such in the wrapper body, with its own branch and, if it changes code, its own PR. The combined PR doesn't close it.
  - `develop` isn't the default branch, so closing keywords don't close issues when the PR merges. Close them with `gh issue close` and read their state back.
- **Follow-ups**: an issue filed by a run becomes a sub-issue of the next wrapper. Never leave one without a parent.

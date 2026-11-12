## Resolution — owner confirmed, 2026-11-11

### Chosen convention and scope

Use Event Models as the desktop reference: compact aligned tables, selectable/copyable text and explicit actions at the end of each row. Clicking ordinary row text must not open editing or navigate. Apply to Event Models, People, Ministries, Invitations, Cycles and relevant Schedule lists, including the main Schedules list, Ministry preparation lists and Cycle calendar review where applicable.

For mobile, the owner chose option A, then refined it: show the permitted actions directly on the card, aligned right. Current one/two-action rows need no Actions menu: Edit/Delete, Resend/Revoke and Prepare/Assign are direct buttons. Retain 44px minimum touch targets; wrap the action group below content when space is insufficient. No whole-card activation. No trigger for a row with no permitted actions.

Reuse and adapt the existing `apps/web/src/components/ui/data-table.tsx`, not duplicated tables or a second framework. Its interface keeps columns, stable row identity, cell/mobile content and row actions configurable. Shared composition owns consistent layout and accessible list/table semantics; consumers retain data fetching, filters, pagination, permissions, sorting decisions, domain state and mutations/confirmations. Ordinary mobile record lists should use list semantics, not an unconditional listbox. Genuine pickers remain distinct.

The prototype establishes organization and interactions only. Implementation must use the existing application visual identity, typography, tokens and UI primitives. Prototype colors, spacing and system-font fallback are not a new visual specification.

### Preserved differences

- Cycles: explicit Select/Open control updates the existing selected Cycle context; announce selected state. No implicit selection by ordinary row text. Preserve current/past grouping.
- Cycle calendar: retain explicit expansion controls, event/block hierarchy and state-dependent actions; do not flatten away the hierarchy or confuse expansion with editing.
- People/Ministries/Schedules: explicit row-end View/Open action preserves existing destinations and scoped data. No new detail routes or domain actions are implied.
- Invitations: preserve existing grant, delivery, expiry and closure information; compact mobile secondary information can remain accessible through labelled inline details. Resend/Revoke remain conditional on server permissions, with pending/error feedback and destructive confirmation.
- Schedules: preserve stage/counts and existing action guards. Disabled Assign keeps a visible reason on touch, not a hover-only explanation. This decision does not select the Event preparation editor; that remains in its own ticket.

### Acceptance and verification for later implementation

1. Desktop names/emails/dates can be selected and copied without activating an action. All row actions, sorting, Cycle selection and calendar expansion have clear accessible names, visible focus and keyboard operation.
2. Mobile shows direct right-aligned buttons with at least 44px targets, no nested interactive controls, no whole-card navigation and no clipping at 320/390px or enlarged text. Menus with one remaining action are not introduced.
3. Preserve existing information, filters, pagination, sorting, Church timezone, permissions and confirmations. Retain loading, empty, filtered-empty, retry, pagination errors and pending/success/error states. Do not expose unauthorized actions or erase existing rows contrary to current error/authority rules.
4. Reuse the existing shared DataTable seam, including justified stable identity and parent/child mobile-item accommodations. Focused shared-component and affected-screen tests verify behavior, not prototype markup. Later implementation follows repository affected/final validation gates and rendered checks for both viewport branches, plus keyboard and assistive-technology review.

### Evidence and assets

Static comparison at HEAD `71efc820f9516a7970e51b761c0f36f8d8a98785`: [comparison report](file:///home/tiago/.local/state/agent-runs/church-wayfinder-852/comparison.md). Primary throwaway artifact: [mobile comparison prototype](file:///home/tiago/.local/state/agent-runs/church-wayfinder-852/mobile-list-prototype.html); [review notes](file:///home/tiago/.local/state/agent-runs/church-wayfinder-852/review-notes.md). These are machine-local assets, not portable GitHub attachments; no branch was pushed. All alternatives remain in the HTML for context; A with direct right-aligned actions is the accepted direction.

Initial prototype was rendered at 320, 390 and 1200px, including simulated menu/Escape/revoke checks. Subsequent right-alignment/direct-button refinements passed the mechanical detector; a later screenshot attempt timed out, so those refinements have no claimed fresh visual or production accessibility validation. No application code was changed. The owner reviewed the prototype, selected A, rejected redundant menus, required existing visual identity, and explicitly accepted the final scope and preserved differences in the live discussion.

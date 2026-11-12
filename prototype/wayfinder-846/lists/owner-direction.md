## Owner-confirmed direction — 2026-11-11

Desktop: Event Models is the standard: compact tables, selectable text, explicit row-end actions, no whole-row edit. Use/adapt the existing shared DataTable rather than duplicate tables; consumers supply columns and domain actions.

Mobile: owner selected option A and requested right-aligned buttons. Owner then explicitly rejected a secondary Actions menu containing just one remaining option. For the current bounded examples, show all permitted actions directly on the card: Edit/Delete, Resend/Revoke, Prepare/Assign. Keep 44px touch targets, wrapping when needed, destructive confirmation, permission filtering and a visible reason for disabled Assign. Do not invent an overflow menu for these two-action rows.

Prototype updated locally at `/home/tiago/.local/state/agent-runs/church-wayfinder-852/mobile-list-prototype.html`; isolated illustrative asset, no application code changed. Comparison and source evidence: `comparison.md` in the same machine-local directory. Prototype served at http://192.168.0.200:18752/mobile-list-prototype.html?variant=A while the local server is running. These are machine-local pointers, not portable published assets.

Ticket remains open pending remaining bounded screen/interaction scope and final acceptance criteria; this is a progress record, not a resolution.

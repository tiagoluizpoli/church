## Resolution — owner-confirmed interaction

The owner chose option A's retained-list layout with a panel animated in from the **right**, borrowing the entry/exit feel of C without its modal overlay. Final clarification: right side, as in A. The owner explicitly requested recording the agreement without spending more work/tokens revising the prototype.

### Agreed behavior / acceptance criteria

- Preserve each **EventTimeBlock** as the selectable preparation unit and preserve existing preparation configuration/domain rules; this is not Assignment assembly.
- With nothing selected, the list occupies the full available content width.
- Selecting a block opens an in-flow panel on the right, animated from that edge; the list narrows to make room. No backdrop, page inertness, modal focus trap or overlay covering the list. A shadcn drawer/sheet may supply visual mechanics only if it satisfies this non-modal, space-sharing behavior; its default modal behavior is not the contract.
- The remaining list stays clickable. Selecting another block fills the same panel with that block's preparation editor, subject to existing unsaved/pending safeguards. Preserve list scroll and filters and visibly identify the current block.
- Close or Cancel dismisses the panel and restores full list width; unsaved changes still require the existing discard/stay protection. Successful Save gives clear saved feedback, updates the list summary, dismisses the panel and restores full width. A failed save preserves the draft and panel with an actionable error/retry; pending save prevents unsafe switching/closing.
- Preserve existing loading, retry, missing/access-denied and past/read-only handling, opt-out confirmation, Shift split validity and headcount constraints. An item must never show another item's stale form while loading.
- Preserve navigable block URLs/back links and return to the same list context. Keyboard users can select a block and reach its editor, then return to its trigger on close; respect reduced-motion preferences.

### Scope and evidence limits

The desktop interaction above was explicitly confirmed in the live exchange. No new mobile redesign was selected: retain the current separate block editor/back-to-list flow on narrow screens, with return to list context; do not infer approval of a mobile modal drawer from this desktop decision. Verification during implementation should cover full-width → open → switch → close/save, dirty/pending guards, error recovery, retained scroll/filter context, keyboard/reduced motion and narrow-screen return.

Compared assets: standalone, illustrative, memory-only HTML at `/home/tiago/orca/workspaces/church/wayfinder-853-ui/prototype/wayfinder-853.html`, uncommitted throwaway branch `tiagoluizpoli/wayfinder-853-ui`. Machine-local report/screenshots: `/home/tiago/.local/state/agent-runs/church-wayfinder-853/report.md`. These are context pointers, not hosted permanent assets. The final animated hybrid was described and approved verbally; it was not implemented or visually verified. No production code changed and no performance/accessibility guarantee follows from the prototype. The prototype checkout's `validate:affected` failed in tooling (`ts.SyntaxKind` undefined), not a passed implementation gate.

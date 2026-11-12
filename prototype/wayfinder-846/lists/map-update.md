## Destination

Agree a prioritized, implementation-ready plan to close demonstrated gaps in existing MVP journeys, improve interaction consistency and responsiveness, and specify an optional leader-reviewed Assignment proposal. Completion means acceptance criteria, dependencies, verification and risk dispositions are clear; this map does not implement the plan.

## Notes

- Owner-confirmed scope, 2026-11-11. Starting evidence: retrospective of [MVP Journeys: flows, page map and spec cut](https://github.com/tiagoluizpoli/church/issues/365), repository HEAD `71efc820f9516a7970e51b761c0f36f8d8a98785`. Machine-local source: `/home/tiago/.local/state/agent-runs/church-365-retro/retrospective.md` and linked reports. Recheck current state; historical repairs and source-only risks are not established current defects.
- Plan only. Consult Wayfinder, grilling and domain-modeling; follow repo constitution and guidance router. UI decisions also consult Impeccable and `apps/web/PRODUCT.md` / `DESIGN.md`; technical organization uses codebase-design; performance investigation uses diagnosing-bugs.
- During later implementation, inspect files already being touched for misplaced interfaces, incorrect dependency direction and small organizational mistakes. Correct bounded, behavior-preserving findings; surface larger restructuring separately. No architectural fishing expedition.
- Performance: bounded app-wide React/request review for concrete inexpensive opportunities, starting with assignment drag-and-drop flickering. State/effect scope, identity/remounts, rendering work and duplicate requests are candidates, not established causes. Use focused before/after evidence for claimed gains; distinguish development-only overhead from production behavior. No blanket memoization or new monitoring infrastructure by default. Include backend request/query issues where evidence warrants.
- UI consistency: Event Models is the owner's reference for intentional row actions and selectable text. Desktop People, Ministries, Invitations and Cycles should follow consistent list/table conventions; mobile needs an appropriate consistent touch presentation. Older users, keyboard access and clear saved/error states matter.
- Schedule preparation: explore an Event editor beside the retained list (e.g. right-side panel), preserving selection and scroll. Do not assume a drawer is already the selected design.
- Availability UI: eligible Shifts visibly read Available and start checked; unchecking means unavailable. Preserve the backend exception model and separate confirmation; an untouched, unconfirmed check must not become confirmed availability.
- Assignment proposal: explicitly requested, previewed and applied by the leader. Use confirmed AvailabilityChecks, prioritize Volunteers with fewer eligible Shifts, fill only unfilled needs, preserve existing Assignments and permit gaps. Revalidate constraints on apply. Available is not a preference. Exact heuristic, ties, preview and conflict behavior remain to specify.
- New functionality otherwise qualifies only to close a demonstrated existing journey gap. Technical cleanup/performance preserves behavior and layout; intentional UX changes are separately specified.

## Decisions so far

<!-- Resolution comments in closed child tickets hold decisions; append named links here as tickets resolve. Initial owner constraints are recorded in Notes. -->

- [What must a signed-in recipient see before accepting bundled Ministry invitations?](https://github.com/tiagoluizpoli/church/issues/847): Disclose every included grant before bundled acceptance; any changed bundle requires a refreshed review and fresh acceptance, with no grants from stale attempts.

- [Which rule governs Send pre-fill for Ministries without Usual setup?](https://github.com/tiagoluizpoli/church/issues/848#issuecomment-6805397228): Normalize existing directions to all_out and keep it as default; retain hidden all_in capability, with latest-setup pre-fill at Send and existing Sent staffing preserved.

- [Establish current validation and documentation gaps before choosing the repair plan](https://github.com/tiagoluizpoli/church/issues/849#issuecomment-6805513853): Confirmed three check-wiring gaps and Notification/UsualSetup wording contradictions; bounded correction candidates and verification seams recorded, with static-only evidence.

- [Determine which historical concurrency and deployment risks still need action](https://github.com/tiagoluizpoli/church/issues/850#issuecomment-6805793620): Historical concurrency mechanisms resolved in source; retain conditional migration 0028 target preflight, bounded local integration migration-readiness work and explicit mixed-writer verification limits.

- [Identify evidenced low-cost React and backend performance improvements](https://github.com/tiagoluizpoli/church/issues/851#issuecomment-6806080116): Ranked three source-backed candidates with verification gates; flicker remains undiagnosed and has a separate runtime reproduction prerequisite.

- [Establish a reproducible Assignment drag flicker signal and runtime comparison](https://github.com/tiagoluizpoli/church/issues/857#issuecomment-6806900279): Owner clarified subtle fluidity; code review specified eight bounded React corrections, with subscription/provider probes supporting mechanisms and no claimed frame-time gain.

- [Choose consistent desktop and mobile list interactions using Event Models as reference](https://github.com/tiagoluizpoli/church/issues/852#issuecomment-6807735307): Reuse DataTable with Event Models desktop conventions and direct right-aligned mobile actions; preserve app identity, explicit Cycle selection and calendar hierarchy across the agreed lists.

## Not yet specified

- Additional regression coverage and bounded organizational corrections revealed by the selected implementation paths.

## Out of scope

- Implementation, deployment, broad architectural restructuring, exhaustive audit or speculative optimization in this planning effort.
- Independent accept/decline per Ministry; bundled acceptance remains the MVP baseline unless explicitly reopened.
- Automatic background scheduling, changing existing Assignments without approval, preference collection, advanced fairness/optimization and business-rule changes inferred from UI controls.

## Resolution — Available switches; final layout deferred to implementation

Owner reviewed the interaction prototype and ended prototype iteration, explicitly choosing to handle final layout in the actual application. The compressed prototype's visual layout was rejected: spacing was too tight and the day selector crowded its divider. Screenshots and measured density did not establish acceptable design. Do not copy its spacing or treat its visual arrangement as approved.

### Accepted behavior

- Each eligible Shift uses a binary **Switch**: on = Available, off = Unavailable. Start on unless the existing saved answer or applicable restored local draft marks that Shift unavailable. This supersedes the earlier checkbox proposal.
- An untouched new AvailabilityCheck remains unconfirmed even though switches start on. Display an explicit unconfirmed state and require **Confirm availability**, including when there are no UnavailableShift exceptions. All-off is also a valid explicitly submitted answer.
- For a confirmed check, edits remain a draft until **Save changes** succeeds. The previous submitted answer remains effective meanwhile. Clearly show unsaved changes; failed submission retains the draft and supports retry without falsely claiming success.
- Preserve the existing backend exception model, confirmation lifecycle, published/read-only protections, local-draft restoration/discard and reconciliation behavior. This effort does not authorize a new eligibility policy or confirmation-reset rule. New/removed/published Shift handling must be checked against the current contracts and existing tests during implementation; prototype simulations are not authoritative policy.
- Whole-day changes affect only editable eligible Shifts. A Switch has only on/off states; never invent a mixed Switch state. The prototype explored separate actions and a selector; **neither final bulk-control presentation is approved**. Preserve the whole-day capability and make any partial-day state clear when implementing it.

### Implementation acceptance and verification

- Produce a more compact mobile list with readable separation and legible event/date/time text. Reduce repeated chrome and excessive scrolling while retaining at least 44px interactive target areas. Do not impose the prototype's exact heights, date abbreviation or native selector on the app.
- Use the app's established Switch and layout primitives. Each Switch needs a stable accessible name identifying availability and its Shift, keyboard operation, and visible on/off state; disabled/read-only/published states must be explained. Keep confirmation separate from the switch value.
- Verify existing-answer initialization, restored drafts, untouched unconfirmed versus confirmed-with-no-exceptions, all-off submission, individual/day edits and partial days, save failure/retry, and eligible/published/read-only refresh behavior in the owning existing test suites. Preserve current concurrency safeguards rather than deriving new rules from the demo.
- Review actual rendered mobile and desktop screens during implementation, including long event labels, mixed days and enough Shifts to assess scrolling. Visual approval remains part of implementation acceptance.

### Prototype evidence and disposition

Standalone in-memory artifact: `.scratch/availability-prototype/index.html`; durable local copy: `/home/tiago/.local/state/agent-runs/church-854-availability/availability-prototype.html`. Local demo: http://localhost:18554/. These are machine-local references, not published assets. No application source changes, commits or pushes were made. The prototype is exploratory evidence only and need not be polished further.

Transition probes verified no implicit confirmation, retaining the submitted answer and draft on failed save, and successful retry. Mobile render inspection and a clean mechanical detector did **not** validate visual quality; owner feedback rejected the compact composition.

Close this planning decision with the above behavior and explicit implementation design/verification obligations. No further prototype review is required in this map.

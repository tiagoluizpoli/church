2026-11-12: Owner accepted provisional explicit confirmation, mixed day checkbox (mixed click makes all editable shifts available), and retaining the submitted answer until successful save. Owner explicitly wants to try and revise if needed.

Built a standalone in-memory logic/UI prototype: availability-prototype.html in this folder; working copy .scratch/availability-prototype/index.html, served at http://localhost:18554/. No app source changes. Illustrative data; not authoritative API behavior.

Browser desktop and 390px mobile renders inspected. Pure transition probes passed: editing does not confirm; mixed day becomes all available; failed save retains submitted answer and draft; retry saves. Impeccable detector returned []. No production tests run because this is a throwaway artifact.

Awaiting live owner review. Additional specification work remains: reconcile eligibility changes with existing confirmation lifecycle, restored drafts and concurrent updates; final accessibility semantics and acceptance criteria. Ticket remains open. Do not treat provisional choices or prototype simulation as settled backend policy. No commit/push yet.

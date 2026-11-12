# Mobile list comparison — review notes

Open `mobile-list-prototype.html` directly, or run `python3 -m http.server 18752 --bind 127.0.0.1 --directory /home/tiago/.local/state/agent-runs/church-wayfinder-852` and visit `http://127.0.0.1:18752/mobile-list-prototype.html?variant=A` (replace A with B). Select Modelos de evento, Convites or Escalas; switch options at the bottom or with left/right arrows outside inputs and menus. Desktop shows both options side by side; narrow screens show the selected option. All data and actions are illustrative and memory-only.

A shows the most likely action directly with remaining actions in a menu. B hides every available action in a named menu; rows with no permitted action have no menu. The same invitation examples cover zero, one and two permitted actions, long email, details and destructive confirmation; Escalas shows a disabled Assign with its reason visible. No whole-row activation is used.

Recommendation for review: A makes the next step discoverable and removes one tap for common single-action rows, important for older users; B yields denser rows but requires opening the menu even for the only action. A's secondary menu still gives a compact place to keep destructive or less common actions. This is a recommendation, not an owner decision.

Rendered via Orca browser at 320×820 (A), 390×844 (A and B with invitation menu), and 1200×900 (side-by-side); screenshots are `mobile-320.png`, `mobile-390-a.png`, `mobile-390-b-menu.png`, and `desktop-comparison.png`. At 390px, opened the B invitation menu, closed it with Escape, reopened and confirmed simulated revoke; status displayed the simulated result. Visual inspection showed wrapping and no obvious clipping in those views. Impeccable detector returned `[]` (exit 0). Atkinson was not found locally, so system sans fallback is used.

Limitations: this is an isolated mock, not the application or a complete keyboard/screen-reader audit. Menu arrow-key navigation and comprehensive focus, responsiveness, loading/error, permission and localization checks remain for implementation validation. Desktop Event Models table remains the owner's confirmed standard; this artifact compares mobile only. Selected model per dispatch `gpt-6.1-terra` medium; actual runtime model unverified.

## Owner refinement

Owner selected A and requested right-aligned actions. Then explicitly rejected a secondary menu holding one remaining action: show all current row actions directly on the card (Edit/Delete, Resend/Revoke, Prepare/Assign), right-aligned with wrapping and 44px targets. Preserve destructive confirmation and disabled Assign with visible reason. No overflow menu is needed for these examples. B remains comparison history, not selected direction.

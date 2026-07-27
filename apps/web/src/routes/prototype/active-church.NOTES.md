# Active Church selection prototype

## Status

Retain this prototype in the repository as an implementation reference.
Do not delete it merely because a direction has been selected.

The accepted selection direction is **C — Compare access**:

- route: `/prototype/active-church`
- source: `active-church.tsx`
- run from the repository root: `bun run dev:web`

Variant C makes the differences between the User's Church Memberships
explicit before an Active Church is selected:

- Church identity and location
- Church Membership access
- application areas available in that Church
- when that Church was last opened
- the destination that will resume after selection

The comparison becomes a mobile list at narrow widths. Selecting a Church
transitions into the shared workspace preview so an implementer can see the
required handoff: verified Active Church, Church-scoped navigation, preserved
destination, Church Membership, and available application areas.

## Gate behavior represented

Use the prototype's scenario controls to inspect the agreed entry rule:

- **Needs selection:** several valid Church Memberships and no Active Church
  show the selector.
- **Remembered Church:** a valid Active Church bypasses the selector.
- **One Church:** the sole membership is selected silently.
- **No access:** zero Church Memberships show a shell-free no-access state.
- **Other-Church link:** a link targeting another Church requires a context
  change before Church-scoped data loads.
- **Church Membership removed:** the former Active Church is cleared, the
  reason is explained in the selector itself, and the User chooses among
  remaining Churches.
- **Member experience:** the shell exposes only granted application areas and
  never advertises domain concepts that are absent from the User's experience.

## Scope of the accepted decision

This acceptance settles the ambiguous-entry selector's information
architecture and presentation direction. It does not yet settle every Active
Church behavior.

The permanent manual switcher location is also accepted:

- on desktop, it sits at the top of the application sidebar, above
  Church-scoped navigation;
- on mobile, it sits inside the navigation drawer;
- it does not live in the User account menu, because Active Church is
  application context while the account menu represents User identity.

Manual switching uses a conservative hybrid destination policy:

- every protected route explicitly opts into either `preserve` or `fallback`;
- `fallback` to `/dashboard` is the default for unknown and newly added routes;
- a `preserve` route replays its complete path, search parameters, and hash
  only after authorization is rechecked against the target Church;
- if replay authorization fails, navigation falls back to `/dashboard`;
- routes containing Church-owned resource identifiers, such as Ministry,
  PlanningCycle, or Event ids, normally use `fallback`;
- Church-neutral collection and landing routes may opt into `preserve`;
- switching first cancels in-flight Church-scoped requests and removes all
  Church-scoped query data, preventing former-Church results from appearing
  under the new Active Church.

This policy seam belongs in the first implementation even if only a small
number of proven-safe routes initially opt into preservation. More routes may
opt in later without changing the switcher contract.

Cross-Church deep links follow this contract:

- a link targeting the current Active Church opens directly;
- a link targeting another Church where the User holds Church Membership
  shows one explicit confirmation naming the current and target Churches;
- after confirmation, the application switches context, clears Church-scoped
  work and cache, and preserves the exact deep-link destination;
- when no Active Church exists, a verified link may select its target Church
  automatically because no existing context is being displaced;
- when the User lacks target-Church membership, the application keeps the
  current Active Church and returns a generic access-denied result without
  revealing whether the target resource exists.

Active Church is session-wide rather than tab-local. When another tab changes
it, every other tab:

- immediately cancels in-flight Church-scoped requests;
- disables Church-scoped actions so the stale screen cannot mutate data under
  the new session context;
- shows a blocking message naming the new Active Church;
- waits for one explicit Continue action before clearing cached data and
  applying the normal preserve-or-dashboard route policy.

Other tabs do not silently reroute because they may contain unsaved planning
work, but they also cannot continue operating under the former Church.

Active Church persistence follows the Better Auth session boundary:

- refreshes and tabs using the current session retain its Active Church;
- a genuinely fresh session does not restore the former session's Church from
  a second User preference or browser hint;
- with one valid Church Membership, a fresh session selects it silently;
- with several memberships, a fresh session shows the accepted C selector;
- a verified Church-targeted deep link or invitation may supply the initial
  context directly;
- cross-session "last Church" memory is deliberately deferred. It can be added
  later as a validated hint at the centralized entry gate without changing
  the canonical `session.activeOrganizationId` contract.

An invalid Active Church—because Church Membership was revoked or the Church
no longer exists—forces context recovery:

- clear `session.activeOrganizationId`;
- cancel in-flight Church-scoped work and remove Church-scoped query data;
- explain the confirmed reason in the recovery screen itself rather than
  relying on a generic "Access changed" message;
- when Church Membership was removed, name the former Church and say: "You no
  longer have access to [Church]. Your Church Membership was removed.";
- do not name the person who removed the User unless trustworthy audit data is
  intentionally part of the product;
- with no remaining Church Membership, show the shell-free no-access state
  with the same reason-specific notice;
- with one remaining membership, select it silently and open its dashboard
  with the same reason-specific notice;
- with several remaining memberships, show C with the reason-specific notice
  and ask the User to choose another Church;
- never replay the former Church's route during forced recovery, even when its
  route normally opts into preservation.

Invitation acceptance is itself explicit consent to enter the invitation's
Church:

- no second cross-Church switch confirmation appears after acceptance;
- the invited Church becomes Active;
- Church-scoped requests and cache are canceled and cleared;
- redemption continues to its exact result page;
- if the Ministry half fails because the User's Volunteer profile belongs to
  another Church, the invited Church remains Active and the result explains
  that the User joined as a Church Member without Volunteer access;
- other tabs use the accepted blocking synchronization flow.

Volunteer is a scheduling-domain term, not a general account-status label:

- general selectors, dashboards, and navigation show capabilities and
  available areas rather than the presence or absence of a Volunteer profile;
- Volunteer-only navigation is omitted when unavailable, without disabled
  placeholders or an explanatory dashboard warning;
- ordinary Church Members are not told they are "not Volunteers";
- direct access to an unavailable scheduling route returns the route's normal
  access-denied state without advertising missing domain records;
- Volunteer language remains appropriate inside scheduling and Ministry
  Invitation flows, where the concept is directly relevant.

The authenticated route tree uses two distinct guards:

```text
__root
├── login                         public, shell-free
├── invite/*                      public, shell-free
└── _authenticated                valid session, no application shell
    ├── select-church             authenticated, shell-free
    └── _active-church            valid Active Church, owns AppShell
        ├── /                     redirects to dashboard
        ├── dashboard
        ├── availability
        ├── notifications
        ├── scheduling/*
        └── volunteer/*
```

- `_authenticated` proves only that the User has a valid session.
- `select-church` and the no-access state live inside `_authenticated` but
  outside `_active-church`, so neither appears inside a stale Church shell.
- `_active-church` revalidates the selected Church Membership before it
  mounts AppShell or loads Church-scoped data.
- every Church-scoped application route lives below `_active-church`; a valid
  session alone can never enter the application shell.

Variants A, B, and D remain available through the prototype switcher as design
history and comparison material. Variant C is the default when no `variant`
search parameter is present.

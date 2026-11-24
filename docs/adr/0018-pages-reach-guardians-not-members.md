# Pages reach Guardians of an open Check-in, not Church Members

## Status

accepted ([#1082](https://github.com/tiagoluizpoli/church/issues/1082), map [#1072](https://github.com/tiagoluizpoli/church/issues/1072)); amends [ADR 0008](0008-notifications-to-members-transactional-emails-to-addresses.md)

## Context

ADR 0008 lets a Notification reach only a Church Member, checked at delivery. Kids check-in breaks that premise: a Family is linked to a Church without any Church Membership (ADR 0017), so a visiting Guardian with an account at another Church, or with no Membership anywhere, would never receive a Page. A Page is also time-critical: web push cannot pierce silent mode or Do Not Disturb, so an email that arrives late is worse than none.

## Decision

- **A Page is addressed to a Guardian, gated by the Check-in.** The delivery check is "Guardian of the Family of a Check-in still open at this Church", not Church Membership. Once the Check-in closes, nothing more is delivered. A Notice (a Move, an expired Awaiting drop-off) uses the same gate.
- **Same core, new recipient rule.** Pages and Notices reuse ADR 0008's outbox, drainer, sinks and kind + data bell rows; only the recipient lookup differs. A web push sink is added. Pages use push, the bell and an in-page alert, never email, because a late page is wrong.
- **Members-only stays the rule for every other Notification.**

## Considered Options

- **Require Church Membership to be paged.** Rejected: it fails visitors and Guardians who belong to another Church, the people who most need the call.
- **Treat a Page as a Transactional message to a phone or address.** Rejected: it loses the bell record and the per-Guardian preferences, and a Guardian contact without an account is reached by hand and on screen anyway.

## Consequences

- The recipient lookup now has two rules, members and open-Check-in Guardians, and each kind names which one it uses.
- A Guardian's access to Pages ends with the Check-in or the Family Link, never with a Membership change.

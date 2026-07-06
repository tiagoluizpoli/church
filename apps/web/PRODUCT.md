# Product

## Register

product

## Users

Two primary user groups, roughly equal weight:

- **Volunteers**: church members checking availability, assignments, and notifications, mostly on mobile, in short sessions between other tasks. Low tolerance for friction; needs quick in-and-out task completion (respond to an assignment, mark availability, check a notification).
- **Admins / planners**: ministry leaders and schedulers building rosters, planning events, and tailoring participation, mostly on desktop in longer focused sessions. Needs clarity over dense data (who's available, who's assigned, gaps in coverage) and confidence that changes save correctly.

Many volunteers skew older, so interactions should not assume fine motor precision, hover states, or small touch targets.

## Product Purpose

A church scheduling and volunteer-management system: availability collection, event/rostering, assignment notifications, and ministry planning. Success looks like admins building a correct schedule with minimal manual chasing, and volunteers always knowing what's expected of them without digging.

## Brand Personality

Warm, trustworthy, calm — but also efficient, clear, no-nonsense, and modern/polished/quietly confident. The tone is a well-run community tool, not a cold enterprise system and not a corporate SaaS pitch. Reassuring and human without being precious; fast and legible without being sterile.

## Anti-references

- Not generic AI-SaaS-cream: no cream/sand backgrounds-by-default, no gradient text, no eyebrow labels, no hero-metric template.
- Not overly playful or childish: no cutesy illustrations, no bright cartoonish primary-color UI.
- Not enterprise-bloated: no dense legacy-ChMS-style dashboard clutter; stay lean and task-focused.

## Design Principles

- **Two audiences, one system**: components must read right cramped into a mobile volunteer flow and spacious in a desktop admin/planning flow — don't design for only one.
- **Low-friction task completion**: every volunteer-facing screen should answer "what do you need from me" in one glance; minimize taps/decisions to respond or update.
- **Confidence over cleverness**: admins are making real scheduling decisions; state (saved, pending, offline, error) must always be unambiguous.
- **Calm density**: show real data (rosters, availability, assignments) without enterprise-dashboard clutter — favor clear sections over cards-of-cards.
- **Accessible by default, not by afterthought**: WCAG AA plus older-adult-friendly sizing/contrast/target sizes, since volunteer demographics skew older.

## Accessibility & Inclusion

WCAG AA baseline, with explicit attention to older-adult users: larger touch targets, no reliance on hover-only affordances, higher-contrast text than the AA minimum where practical, and no fine-motor-dependent interactions (e.g. tiny drag handles without alternatives).

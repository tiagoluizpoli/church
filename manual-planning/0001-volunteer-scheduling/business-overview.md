# 01: Business Overview — Volunteer Scheduling

## Overview
A system for ministry leaders to manage the scheduling (escalas) of volunteers who serve in their specific ministry. This document outlines the core functional requirements and high-level decisions.

> **Refined (017, 2026-07-02):** Scheduling is now planned at the **church** level in **`PlanningCycle`s**. A **`ChurchAdmin`** drafts a cycle (arbitrary date range), applies **`EventTemplate`s** to generate the recurring Events, and **locks** it. Each **ministry leader** then tailors their **`MinistryParticipation`** (opts into slots via their `MinistryServingProfile`, sets `Shift` headcounts) and **fires availability checks**. Volunteers are **available by default**, mark exceptions per `Shift`, and **confirm**. Each ministry **publishes its own roster** independently; notifications are **per cycle**. See [`CONTEXT.md`](../../CONTEXT.md), [ADR 0001](../../docs/adr/0001-church-owned-events-and-planning-cycles.md), [ADR 0002](../../docs/adr/0002-church-timeslots-ministry-shifts.md), [refinement-02](./refinement-02-scheduling-reshape.md).

## Core Flow
1. **Team Onboarding**: The ministry leader sends a registration/invite link to potential or existing volunteers.
2. **Volunteer Registration**: Volunteers register themselves (or update their profile) through the provided link.
3. **Availability Specification**: Earlier planning described volunteer-authored day spans or time spans, but the current volunteer-dashboard direction is leader-defined service blocks with volunteer slot answers.
4. **Schedule Creation**: The leader uses the availability data to build, manage, and finalize the ministry schedule.

## Decisions Made
1. **Availability Granularity**: Configurable by Event Type, but for the volunteer dashboard the current direction is still slot-based. Leaders define the concrete blocks for hourly, day-based, or special-date Events, and volunteers answer those blocks instead of authoring free-form times.
2. **Roles/Positions**: Volunteers will be assigned to specific roles. Roles can be **Global** (available across the church) or **Ministry-specific** (bound to a single team).
3. **Notifications**: Required for the MVP. We will utilize Push Notifications (via Web App/PWA) as the primary channel to avoid Meta's WhatsApp integration complexity.
4. **Schedule Visibility**: Volunteers will be able to see the full schedule for their ministry to foster transparency and teamwork.
5. **Ministry Hierarchy & Sub-leaders**: A ministry is an isolated group with a main leader. Large ministries (e.g., Kids, Band) can have internal sub-groups/teams. These inner groups can be managed by Sub-leaders with permissions restricted to their specific team, while the main Ministry Leader oversees the whole ministry.
6. **Constraint Strictness**: Soft enforcement. The system will warn the leader about conflicts (e.g., overlapping slots, unavailability) but allow them to override and assign anyway. This strictness can be configured at the Ministry level.
7. **Church-level planning (017)**: Events are **church-owned** and planned in **`PlanningCycle`s** by a **`ChurchAdmin`**, generated from **`EventTemplate`s**, then tailored per ministry via **`MinistryParticipation`**/`Shift`. Two publishes: cycle-lock (admin, reveals calendar to leaders) and per-participation roster-publish (leader, reveals a ministry's slice to its volunteers).
8. **Notifications per cycle (017)**: To reduce noise, availability reminders and schedule-published alerts fire once per `PlanningCycle`, not per slot; leaders can resend the availability reminder.

*(Note: Technical architecture details, data models, and UI workflows are documented in their respective files in this directory).*

---

## 🔗 Architecture & Workflows

To see how these business rules map to implementation, refer to:
- **[Layered Implementation Roadmap](./specifications-list.md)**: The central index of all technical specifications.
- **[Church Structure Flowchart](./flowcharts/church-structure.md)**: Visual representation of the Ministry/Team/Volunteer hierarchy.
- **[Scheduling Process Flowchart](./flowcharts/scheduling-process.md)**: End-to-end leader workflow.

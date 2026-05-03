# 01: Business Overview — Volunteer Scheduling

## Overview
A system for ministry leaders to manage the scheduling (escalas) of volunteers who serve in their specific ministry. This document outlines the core functional requirements and high-level decisions.

## Core Flow
1. **Team Onboarding**: The ministry leader sends a registration/invite link to potential or existing volunteers.
2. **Volunteer Registration**: Volunteers register themselves (or update their profile) through the provided link.
3. **Availability Specification**: Volunteers specify their availability (e.g., full day or specific time ranges) depending on the event type.
4. **Schedule Creation**: The leader uses the availability data to build, manage, and finalize the ministry schedule.

## Decisions Made
1. **Availability Granularity**: Configurable by Event Type. Events can be "day-based" (blockouts for full days) or "hourly-based" (specific shift availability).
2. **Roles/Positions**: Volunteers will be assigned to specific roles. Roles can be **Global** (available across the church) or **Ministry-specific** (bound to a single team).
3. **Notifications**: Required for the MVP. We will utilize Push Notifications (via Web App/PWA) as the primary channel to avoid Meta's WhatsApp integration complexity.
4. **Schedule Visibility**: Volunteers will be able to see the full schedule for their ministry to foster transparency and teamwork.
5. **Ministry Hierarchy & Sub-leaders**: A ministry is an isolated group with a main leader. Large ministries (e.g., Kids, Band) can have internal sub-groups/teams. These inner groups can be managed by Sub-leaders with permissions restricted to their specific team, while the main Ministry Leader oversees the whole ministry.
6. **Constraint Strictness**: Soft enforcement. The system will warn the leader about conflicts (e.g., overlapping slots, unavailability) but allow them to override and assign anyway. This strictness can be configured at the Ministry level.

*(Note: Technical architecture details, data models, and UI workflows are documented in their respective files in this directory).*

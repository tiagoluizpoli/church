# Church Organizational Structure

> **Refined (017, 2026-07-02):** A **`ChurchAdmin`** role sits above all ministries and owns the church calendar (`PlanningCycle`s, `EventTemplate`s). **Events are church-owned** (under a `PlanningCycle`), not under a ministry; ministries relate to Events through `MinistryParticipation`. The ministry → team → role structure below is unchanged.

```mermaid
graph TD
    CH["Church (Main Tenant)"] -->|ChurchAdmin owns| PC["PlanningCycle<br>(draft → locked → archived)"]
    PC --> EV["Event (church-owned)<br>→ TimeSlots"]

    CH --> M1["Ministry:<br>Kids"]
    CH --> M2["Ministry:<br>Worship"]
    CH --> M3["Ministry:<br>Audio/Visual"]

    M1 --> T1["Team:<br>Kids 2-4"]
    M1 --> T2["Team:<br>Kids 5-7"]

    T1 -->|Sub-leader| R2["Role:<br>Teacher"]
    T1 -->|Sub-leader| R3["Role:<br>Assistant"]

    T2 -->|Sub-leader| R4["Role:<br>Teacher"]

    %% Ministry participates in church Events
    M1 -.->|MinistryParticipation<br>Shifts + Requirements| EV

    %% Global Roles
    CH -.->|Global Access| GR1["Global Role<br>(e.g., Admin)"]
```

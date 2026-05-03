# Architecture & Process Flowcharts

Visual mapping of the Volunteer Scheduling system.

## 1. Ministry Hierarchy & RBAC Structure
This graph shows how ownership and access control flow from the Church level down to specific Teams and Roles.

```mermaid
graph TD
    %% Core Entities
    CH["Church Organization"] 
    M1["Ministry A<br>(e.g., Projection)"]
    M2["Ministry B<br>(e.g., Kids)"]
    
    %% Relationships
    CH --> M1
    CH --> M2
    
    %% Ministry A Structure
    M1 -->|Main Leader| R1["Role:<br>Operator"]
    
    %% Ministry B Structure
    M2 -->|Main Leader| T1["Team:<br>Special Needs"]
    M2 -->|Main Leader| T2["Team:<br>Kids 2-4"]
    
    T1 -->|Sub-leader| R2["Role:<br>Teacher"]
    T1 -->|Sub-leader| R3["Role:<br>Assistant"]
    
    T2 -->|Sub-leader| R4["Role:<br>Teacher"]
    
    %% Global Roles
    CH -.->|Global Access| GR1["Global Role<br>(e.g., Admin)"]
```

## 2. Event & Scheduling Process Flow
This sequence diagram breaks down the step-by-step interaction between the Leader, the Frontend UI, the Fastify Backend, and the Volunteer. 
*(Note: Replaced the old "yellow note" that was overflowing with a cleaner `alt` block to handle the Soft Enforcement).*

```mermaid
sequenceDiagram
    autonumber
    actor L as Leader / Sub-leader
    participant UI as Frontend App
    participant API as Fastify Backend
    actor V as Volunteer

    %% Event Creation Phase
    L->>UI: Creates Event (Multi/Single Day)
    UI->>API: POST /events
    API-->>UI: Event Created
    
    L->>UI: Configures Time Slots
    alt Auto-Generate Slots
        UI->>API: Request Slot Suggestions
        API-->>UI: Returns Generated Slots
        L->>UI: Approves Suggestions
    else Manual Setup
        L->>UI: Manually adds sequential slots
    end
    UI->>API: Saves Slots & Requirements
    
    %% Volunteer Phase
    API->>V: Push Notification: New Event
    V->>UI: Submits Availability
    UI->>API: Saves Availability (Full Day or Shift)
    
    %% Scheduling Phase
    L->>UI: Opens Schedule Builder (Desktop)
    UI->>API: GET /events/:id/scheduling-data
    API-->>UI: Returns Availability & Auto-Suggestions
    L->>UI: Adjusts Assignments (Drag/Click)
    
    UI->>API: Validate Assignments
    alt Conflict Detected
        API-->>UI: Warning (Soft Enforcement)
        L->>UI: Overrides Warning & Confirms
    end
    
    L->>UI: Publishes Schedule
    UI->>API: Update Status -> Published
    
    %% Notification Phase
    API->>V: Push Notification: Schedule Ready
```

## 3. Domain Entity-Relationship (ERD)
This diagram maps out the data relationships we defined in `domain-data-model.md`, which will guide our database schema design.

```mermaid
erDiagram
    MINISTRY ||--o{ TEAM : "has"
    MINISTRY ||--o{ ROLE : "owns (specific)"
    MINISTRY ||--o{ EVENT : "hosts"
    
    VOLUNTEER }|--|{ ROLE : "can perform"
    VOLUNTEER }|--|{ MINISTRY : "belongs to"
    
    EVENT ||--|{ TIME_SLOT : "divided into"
    
    TIME_SLOT ||--o{ SLOT_REQUIREMENT : "requires"
    SLOT_REQUIREMENT }o--|| ROLE : "for"
    
    TIME_SLOT ||--o{ ASSIGNMENT : "scheduled in"
    ASSIGNMENT }o--|| ROLE : "as"
    ASSIGNMENT }o--|| VOLUNTEER : "assigned to"
    
    VOLUNTEER ||--o{ AVAILABILITY : "declares"
```

# Spec R1: Repository Interfaces (Contracts)

## Purpose
Define the TypeScript interfaces for all data access. This ensures we can mock the database during unit testing and enforce a consistent API across the system.

## 1. Core Interfaces

### I. ChurchRepository
- `getById(churchId: string): Promise<Church>`
- `getBySlug(slug: ChurchSlug): Promise<Church>`

### II. MinistryRepository
- `getById(churchId: string, id: string): Promise<Ministry>`
- `listByChurch(churchId: string): Promise<Ministry[]>`
- `updateSettings(churchId: string, id: string, settings: any): Promise<void>`

### III. VolunteerRepository
- `getById(churchId: string, id: string): Promise<Volunteer>`
- `listByMinistry(churchId: string, ministryId: string): Promise<Volunteer[]>`
- `updateStatus(churchId: string, id: string, status: string): Promise<void>`

### IV. EventRepository
- `getWithSlots(churchId: string, eventId: string): Promise<EventWithSlots>`
- `createWithSlots(churchId: string, data: CreateEventInput): Promise<Event>`
- `listPublished(churchId: string, ministryId: string): Promise<Event[]>`

## 2. Common Patterns
- All methods **MUST** accept `churchId` as the first argument to enforce isolation.
- Methods should return Domain Entities (Spec D1), not Drizzle-specific objects.

## 3. Testing Requirements (Mandatory)
- **Contract**: Verify that the concrete Drizzle implementation fully satisfies these interfaces.
- **Unit**: Verify that services using these interfaces can be tested with 100% mocked data.

## 🔗 References
- [Spec D1: Domain Entities](./D1-domain-entities.md)
- [Spec 04: Repository Contracts](./04-repository-contracts.md)

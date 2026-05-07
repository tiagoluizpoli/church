# Spec S3: Local Development Seeding

## Purpose
Define the data seeding strategy for local development and testing to ensure the UI can be built against realistic data structures.

## Requirements
1. **Mock Generator**: A script to easily populate a clean database with sample data.
2. **Entities to Seed**: 
   - Church (Multi-tenant)
   - Ministries (e.g., Kids, Worship, Tech)
   - Roles (Global and Ministry-specific)
   - Volunteers (with varying availability)
   - Events & Time Slots
3. **Reproducibility**: Running the seeder should produce consistent results to ease debugging.

## Generators / Rules
- **Volunteer Generation & Contextual Assignment:** Instead of defaulting all `system_role` values to `volunteer`, the seeder must implement contextual assignment:
  - The first volunteer attached to a ministry gets `system_role: 'leader'`.
  - The second volunteer (or first attached to a specific team) gets `system_role: 'sub_leader'`.
  - The rest get `system_role: 'volunteer'`.

## Test Assertions (Integration)
- Require an integration test assertion ensuring every Ministry has at least one `leader` and every Team has at least one `sub_leader`.

## Tooling
- We will leverage Drizzle's seeding capabilities or a simple custom script using `faker.js`.

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

## Tooling
- We will leverage Drizzle's seeding capabilities or a simple custom script using `faker.js`.

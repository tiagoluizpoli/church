# Quickstart: Local Development Seeding

## Usage

This utility populates your local PostgreSQL database with realistic mock data for UI and API testing.

### Prerequisites
1. Docker Compose must be running (`docker-compose up -d`) to provide the Postgres database.
2. The database schema must be applied.

### Running the Seeder

From the repository root, you can run:

```bash
bun --filter @church/db seed
```

Or from within the `packages/db` directory:

```bash
cd packages/db
bun run seed
```

### Determinism

By default, the script uses a fixed random seed (`faker.seed(12345)`). This guarantees that running the script multiple times (assuming you drop/clear the tables first) will yield the exact same IDs, names, and date relationships.

### Customization

The factories are located in `packages/db/src/seed/factories/`. If you need to add a specific test case (e.g., a specific edge case for double booking), add it explicitly at the end of `packages/db/src/seed/index.ts`.

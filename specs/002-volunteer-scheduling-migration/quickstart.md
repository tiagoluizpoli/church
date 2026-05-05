# Quickstart: Volunteer Scheduling Migration

Guide to initializing the multi-tenant system and enabling soft registration.

## 1. Seed Configuration

Create a `packages/database/seed-data.json` file:

```json
{
  "churchName": "My Church",
  "churchSlug": "my-church",
  "adminEmail": "admin@dummy.com"
}
```

(Note: You can add this file to `.gitignore` to keep local overrides private).

## 2. Running the Initialization

After running standard database migrations (`bun db:migrate`), run the system initialization script:

```bash
bun packages/database/src/scripts/init-system.ts
```

This will:
1.  Create the initial Church.
2.  Link the user with the specified email as the first Volunteer and Leader.

## 3. Verifying Soft Registration

1.  Log in to the application using a new account.
2.  Check the database `volunteer` table.
3.  A new record should be automatically created for your user, linked to the "System Church".

## 4. Development Workflow

- To reset the migration state (for testing):
    ```bash
    bun db:push --force
    bun packages/database/src/scripts/init-system.ts
    ```

# Quickstart: Domain Entities

## Prerequisites

- Bun installed (latest)
- Monorepo workspace set up (`bun install` at root)

## Setup

### 1. Create the core package (Entity base + DomainError base)

```bash
mkdir -p packages/core/src
```

```bash
cat > packages/core/package.json << 'EOF'
{
  "name": "@church/core",
  "type": "module",
  "exports": {
    ".": {
      "default": "./src/index.ts"
    },
    "./*": {
      "default": "./src/*.ts"
    }
  },
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "@base-fullstack-template/config": "workspace:*",
    "typescript": "^5",
    "vitest": "catalog:"
  }
}
EOF
```

### 2. Create domain folders in the API package

```bash
mkdir -p packages/api/src/domain/{entities,errors}
mkdir -p packages/api/tests/domain/entities
mkdir -p packages/api/tests/contract
```

### 3. Add core dependency to API package

Add `"@church/core": "workspace:*"` to `packages/api/package.json` dependencies.

### 4. Install dependencies

```bash
bun install
```

## File Structure

### packages/core/ (shared base classes)

```text
packages/core/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Barrel: Entity, DomainError
│   ├── entity.ts             # Entity<T> abstract base class
│   └── domain-error.ts       # DomainError abstract base class
└── tests/
    └── entity.test.ts        # Base class unit tests
```

### packages/api/src/domain/ (project-specific entities)

```text
packages/api/src/domain/
├── index.ts                      # Barrel export for all entities and errors
├── entities/
│   ├── index.ts
│   ├── church.ts
│   ├── ministry.ts
│   ├── team.ts
│   ├── role.ts
│   ├── volunteer.ts
│   ├── ministry-volunteer.ts
│   ├── event.ts
│   ├── time-slot.ts
│   ├── slot-requirement.ts
│   ├── assignment.ts
│   ├── assignment-audit.ts
│   └── availability.ts
├── errors/
│   ├── index.ts
│   ├── invalid-date-range.ts
│   └── invalid-required-count.ts
└── mapper.ts                     # EntityMapper interface
```

### packages/api/tests/ (domain tests)

```text
packages/api/tests/
├── domain/
│   ├── errors.test.ts
│   └── entities/
│       ├── church.test.ts
│       ├── ministry.test.ts
│       ├── event.test.ts
│       ├── time-slot.test.ts
│       ├── slot-requirement.test.ts
│       ├── assignment.test.ts
│       └── availability.test.ts
└── contract/
    └── schema-alignment.test.ts  # Compile-time alignment with Drizzle
```

## Verification

```bash
# Type-check API package
cd packages/api && bunx tsc --noEmit

# Run tests
cd packages/api && bun test

# Type-check core package
cd packages/core && bunx tsc --noEmit

# Verify domain has no direct Drizzle imports
grep -r "@church/db\|@base-fullstack-template/db\|drizzle-orm" packages/api/src/domain/
# Should return no results
```

# Data Model: Timezone & Date Policy

## Updated Entities

### Church (Table: `church`)
| Field | Type | Description |
|---|---|---|
| `timezone` | `text` | IANA Timezone name (e.g., `America/New_York`). Default: `UTC`. |

### Global Schema Changes
All `timestamp` columns across all tables will be converted to:
- **Type**: `timestamp(3, { withTimezone: true })`
- **Postgres Type**: `TIMESTAMPTZ`

## Validation Rules (Zod)

### Timezone Validation
```typescript
const timezoneSchema = z.string().refine((tz) => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}, "Invalid IANA timezone");
```

### Date Input (tRPC)
```typescript
const dateInputSchema = z.string().datetime().transform((val) => new Date(val));
```

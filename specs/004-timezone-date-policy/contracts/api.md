# API Contracts: Timezone & Date Policy

## tRPC Procedures

### Global Requirements
- All date inputs MUST be ISO 8601 strings with 'Z' suffix (UTC).
- All date outputs will be ISO 8601 strings in UTC.

### Church Management
#### `church.updateSettings`
- **Input**:
  ```typescript
  {
    timezone: string; // IANA name
  }
  ```

### Scheduling
#### `scheduling.createEvent`
- **Input**:
  ```typescript
  {
    startDate: string; // ISO 8601 UTC
    endDate: string;   // ISO 8601 UTC
  }
  ```

## Frontend Context
### `TimezoneContext`
```typescript
interface TimezoneContextValue {
  mode: 'church' | 'user';
  churchTimezone: string; // IANA
  userTimezone: string;   // IANA
  setMode: (mode: 'church' | 'user') => void;
  format: (date: Date, formatStr: string) => string;
}
```

import { describe, expect, it } from 'vitest';
import { Church } from '../../src/domain/entities/church';
import type { EntityMapper } from '../../src/domain/mapper';

describe('EntityMapper Contract', () => {
  it('allows implementing the interface correctly', () => {
    // Mock SchemaRow and InsertRow
    type MockSchemaRow = {
      id: string;
      name: string;
      slug: string;
      created_at: Date;
      updated_at: Date;
      timezone: string;
      settings: Record<string, unknown>;
    };
    type MockInsertRow = {
      id?: string;
      name: string;
      slug: string;
      timezone: string;
      settings: Record<string, unknown>;
    };

    class ChurchMapper
      implements EntityMapper<MockSchemaRow, Church, MockInsertRow>
    {
      toDomain(row: MockSchemaRow): Church {
        return new Church(
          {
            name: row.name,
            slug: row.slug,
            timezone: row.timezone,
            settings: row.settings,
          },
          row.id,
          row.created_at,
          row.updated_at,
        );
      }

      toPersistence(entity: Church): MockInsertRow {
        return {
          id: entity.id,
          name: entity.name,
          slug: entity.slug,
          timezone: entity.timezone,
          settings: entity.settings ?? {},
        };
      }
    }

    const mapper = new ChurchMapper();
    const church = mapper.toDomain({
      id: 'c1',
      name: 'Grace',
      slug: 'grace',
      created_at: new Date(),
      updated_at: new Date(),
      timezone: 'UTC',
      settings: {},
    });

    expect(church).toBeInstanceOf(Church);
    expect(church.name).toBe('Grace');

    const row = mapper.toPersistence(church);
    expect(row.id).toBe('c1');
    expect(row.name).toBe('Grace');
  });
});

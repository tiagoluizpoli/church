import { describe, expect, it } from 'vitest';
import { Entity } from '../src/entity';

interface MockProps {
  name: string;
  count: number;
}

class MockEntity extends Entity<MockProps> {
  get name() {
    return this._props.name;
  }

  get count() {
    return this._props.count;
  }
}

describe('Entity Base Class', () => {
  it('generates a UUID automatically if not provided', () => {
    const entity = new MockEntity({ name: 'Test', count: 1 });
    expect(entity.id).toBeDefined();
    expect(typeof entity.id).toBe('string');
    // UUID v4 format check
    expect(entity.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('uses explicit ID if provided', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const entity = new MockEntity({ name: 'Test', count: 1 }, id);
    expect(entity.id).toBe(id);
  });

  it('sets createdAt and updatedAt defaults if not provided', () => {
    const entity = new MockEntity({ name: 'Test', count: 1 });
    expect(entity.createdAt).toBeInstanceOf(Date);
    expect(entity.updatedAt).toBeInstanceOf(Date);
    expect(entity.createdAt.getTime()).toBeCloseTo(
      entity.updatedAt.getTime(),
      -2,
    ); // close within 100ms
  });

  it('uses explicit timestamps if provided', () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const updatedAt = new Date('2026-01-02T00:00:00Z');
    const entity = new MockEntity(
      { name: 'Test', count: 1 },
      undefined,
      createdAt,
      updatedAt,
    );
    expect(entity.createdAt).toBe(createdAt);
    expect(entity.updatedAt).toBe(updatedAt);
  });

  describe('Equality', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';

    it('returns true when comparing with another entity of the same ID', () => {
      const e1 = new MockEntity({ name: 'Test 1', count: 1 }, id);
      const e2 = new MockEntity({ name: 'Test 2', count: 2 }, id); // Props don't matter, only ID
      expect(e1.equals(e2)).toBe(true);
    });

    it('returns false when comparing with another entity of a different ID', () => {
      const e1 = new MockEntity({ name: 'Test', count: 1 }, 'id-1');
      const e2 = new MockEntity({ name: 'Test', count: 1 }, 'id-2');
      expect(e1.equals(e2)).toBe(false);
    });

    it('returns false when comparing with null or undefined', () => {
      const e1 = new MockEntity({ name: 'Test', count: 1 });
      expect(e1.equals(null as unknown as Entity<MockProps>)).toBe(false);
      expect(e1.equals(undefined)).toBe(false);
    });

    it('returns false when comparing with a non-entity object', () => {
      const e1 = new MockEntity({ name: 'Test', count: 1 }, id);
      const notAnEntity = { _id: id } as unknown as Entity<MockProps>;
      expect(e1.equals(notAnEntity)).toBe(false);
    });
  });
});

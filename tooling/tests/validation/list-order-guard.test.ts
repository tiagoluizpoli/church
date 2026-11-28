import { describe, expect, it } from 'bun:test';
import { getListOrderFailures } from '../../validation/list-order-guard';

const PATH =
  'apps/server/src/infrastructure/repositories/drizzle-example.repository.ts';

const failuresFor = (source: string, path = PATH) =>
  getListOrderFailures({ files: [{ path, source }] });

const missingOrder = (line: number) =>
  `${PATH}:${line}: list query has no .orderBy(): end it in a total ORDER BY, or add // list-order: <reason> above it`;

describe('list order guard', () => {
  it('flags a list query without .orderBy()', () => {
    expect(
      failuresFor(`export class Example {
  async list() {
    return this.db
      .select()
      .from(roles)
      .where(eq(roles.churchId, churchId));
  }
}
`),
    ).toEqual([missingOrder(3)]);
  });

  it('accepts a list query that ends in .orderBy() and a .limit(1) read', () => {
    expect(
      failuresFor(`export class Example {
  async list() {
    return this.db.select().from(roles).orderBy(asc(roles.name), asc(roles.id));
  }
  async first() {
    const [row] = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1);
    return row;
  }
}
`),
    ).toEqual([]);
  });

  it('skips subqueries: call arguments, .as() and builders only passed to calls', () => {
    expect(
      failuresFor(`export class Example {
  async list() {
    const led = this.db.select({ id: ministry.id }).from(ministry);
    const counts = this.db
      .select({ id: role.ministryId, total: count() })
      .from(role)
      .groupBy(role.ministryId)
      .as('counts');
    await this.db.insert(audit).select(this.db.select().from(staged));
    return this.db
      .select({ leads: sql\`\${exists(led)}\` })
      .from(ministry)
      .leftJoin(counts, eq(counts.id, ministry.id))
      .where(inArray(ministry.id, this.db.select({ id: role.ministryId }).from(role)))
      .orderBy(asc(ministry.id));
  }
}
`),
    ).toEqual([]);
  });

  it('accepts an aggregate-only select without GROUP BY, and flags it grouped', () => {
    expect(
      failuresFor(`export class Example {
  async count() {
    const [row] = await this.db
      .select({ total: count(), latest: max(cycle.endDate), ministries: sql<number>\`count(distinct \${role.ministryId})::int\` })
      .from(cycle);
    return this.db
      .select({ state: cycle.state, total: count() })
      .from(cycle)
      .groupBy(cycle.state);
  }
}
`),
    ).toEqual([missingOrder(6)]);
  });

  it('accepts a // list-order: <reason> opt-out above the statement or the chain', () => {
    expect(
      failuresFor(`export class Example {
  async find() {
    // list-order: lookup by primary key
    const [row] = await this.db
      .select()
      .from(roles)
      .where(eq(roles.id, id));
    const [names, ids] = await Promise.all([
      // list-order: read into a Map keyed by id
      this.db.select().from(roles),
      this.db.select().from(sectors),
    ]);
    return { row, names, ids };
  }
}
`),
    ).toEqual([missingOrder(11)]);
  });

  it('rejects an opt-out without a reason', () => {
    expect(
      failuresFor(`export class Example {
  async list() {
    // list-order:
    return this.db.select().from(roles);
  }
}
`),
    ).toEqual([
      `${PATH}:3: list-order opt-out needs a reason: // list-order: <why the order does not matter>`,
    ]);
  });

  it('checks a set operation as one list query', () => {
    expect(
      failuresFor(`export class Example {
  async uses() {
    const a = this.db.selectDistinct({ id: block.addressId }).from(block);
    const b = this.db.selectDistinct({ id: event.addressId }).from(event);
    const unordered = await union(a, b);
    const ordered = await union(a, b).orderBy(asc(sql\`id\`));
    return { unordered, ordered };
  }
}
`),
    ).toEqual([missingOrder(5)]);
  });

  it('ignores a .select() that is not a query builder', () => {
    expect(
      failuresFor(
        'export const plural = (count: number) => new Intl.PluralRules("pt-BR").select(count);\n',
      ),
    ).toEqual([]);
  });

  it('checks only server infrastructure files', () => {
    const source = 'export const list = () => db.select().from(roles);\n';
    expect(
      [
        'apps/server/src/application/role/list-roles.ts',
        'apps/server/tests/infrastructure/repositories/drizzle-role.repository.test.ts',
        'apps/server/seeds/recipes/roles.ts',
        'apps/web/src/infrastructure/roles.ts',
      ].flatMap((path) => failuresFor(source, path)),
    ).toEqual([]);
  });

  it('flags a builder stored in a variable and awaited later', () => {
    expect(
      failuresFor(`export class Example {
  async list() {
    const query = this.db.select().from(roles);
    return await query;
  }
}
`),
    ).toEqual([missingOrder(3)]);
  });
});

import { z } from 'zod';

export interface PageLimitSchemaInput {
  maxPageSize: number;
}

/** A list route's `limit` querystring: a whole page size from 1 to the route's maximum. */
export function pageLimitSchema({ maxPageSize }: PageLimitSchemaInput) {
  return z.coerce.number().int().min(1).max(maxPageSize);
}

export interface WithPageLimitInput<Shape extends z.ZodRawShape> {
  querystring: z.ZodObject<Shape>;
  maxPageSize: number;
}

/** A list route's querystring with its bounded `limit`; an omitted `limit` stays absent. */
export function withPageLimit<Shape extends z.ZodRawShape>({
  querystring,
  maxPageSize,
}: WithPageLimitInput<Shape>) {
  return querystring.extend({
    limit: pageLimitSchema({ maxPageSize }).optional(),
  });
}

export interface WithDefaultPageLimitInput<Shape extends z.ZodRawShape>
  extends WithPageLimitInput<Shape> {
  /** The page size an omitted `limit` stands for. */
  pageSize: number;
}

/** {@link withPageLimit}, with an omitted `limit` standing for the route's page size. */
export function withDefaultPageLimit<Shape extends z.ZodRawShape>({
  querystring,
  maxPageSize,
  pageSize,
}: WithDefaultPageLimitInput<Shape>) {
  return querystring.extend({
    limit: pageLimitSchema({ maxPageSize }).default(pageSize),
  });
}

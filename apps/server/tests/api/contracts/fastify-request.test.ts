import type { FastifyRequest } from 'fastify';
import { describe, expectTypeOf, it } from 'vitest';
import type { ChurchId, UserId, VolunteerId } from '@/domain/branded-ids';

describe('FastifyRequest', () => {
  it('carries the caller ids Active Church resolution set, already branded', () => {
    expectTypeOf<FastifyRequest['churchId']>().toExtend<ChurchId>();
    expectTypeOf<FastifyRequest['userId']>().toExtend<UserId>();
    expectTypeOf<FastifyRequest['volunteerId']>().toExtend<
      VolunteerId | undefined
    >();
  });

  it('refuses an unbranded string for any caller id', () => {
    expectTypeOf<string>().not.toExtend<FastifyRequest['churchId']>();
    expectTypeOf<string>().not.toExtend<FastifyRequest['userId']>();
    expectTypeOf<string>().not.toExtend<FastifyRequest['volunteerId']>();
  });
});

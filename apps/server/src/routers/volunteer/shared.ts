import { TRPCError } from '@trpc/server';
import type { UserId, Volunteer } from '../../domain/entities/volunteer';
import { repositories } from '../../infrastructure/repositories/registry';

export async function getCurrentVolunteer(userId: string): Promise<Volunteer> {
  const volunteer = await repositories.volunteers.findByUserIdGlobally(
    userId as UserId,
  );

  if (!volunteer) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Active volunteer profile not found',
    });
  }

  return volunteer;
}

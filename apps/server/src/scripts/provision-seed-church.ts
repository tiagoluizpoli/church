import type { ChurchRecord, TenancyWriter } from '@church/db';
import { ensurePlatformOperator } from './ensure-platform-operator';
import { provisionChurch } from './provision-church';

export interface ProvisionSeedChurchInput {
  db: TenancyWriter;
  churchName: string;
  churchSlug: string;
  adminEmail: string;
}

/**
 * Shared by the dev seed entry points: ensures the local stand-in Platform
 * Operator, then provisions the Church through the real operation.
 * `provisionChurch` isn't idempotent, so callers must confirm the Church
 * doesn't already exist before calling this.
 */
export async function provisionSeedChurch({
  db,
  churchName,
  churchSlug,
  adminEmail,
}: ProvisionSeedChurchInput): Promise<ChurchRecord> {
  const operator = await ensurePlatformOperator({ db });
  const { church } = await provisionChurch({
    db,
    churchName,
    churchSlug,
    adminEmail,
    operatorUserId: operator.id,
  });
  return church;
}

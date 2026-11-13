import { runtimeConfiguration } from '@church/db';
import { eq, sql } from 'drizzle-orm';
import type { RuntimeConfigurationRepository } from '../../domain/contracts/infrastructure/runtime-configuration.repository';
import type { AnyDrizzleDb } from './types';

const EMAIL_DELIVERY_MODE_CODE = 'email_delivery_mode';

/** Freezes the current mode into an outbox insert, in that same statement. */
export const currentEmailDeliveryMode = sql`(SELECT ${runtimeConfiguration.value} FROM ${runtimeConfiguration} WHERE ${runtimeConfiguration.code} = ${EMAIL_DELIVERY_MODE_CODE})`;

interface DrizzleRuntimeConfigurationRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleRuntimeConfigurationRepository
  implements RuntimeConfigurationRepository
{
  private readonly db: AnyDrizzleDb;

  constructor({ db }: DrizzleRuntimeConfigurationRepositoryInput) {
    this.db = db;
  }

  async findEmailDeliveryMode(): Promise<unknown> {
    const [row] = await this.db
      .select({ value: runtimeConfiguration.value })
      .from(runtimeConfiguration)
      .where(eq(runtimeConfiguration.code, EMAIL_DELIVERY_MODE_CODE));
    return row?.value;
  }
}

import { churchAddress } from '@church/db';
import type { AnyDrizzleDb } from '@/infrastructure/repositories/types';

export interface InsertChurchAddressInput {
  db: AnyDrizzleDb;
  churchId: string;
  label?: string | null;
  street?: string;
  isPublic?: boolean;
  /** The first address of a Church must be main; later ones must not. */
  isMain?: boolean;
  position?: number;
}

/** A Church Address in Centro, Campinas/SP; returns its id. */
export async function insertChurchAddress({
  db,
  churchId,
  label = 'Templo',
  street = 'Rua A',
  isPublic = true,
  isMain = true,
  position = 0,
}: InsertChurchAddressInput): Promise<string> {
  const [row] = await db
    .insert(churchAddress)
    .values({
      churchId,
      label,
      street,
      number: '10',
      bairro: 'Centro',
      city: 'Campinas',
      uf: 'SP',
      isPublic,
      isMain,
      position,
    })
    .returning({ id: churchAddress.id });
  if (!row) throw new Error('Church Address insert failed');
  return row.id;
}

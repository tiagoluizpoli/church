import type { AnyDrizzleDb } from '@/infrastructure/repositories/drizzle-db.types';
import { buildChurchAddress } from '@/seeds/builders/church';

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

/** A Church Address in Centro, Campinas/SP through the seed builder (ADR-0006); returns its id. */
export function insertChurchAddress({
  db,
  churchId,
  label = 'Templo',
  street = 'Rua A',
  isPublic = true,
  isMain = true,
  position = 0,
}: InsertChurchAddressInput): Promise<string> {
  return buildChurchAddress({
    db,
    churchId,
    position,
    isMain,
    address: {
      label: label ?? undefined,
      street,
      number: '10',
      bairro: 'Centro',
      city: 'Campinas',
      uf: 'SP',
      isPublic,
    },
  });
}

import type { AnyDrizzleDb } from '@/infrastructure/repositories/types';

export interface DrizzleVolunteerRepositoryInput {
  db: AnyDrizzleDb;
}

export interface MembershipScopedRow {
  membershipId: string;
}

export interface GroupByMembershipInput<
  TRow extends MembershipScopedRow,
  TValue,
> {
  rows: TRow[];
  select: (row: TRow) => TValue;
}

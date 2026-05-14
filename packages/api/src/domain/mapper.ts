/**
 * Interface defining the contract for mapping between Drizzle ORM schemas and Domain Entities.
 * Enforces persistence-agnostic business logic in the domain layer.
 */
export interface EntityMapper<SchemaRow, DomainEntity, InsertRow> {
  toDomain(row: SchemaRow): DomainEntity;
  toPersistence(entity: DomainEntity): InsertRow;
}

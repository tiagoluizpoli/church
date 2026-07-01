import { randomUUID } from 'node:crypto';

/**
 * Base abstract class for all Domain Entities.
 * Enforces the presence of an ID, creation/update timestamps, and encapsulated properties.
 */
export abstract class Entity<T, Id extends string = string> {
  protected readonly _id: Id;
  protected _props: T;
  protected readonly _createdAt: Date;
  protected _updatedAt: Date;

  constructor(props: T, id?: Id, createdAt?: Date, updatedAt?: Date) {
    this._id = id ?? (randomUUID() as Id);
    this._props = props;
    this._createdAt = createdAt ?? new Date();
    this._updatedAt = updatedAt ?? this._createdAt;
  }

  get id(): Id {
    return this._id;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  public equals(other?: Entity<T, Id>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (!(other instanceof Entity)) {
      return false;
    }
    return this._id === other._id;
  }
}

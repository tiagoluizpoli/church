import { type BrandedId, Entity } from '@church/core';

export type ChurchId = BrandedId<'ChurchId'>;
export type ChurchSlug = BrandedId<'ChurchSlug'>;

export interface ChurchProps {
  name: string;
  slug: ChurchSlug;
  timezone: string;
  settings?: Record<string, unknown>;
}

export class Church extends Entity<ChurchProps, ChurchId> {
  constructor(
    props: Omit<ChurchProps, 'timezone'> &
      Partial<Pick<ChurchProps, 'timezone'>>,
    id?: ChurchId,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        timezone: props.timezone ?? 'UTC',
      },
      id,
      createdAt,
      updatedAt,
    );
  }

  get name(): string {
    return this._props.name;
  }

  get slug(): ChurchSlug {
    return this._props.slug;
  }

  get timezone(): string {
    return this._props.timezone;
  }

  get settings(): Record<string, unknown> | undefined {
    return this._props.settings ?? undefined;
  }
}

import { Entity } from '@church/core';

export interface ChurchProps {
  name: string;
  slug: string;
  timezone: string;
  settings?: Record<string, unknown>;
}

export class Church extends Entity<ChurchProps> {
  constructor(
    props: Omit<ChurchProps, 'timezone'> &
      Partial<Pick<ChurchProps, 'timezone'>>,
    id?: string,
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

  get slug(): string {
    return this._props.slug;
  }

  get timezone(): string {
    return this._props.timezone;
  }

  get settings(): Record<string, unknown> | undefined {
    return this._props.settings ?? undefined;
  }
}

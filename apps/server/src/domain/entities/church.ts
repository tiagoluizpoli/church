import { type BrandedId, Entity, type LooseProps } from '@church/core';
import type { ChurchId } from '../branded-ids';
export type ChurchSlug = BrandedId<'ChurchSlug'>;

export interface ChurchProps {
  name: string;
  slug: ChurchSlug;
  timezone: string;
  settings?: Record<string, unknown>;
}

export interface ChurchInput {
  props: Omit<LooseProps<ChurchProps>, 'timezone'> &
    Partial<Pick<LooseProps<ChurchProps>, 'timezone'>>;
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Church extends Entity<ChurchProps, ChurchId> {
  constructor({ props, id, createdAt, updatedAt }: ChurchInput) {
    super({
      props: {
        ...props,
        timezone: props.timezone ?? 'UTC',
      } as ChurchProps,
      id: id as ChurchId,
      createdAt,
      updatedAt,
    });
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

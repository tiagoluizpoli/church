import { type BrandedId, Entity, type LooseProps } from '@church/core';
import type {
  ChurchId,
  MinistryId,
  RoleId,
  RoleTemplateId,
} from '../branded-ids';
import { InvalidRequiredCountError } from '../errors/invalid-required-count';
export type RoleTemplateItemId = BrandedId<'RoleTemplateItemId'>;

export interface RoleTemplateItemProps {
  churchId: ChurchId;
  templateId: RoleTemplateId;
  roleId: RoleId;
  requiredCount: number;
}

export class RoleTemplateItem extends Entity<
  RoleTemplateItemProps,
  RoleTemplateItemId
> {
  constructor(
    props: LooseProps<RoleTemplateItemProps>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    if (props.requiredCount < 1) {
      throw new InvalidRequiredCountError();
    }
    super(
      props as RoleTemplateItemProps,
      id as RoleTemplateItemId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get templateId(): RoleTemplateId {
    return this._props.templateId;
  }

  get roleId(): RoleId {
    return this._props.roleId;
  }

  get requiredCount(): number {
    return this._props.requiredCount;
  }
}

export interface RoleTemplateProps {
  churchId: ChurchId;
  ministryId: MinistryId;
  name: string;
  items: RoleTemplateItem[];
}

export class RoleTemplate extends Entity<RoleTemplateProps, RoleTemplateId> {
  constructor(
    props: Omit<LooseProps<RoleTemplateProps>, 'items'> &
      Partial<Pick<LooseProps<RoleTemplateProps>, 'items'>>,
    id?: string,
    createdAt?: Date,
    updatedAt?: Date,
  ) {
    super(
      {
        ...props,
        items: props.items ?? [],
      } as unknown as RoleTemplateProps,
      id as RoleTemplateId,
      createdAt,
      updatedAt,
    );
  }

  get churchId(): ChurchId {
    return this._props.churchId;
  }

  get ministryId(): MinistryId {
    return this._props.ministryId;
  }

  get name(): string {
    return this._props.name;
  }

  get items(): RoleTemplateItem[] {
    return this._props.items;
  }
}

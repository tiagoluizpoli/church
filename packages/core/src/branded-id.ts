declare const __brand: unique symbol;
export type BrandedId<Brand extends string> = string & {
  readonly [__brand]: Brand;
};

export type LooseProps<T> = {
  [K in keyof T]: Extract<T[K], string> extends never
    ? T[K]
    : Exclude<T[K], string> | string;
};

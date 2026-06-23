declare const __brand: unique symbol;
export type BrandedId<Brand extends string> = string & {
  readonly [__brand]: Brand;
};

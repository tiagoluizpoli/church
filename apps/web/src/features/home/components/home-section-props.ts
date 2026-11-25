/** What every Home section slot receives; use them in `homeSectionQueryKey`. */
export interface HomeSectionProps {
  churchId: string;
  userId: string;
}

/** A section read another widget can share; `enabled: false` when the caller lacks the capacity. */
export interface HomeReadProps extends HomeSectionProps {
  enabled?: boolean;
}

import type { Query, QueryClient } from '@tanstack/react-query';

type ActiveChurchRoutePolicyKind = 'preserve' | 'fallback';

interface ActiveChurchRoutePolicy {
  pattern: RegExp;
  policy: ActiveChurchRoutePolicyKind;
}

interface GetActiveChurchDestinationInput {
  destination: string;
}

interface SelectActiveChurchInput {
  churchId: string;
}

interface ActiveChurchNavigatorInput {
  destination: string;
}

interface SwitchActiveChurchInput {
  churchId: string;
  destination: string;
  queryClient: QueryClient;
  selectActiveChurch: (input: SelectActiveChurchInput) => Promise<void> | void;
  navigate: (input: ActiveChurchNavigatorInput) => Promise<void> | void;
}

const DASHBOARD_DESTINATION = '/dashboard';
const DESTINATION_BASE_URL = 'https://church.local';

// Every current Church-scoped route has an explicit policy. Parameterized
// resource routes deliberately fall back because their identifiers are owned
// by the previous Church context.
const ACTIVE_CHURCH_ROUTE_POLICIES: ActiveChurchRoutePolicy[] = [
  { pattern: /^\/$/, policy: 'fallback' },
  { pattern: /^\/dashboard$/, policy: 'preserve' },
  { pattern: /^\/availability$/, policy: 'fallback' },
  { pattern: /^\/notifications$/, policy: 'preserve' },
  { pattern: /^\/volunteer\/availability$/, policy: 'preserve' },
  { pattern: /^\/scheduling$/, policy: 'fallback' },
  { pattern: /^\/scheduling\/planning-cycles\/?$/, policy: 'preserve' },
  { pattern: /^\/scheduling\/planning-cycles\/new$/, policy: 'fallback' },
  {
    pattern: /^\/scheduling\/planning-cycles\/templates$/,
    policy: 'preserve',
  },
  {
    pattern: /^\/scheduling\/planning-cycles\/[^/]+$/,
    policy: 'fallback',
  },
  { pattern: /^\/scheduling\/tailoring\/?$/, policy: 'preserve' },
  { pattern: /^\/scheduling\/tailoring\/[^/]+$/, policy: 'fallback' },
  {
    pattern: /^\/scheduling\/tailoring\/[^/]+\/[^/]+$/,
    policy: 'fallback',
  },
  {
    pattern: /^\/scheduling\/rostering\/[^/]+\/[^/]+$/,
    policy: 'fallback',
  },
];

function isChurchScopedQuery(query: Query): boolean {
  return query.queryKey[0] !== 'active-church';
}

function getDestinationPathname({
  destination,
}: GetActiveChurchDestinationInput): string | null {
  try {
    const parsedDestination = new URL(destination, DESTINATION_BASE_URL);
    return parsedDestination.origin === DESTINATION_BASE_URL
      ? parsedDestination.pathname
      : null;
  } catch {
    return null;
  }
}

export function getActiveChurchDestination({
  destination,
}: GetActiveChurchDestinationInput): string {
  const pathname = getDestinationPathname({ destination });
  if (!pathname) return DASHBOARD_DESTINATION;

  const routePolicy = ACTIVE_CHURCH_ROUTE_POLICIES.find(({ pattern }) =>
    pattern.test(pathname),
  );

  return routePolicy?.policy === 'preserve'
    ? destination
    : DASHBOARD_DESTINATION;
}

export async function switchActiveChurch({
  churchId,
  destination,
  navigate,
  queryClient,
  selectActiveChurch,
}: SwitchActiveChurchInput): Promise<void> {
  await queryClient.cancelQueries({ predicate: isChurchScopedQuery });
  queryClient.removeQueries({ predicate: isChurchScopedQuery });
  await selectActiveChurch({ churchId });
  await navigate({
    destination: getActiveChurchDestination({ destination }),
  });
}

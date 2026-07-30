import type { Query, QueryClient } from '@tanstack/react-query';
import { postActiveChurchSwitched } from '@/shared/utils/active-church-broadcast';

export type ActiveChurchArea = 'dashboard' | 'scheduling';

type ActiveChurchRoutePolicy =
  | { pattern: RegExp; policy: 'fallback' }
  | { pattern: RegExp; policy: 'preserve'; requiredArea: ActiveChurchArea };

interface GetActiveChurchDestinationInput {
  availableAreas: ActiveChurchArea[];
  destination: string;
}

interface GetDestinationPathnameInput {
  destination: string;
}

interface SelectActiveChurchInput {
  churchId: string;
}

interface ActiveChurchNavigatorInput {
  destination: string;
}

interface SwitchActiveChurchInput {
  availableAreas: ActiveChurchArea[];
  churchId: string;
  churchName: string;
  destination: string;
  queryClient: QueryClient;
  selectActiveChurch: (input: SelectActiveChurchInput) => Promise<void> | void;
  navigate: (input: ActiveChurchNavigatorInput) => Promise<void> | void;
}

interface ClearActiveChurchScopedCacheInput {
  queryClient: QueryClient;
}

const DASHBOARD_DESTINATION = '/dashboard';
const DESTINATION_BASE_URL = 'https://church.local';

// Every current Church-scoped route has an explicit policy. Parameterized
// resource routes deliberately fall back because their identifiers are owned
// by the previous Church context.
const ACTIVE_CHURCH_ROUTE_POLICIES: ActiveChurchRoutePolicy[] = [
  { pattern: /^\/$/, policy: 'fallback' },
  {
    pattern: /^\/dashboard$/,
    policy: 'preserve',
    requiredArea: 'dashboard',
  },
  { pattern: /^\/availability$/, policy: 'fallback' },
  { pattern: /^\/notifications$/, policy: 'fallback' },
  { pattern: /^\/volunteer\/availability$/, policy: 'fallback' },
  { pattern: /^\/scheduling\/?$/, policy: 'fallback' },
  {
    pattern: /^\/scheduling\/planning-cycles\/?$/,
    policy: 'preserve',
    requiredArea: 'scheduling',
  },
  { pattern: /^\/scheduling\/planning-cycles\/new$/, policy: 'fallback' },
  {
    pattern: /^\/scheduling\/planning-cycles\/templates$/,
    policy: 'preserve',
    requiredArea: 'scheduling',
  },
  {
    pattern: /^\/scheduling\/planning-cycles\/[^/]+$/,
    policy: 'fallback',
  },
  {
    pattern: /^\/scheduling\/tailoring\/?$/,
    policy: 'preserve',
    requiredArea: 'scheduling',
  },
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

export function isChurchScopedQuery(query: Query): boolean {
  return query.queryKey[0] !== 'active-church';
}

export async function clearActiveChurchScopedCache({
  queryClient,
}: ClearActiveChurchScopedCacheInput): Promise<void> {
  await queryClient.cancelQueries({ predicate: isChurchScopedQuery });
  queryClient.removeQueries({ predicate: isChurchScopedQuery });
}

function getDestinationPathname({
  destination,
}: GetDestinationPathnameInput): string | null {
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
  availableAreas,
  destination,
}: GetActiveChurchDestinationInput): string {
  const pathname = getDestinationPathname({ destination });
  if (!pathname) return DASHBOARD_DESTINATION;

  const routePolicy = ACTIVE_CHURCH_ROUTE_POLICIES.find(({ pattern }) =>
    pattern.test(pathname),
  );

  return routePolicy?.policy === 'preserve' &&
    availableAreas.includes(routePolicy.requiredArea)
    ? destination
    : DASHBOARD_DESTINATION;
}

export async function switchActiveChurch({
  availableAreas,
  churchId,
  churchName,
  destination,
  navigate,
  queryClient,
  selectActiveChurch,
}: SwitchActiveChurchInput): Promise<void> {
  await clearActiveChurchScopedCache({ queryClient });
  await selectActiveChurch({ churchId });
  postActiveChurchSwitched({ availableAreas, churchId, churchName });
  await navigate({
    destination: getActiveChurchDestination({ availableAreas, destination }),
  });
}

import { RESERVED_CHURCH_SLUGS } from '@church/app-config/church-slug';
import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { routeTree } from '@/routeTree.gen';

// A top-level route whose first segment is not reserved could collide with a Church Slug at `/{slug}`.
describe('the generated route tree', () => {
  const router = createRouter({
    routeTree,
    context: { queryClient: new QueryClient() },
  });
  const firstSegments = [
    ...new Set(
      Object.keys(router.routesByPath)
        .map((path) => path.split('/')[1])
        // `$slug` is the Public Church Profile itself, the route slugs live under.
        .filter((segment) => segment && segment !== '$slug'),
    ),
  ];

  it('has top-level routes to check', () => {
    expect(firstSegments).toContain('app');
  });

  it('serves the Public Church Profile at the root', () => {
    expect(router.routesByPath).toHaveProperty('/$slug');
  });

  it.each(
    firstSegments,
  )('reserves the top-level segment "%s" as a Church Slug', (segment) => {
    expect(RESERVED_CHURCH_SLUGS).toContain(segment);
  });
});

import { m } from '@church/i18n/messages';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RouteProgress } from '@/components/route-progress';

function mount() {
  const root = createRootRoute({
    component: () => (
      <>
        <RouteProgress />
        <button
          type="button"
          onClick={() => router.navigate({ to: '/next' as never })}
        >
          go
        </button>
        <Outlet />
      </>
    ),
  });
  const home = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <p>home page</p>,
  });
  const next = createRoute({
    getParentRoute: () => root,
    path: '/next',
    loader: () => new Promise((resolve) => setTimeout(resolve, 150)),
    component: () => <p>next page</p>,
  });
  let router: ReturnType<typeof createRouter>;
  router = createRouter({
    routeTree: root.addChildren([home, next]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPendingMs: Number.POSITIVE_INFINITY,
  });
  return render(<RouterProvider router={router} />);
}

describe('RouteProgress', () => {
  it('shows a labelled progress bar while navigating and keeps the previous page', async () => {
    mount();
    await screen.findByText('home page');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'go' }));

    expect(
      await screen.findByRole('progressbar', { name: m.shell_route_loading() }),
    ).toBeInTheDocument();
    expect(screen.getByText('home page')).toBeInTheDocument();

    expect(await screen.findByText('next page')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});

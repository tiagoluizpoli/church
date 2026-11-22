import { createFileRoute, notFound, redirect } from '@tanstack/react-router';
import { isAxiosError } from 'axios';
import {
  PublicChurchNotFound,
  PublicChurchPage,
} from '@/features/public-church/components/public-church-page';
import { publicChurchProfileApi } from '@/utils/api-instances';

const NOT_FOUND_STATUS = 404;

/** The sign-in-free Public Church Profile at the web root. */
export const Route = createFileRoute('/$slug')({
  loader: async ({ context, params: { slug } }) => {
    try {
      const profile = await context.queryClient.ensureQueryData({
        queryKey: ['public-church-profile', slug],
        queryFn: () => publicChurchProfileApi.getPublicChurchProfile(slug),
        meta: { showsOwnError: true },
      });
      // An old slug answers with the current one: move there, keeping no history entry.
      if (profile.slug !== slug) {
        throw redirect({
          to: '/$slug',
          params: { slug: profile.slug },
          replace: true,
        });
      }
      return profile;
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === NOT_FOUND_STATUS) {
        throw notFound();
      }
      throw error;
    }
  },
  component: PublicChurchRoute,
  notFoundComponent: PublicChurchNotFound,
});

function PublicChurchRoute() {
  return <PublicChurchPage profile={Route.useLoaderData()} />;
}

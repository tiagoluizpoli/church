import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

const availabilitySearchSchema = z.object({
  eventId: z.string().optional(),
});

export const Route = createFileRoute('/availability')({
  validateSearch: (search) => availabilitySearchSchema.parse(search),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/dashboard',
      search: {
        section: 'availability',
        eventId: search.eventId,
      },
    });
  },
});

import type { z } from 'zod';
import type { reportEventSchema } from './privacy';

export type ScrubbedEvent = z.infer<typeof reportEventSchema>;

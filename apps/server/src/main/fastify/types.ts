import type { createFastify } from './setup';

export type FastifyTypedInstance = Awaited<ReturnType<typeof createFastify>>;

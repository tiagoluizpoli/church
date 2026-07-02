export {};

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    volunteerId: string;
    churchId: string;
  }
}

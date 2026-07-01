export {};

declare module 'fastify' {
  interface FastifyRequest {
    volunteerId: string;
    churchId: string;
  }
}

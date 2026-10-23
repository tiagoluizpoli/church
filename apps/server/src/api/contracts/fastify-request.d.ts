export {};

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
    /** Absent for a caller with Church Membership but no Volunteer profile in the active Church — a Church admin, for instance. */
    volunteerId?: string;
    churchId: string;
    /** Resolved once per request from the locale cookie. */
    locale: import('@church/i18n/runtime').Locale;
  }
}

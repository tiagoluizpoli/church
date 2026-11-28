export {};

declare module 'fastify' {
  interface FastifyRequest {
    userId: import('../../domain/branded-ids').UserId;
    /** Absent for a caller with Church Membership but no Volunteer profile in the active Church — a Church admin, for instance. */
    volunteerId?: import('../../domain/branded-ids').VolunteerId;
    churchId: import('../../domain/branded-ids').ChurchId;
    /**
     * The caller as Active Church resolution read it for this request; its
     * authority checks reuse it. Absent where no resolver supplied one.
     */
    actor?: import('../../domain/authority/types').AuthorityActor;
    /** Resolved once per request from the locale cookie. */
    locale: import('@church/i18n/runtime').Locale;
  }
}

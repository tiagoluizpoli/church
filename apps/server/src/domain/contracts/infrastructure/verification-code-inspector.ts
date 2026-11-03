export interface LastVerificationCodeForInput {
  to: string;
}

export interface LastInvitationLinkForInput {
  to: string;
}

/**
 * Implemented only by the non-production capture-mode email sender — lets
 * application code read back a code it would otherwise only ever emit
 * through `EmailSender.send` and hash at rest (spec.md §7.4), and the
 * joining link an invitation email actually carried.
 */
export interface VerificationCodeInspector {
  lastVerificationCodeFor(
    input: LastVerificationCodeForInput,
  ): string | undefined;
  lastInvitationLinkFor(input: LastInvitationLinkForInput): string | undefined;
}

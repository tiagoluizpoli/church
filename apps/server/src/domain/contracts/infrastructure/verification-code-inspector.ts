export interface LastVerificationCodeForInput {
  to: string;
}

/**
 * Implemented only by the non-production capture-mode email sender — lets
 * application code read back a code it would otherwise only ever emit
 * through `EmailSender.send` and hash at rest (spec.md §7.4).
 */
export interface VerificationCodeInspector {
  lastVerificationCodeFor(
    input: LastVerificationCodeForInput,
  ): string | undefined;
}

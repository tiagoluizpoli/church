/** Reads operator-edited runtime configuration; never cached. */
export interface RuntimeConfigurationRepository {
  /** The raw `email_delivery_mode` value, or undefined when unset. Untrusted:
   * the caller validates it. A database failure rejects. */
  findEmailDeliveryMode(): Promise<unknown>;
}

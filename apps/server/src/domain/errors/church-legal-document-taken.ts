import { DomainError } from '@church/core';

/** Another Church holds this legal document; the message never says which. */
export class ChurchLegalDocumentTakenError extends DomainError {
  readonly code = 'CHURCH_LEGAL_DOCUMENT_TAKEN' as const;

  constructor() {
    super('This legal document is already registered.');
  }
}

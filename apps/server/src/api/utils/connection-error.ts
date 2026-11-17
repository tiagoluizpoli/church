const SOCKET_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET']);
const SQLSTATES = new Set(['57P01', '57P02', '57P03', '53300']);

type ErrorWithCause = { code?: unknown; cause?: unknown };

// Fixed list (ADR 0016): SQLSTATE class 08, 57P01-57P03, 53300, driver socket codes.
// Walks the cause chain because the ORM wraps the driver error.
type ConnectionErrorParams = { error: unknown };

export const connectionErrorCode = ({
  error,
}: ConnectionErrorParams): string | undefined => {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const { code, cause } = current as ErrorWithCause;
    if (
      typeof code === 'string' &&
      (code.startsWith('08') || SQLSTATES.has(code) || SOCKET_CODES.has(code))
    ) {
      return code;
    }
    current = cause;
  }
  return undefined;
};

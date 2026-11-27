export interface LogEntry {
  message: string;
  error?: unknown;
}

export interface ShutdownSteps {
  closeApp: () => Promise<void>;
  stopPoller: () => Promise<void>;
  closeDatabase: () => Promise<void>;
  exit: (code: number) => void;
  log: (entry: LogEntry) => void;
}

export interface UnhandledRejectionOptions {
  reason: unknown;
  log: ShutdownSteps['log'];
}

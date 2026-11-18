/** What this process is actually connected to, read from the live connection. */
export interface ConnectedEnvironment {
  /** The CHURCH_ENVIRONMENT label the process was started with. */
  environment: string;
  /** `current_database()` */
  database: string;
  /** `current_user` */
  role: string;
}

export const CONNECTED_IDENTITY_QUERY =
  'SELECT current_database() AS database, current_user AS role';

export interface AssertConnectedToInput {
  requested: string;
  connected: ConnectedEnvironment;
}

/**
 * The label alone cannot catch a DATABASE_URL copied from another
 * environment: the connection itself must be role and database
 * church_<requested>. Never prints the URL or its password.
 */
export function assertConnectedTo({
  requested,
  connected,
}: AssertConnectedToInput): void {
  if (requested !== connected.environment) {
    throw new Error(
      `Refusing target "${requested}": this process is connected to "${connected.environment}".`,
    );
  }
  const expected = `church_${requested}`;
  if (connected.database !== expected || connected.role !== expected) {
    throw new Error(
      `Refusing target "${requested}": this process is connected to database "${connected.database}" as role "${connected.role}", not ${expected}.`,
    );
  }
}

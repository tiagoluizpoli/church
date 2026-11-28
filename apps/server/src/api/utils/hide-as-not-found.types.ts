/** An error class whose instances a route answers as 404. */
// named-parameters-ignore: any error constructor, whatever its parameters
export type HiddenErrorClass = abstract new (...args: never[]) => Error;

export interface HideAsNotFoundInput<T> {
  /** The errors that must look like a missing object to this caller. */
  errors: readonly HiddenErrorClass[];
  operation: () => Promise<T>;
}

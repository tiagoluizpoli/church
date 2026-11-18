export interface MaskEmailInput {
  email: string;
}

/** Reveals only the first letter of the local part and the domain, for showing a wrong login who the invitation was sent to. */
export function maskEmail({ email }: MaskEmailInput): string {
  const atIndex = email.lastIndexOf('@');
  return `${email.slice(0, 1)}***${email.slice(atIndex)}`;
}

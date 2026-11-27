/** The fields of nodemailer's SMTP result this sender relies on. */
export interface SmtpDelivery {
  messageId: string;
  rejected?: Array<string | { address: string }>;
  rejectedErrors?: unknown[];
}

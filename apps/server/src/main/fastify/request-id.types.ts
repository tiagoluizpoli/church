import type { IncomingHttpHeaders } from 'node:http';

export interface RequestIdInput {
  headers: IncomingHttpHeaders;
}

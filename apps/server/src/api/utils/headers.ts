import type { FastifyRequest } from 'fastify';

export function headersFromRequest(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value)
      headers.append(key, Array.isArray(value) ? value.join(', ') : value);
  }
  return headers;
}

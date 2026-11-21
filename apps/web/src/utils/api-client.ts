import { env } from '@church/env/web';
import type { AxiosRequestConfig } from 'axios';
import axios from 'axios';

const instance = axios.create({
  baseURL: env.VITE_SERVER_URL,
  withCredentials: true,
});

// W3C traceparent field sizes.
const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;

interface RandomHexInput {
  bytes: number;
}

function randomHex({ bytes }: RandomHexInput): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

// A fresh W3C trace per call: the server takes its trace id as the request id.
// shortcut: an all-zero id (odds 2^-128) is invalid and the server mints its own.
instance.interceptors.request.use((config) => {
  const traceId = randomHex({ bytes: TRACE_ID_BYTES });
  const spanId = randomHex({ bytes: SPAN_ID_BYTES });
  config.headers.set('traceparent', `00-${traceId}-${spanId}-01`);
  return config;
});

export const apiClient = <T>(config: AxiosRequestConfig): Promise<T> => {
  return instance.request<T>(config).then((res) => res.data);
};

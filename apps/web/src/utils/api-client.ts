import { env } from '@church/env/web';
import type { AxiosRequestConfig } from 'axios';
import axios from 'axios';

const instance = axios.create({
  baseURL: env.VITE_SERVER_URL,
  withCredentials: true,
});

export const apiClient = <T>(config: AxiosRequestConfig): Promise<T> => {
  return instance.request<T>(config).then((res) => res.data);
};

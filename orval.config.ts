import { defineConfig } from 'orval';

export default defineConfig({
  churchApi: {
    input: {
      target: './apps/server/auto-generated-api.yaml',
      filters: {
        mode: 'include',
        tags: ['admin', 'volunteer', 'feature-flags'],
      },
    },
    output: {
      mode: 'tags',
      target: './apps/web/src/infrastructure/api/',
      client: 'axios',
      clean: true,
      override: {
        mutator: {
          path: './apps/web/src/utils/api-client.ts',
          name: 'apiClient',
        },
      },
    },
  },
});

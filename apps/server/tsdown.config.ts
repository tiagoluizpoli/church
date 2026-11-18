import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: './src/main/server.ts',
  format: 'esm',
  outDir: './dist',
  clean: true,
  noExternal: [/@church\/.*/],
});

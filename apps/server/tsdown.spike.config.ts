import { defineConfig } from 'tsdown';
export default defineConfig({
  entry: ['./src/main/server.ts', './src/scripts/i18n-spike.ts'],
  format: 'esm',
  outDir: './dist-spike',
  clean: true,
  noExternal: [/@church\/.*/],
});

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/db/migrate-cli.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // The shared package ships TypeScript sources, so bundle it into the server output.
  noExternal: ['@cotebook/shared'],
});

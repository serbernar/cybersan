import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// The HUD is served by the daemon from a plain directory, so everything is
// emitted with relative URLs and no hashed-chunk CDN assumptions.
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    // Ordered array, not a map: the bare package id must resolve to the entry
    // module while `@cybersan/protocol/default-state.json` resolves to a file.
    alias: [
      {
        find: /^@cybersan\/protocol$/,
        replacement: fileURLToPath(new URL('../../packages/protocol/src/index.ts', import.meta.url)),
      },
      {
        find: /^@cybersan\/protocol\//,
        replacement: fileURLToPath(new URL('../../packages/protocol/', import.meta.url)),
      },
      { find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) },
    ],
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    target: 'chrome120',
    sourcemap: true,
  },
})

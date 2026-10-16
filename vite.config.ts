import { defineConfig } from 'vite'

// Standalone static page — relative base so it can be hosted at any path.
export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: {
    // pdf.js is loaded only when someone picks a PDF; its size doesn't touch the first load
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // ship the pdf.js worker as .js — some static hosts serve .mjs with the wrong content type
        assetFileNames: (a) => (a.names?.[0]?.endsWith('.mjs') ? 'assets/[name]-[hash].js' : 'assets/[name]-[hash][extname]'),
      },
    },
  },
})

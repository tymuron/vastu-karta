import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone lead-magnet — relative base so it can be hosted at any path.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Load .env from root directory (parent of client folder)
  envDir: path.resolve(__dirname, '..'),
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/uploads/, '/uploads'),
      },
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})

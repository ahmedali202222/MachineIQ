import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development, API calls are proxied to the Spring Boot backend (or the mock server).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.API_URL || 'http://localhost:8080',
    },
  },
})

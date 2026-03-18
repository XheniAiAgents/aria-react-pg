import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:8000',
      '/chat': 'http://localhost:8000',
      '/tasks': 'http://localhost:8000',
      '/events': 'http://localhost:8000',
      '/memories': 'http://localhost:8000',
      '/email': 'http://localhost:8000',
      '/link': 'http://localhost:8000',
      '/notes': 'http://localhost:8000',
    }
  }
})
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") }
  },
  server: {
    // Same-origin proxy avoids CORS + Edge Tracking Prevention noise in local DEV.
    proxy: {
      '/tracking': {
        target: 'http://127.0.0.1:3138',
        changeOrigin: true,
      },
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"
import { visualizer } from 'rollup-plugin-visualizer'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: './dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (
            id.includes('/antd/') ||
            id.includes('\\antd\\') ||
            id.includes('@rc-component') ||
            id.includes('@ant-design')
          ) {
            return 'antd'
          }
          if (
            id.includes('/react-dom/') ||
            id.includes('\\react-dom\\') ||
            id.includes('/react/') ||
            id.includes('\\react\\')
          ) {
            // Only core react packages, not react-* siblings
            if (
              /node_modules[/\\]react[/\\]/.test(id) ||
              /node_modules[/\\]react-dom[/\\]/.test(id) ||
              /node_modules[/\\]scheduler[/\\]/.test(id)
            ) {
              return 'react-vendor'
            }
          }
        },
      },
    },
  },
})

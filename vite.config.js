import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Excel parsers are heavy — split them so the UI shell loads fast
          excel: ['exceljs', 'xlsx'],
          vendor: ['react', 'react-dom', '@azure/msal-browser'],
        },
      },
    },
  },
  plugins: [react()],
  base: '/Scheduling-Dashboard/',
})

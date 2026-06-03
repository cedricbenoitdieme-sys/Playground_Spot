import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Règle 10.3 — JAMAIS activer les source maps en production
  // Les source maps permettent à n'importe qui de reconstituer le code source
  build: {
    sourcemap: false,
  },
})

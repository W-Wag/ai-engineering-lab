import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Em desenvolvimento, o navegador fala só com o Vite; /geracoes é
    // repassado ao backend Fastify.
    proxy: {
      '/geracoes': 'http://127.0.0.1:3001',
    },
  },
})

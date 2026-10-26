import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Em desenvolvimento, o navegador fala só com o Vite; as chamadas a
    // /conversas são repassadas ao backend. A chave da Groq fica no backend.
    proxy: {
      '/conversas': 'http://127.0.0.1:3001',
    },
  },
})

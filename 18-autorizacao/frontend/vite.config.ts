import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // O navegador fala só com o Vite (mesma origem); /sessao e /conversas
    // são repassados ao backend. Por isso o cookie de sessão funciona sem
    // CORS e sem SameSite=None.
    proxy: {
      '/sessao': 'http://127.0.0.1:3001',
      '/conversas': 'http://127.0.0.1:3001',
    },
  },
})

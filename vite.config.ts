import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Mapeia process.env.API_KEY para a variável de ambiente disponível no build/runtime
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  }
})
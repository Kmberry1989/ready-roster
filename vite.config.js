import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const isVercel = process.env.VERCEL === '1' || process.env.VITE_VERCEL === '1';
  return {
    plugins: [react()],
    base: (command === 'serve' || isVercel) ? '/' : '/ready-roster/',
  };
})
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// La app vive en /app/ y la landing estática (carpeta landing/) en la raíz del dominio.
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: {
    outDir: 'dist/app',
    emptyOutDir: true,
  },
})

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: 'tests/visual',
  base: './',
  publicDir: false,
  plugins: [vue()],
  build: {
    target: 'es2022',
    outDir: '../visual-dist',
    emptyOutDir: true,
    rollupOptions: { input: 'tests/visual/cp2-preview.html' },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/*
export default defineConfig({
  plugins: [react()],
  base: '/gemini-react-agent/',
})
*/

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_DEPLOY_TARGET === 'gh-pages'
    ? '/gemini-react-agent/'
    : '/'
})

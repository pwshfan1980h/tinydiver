import { defineConfig } from 'vite';

const pagesBasePath = process.env.PAGES_BASE_PATH || '/';

export default defineConfig({
  base: pagesBasePath,
  server: {
    port: 3000,
    open: true
  }
});

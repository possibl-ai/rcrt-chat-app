import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The service is mounted at /<service_id>/ on the api-gateway ingress.
  // Set base so Vite emits asset paths prefixed with the service path.
  // RCRT_BASE_PATH lets local dev use '/' (default) while the platform
  // build uses '/rcrt-chat-app/'.
  base: process.env.RCRT_BASE_PATH ?? '/rcrt-chat-app/',
  server: {
    port: 8080,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});

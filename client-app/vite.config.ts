import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import federationPlugin from '@originjs/vite-plugin-federation';

const federation =
  typeof federationPlugin === 'function'
    ? federationPlugin
    : (federationPlugin as unknown as { default: typeof federationPlugin.default }).default;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: 'client_app',
      remotes: {
        provider_app: 'http://localhost:5173/assets/remoteEntry.js',
      },
      shared: ['react', 'react-dom', 'lucide-react', 'zod'],
    }),
  ],
  server: {
    port: 5174,
    strictPort: true,
    cors: true,
  },
  preview: {
    port: 5174,
    strictPort: true,
    cors: true,
  },
  build: {
    modulePreload: false,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
});
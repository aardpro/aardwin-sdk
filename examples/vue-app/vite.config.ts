import { defineConfig, loadEnv, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { aardwinDevServer } from './src/server';

export default defineConfig(({ mode }) => {
  // Vite convention: loadEnv(mode, cwd, '') strips the VITE_ prefix so both
  // public and server-only variables are available. clientSecret is passed to
  // the dev-server plugin only; it never reaches the browser bundle.
  const env = loadEnv(mode, process.cwd(), '');
  const siteId = env.VITE_AARDWIN_SITE_ID;
  const clientSecret = env.AARDWIN_CLIENT_SECRET;

  return {
    plugins: [
      // Treat <aardwin-auth> and <aardwin-account> as custom elements so Vue does
      // not try to resolve them as components, and does not attach its own event
      // listeners or attribute proxying.
      vue({
        template: {
          compilerOptions: {
            isCustomElement: (tag) => tag.startsWith('aardwin-'),
          },
        },
      }),
      // Dev-server only: Vite plugin middleware for OAuth callback + session APIs.
      aardwinDevServer({ siteId, clientSecret }),
    ],
    server: {
      port: 5173,
      strictPort: true,
    },
  };
});

// Re-export type for consumers who want to reference the plugin shape.
export type { Plugin };

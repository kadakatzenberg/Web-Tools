import { defineConfig, type Plugin } from 'vite';

/**
 * The public origin is only known at deploy time. Netlify exposes it as `URL`;
 * anything else can pass `SITE_URL`. The fallback keeps the markup valid for
 * local builds without pinning the project to a domain it may never use.
 */
const siteUrl = (
  process.env.SITE_URL ||
  process.env.URL ||
  'https://china-excursion-2026.netlify.app'
).replace(/\/$/, '');

function htmlEnv(): Plugin {
  return {
    name: 'html-site-url',
    transformIndexHtml(html) {
      return html.replaceAll('%SITE_URL%', siteUrl);
    },
  };
}

export default defineConfig({
  plugins: [htmlEnv()],
  build: {
    target: 'es2022',
    cssTarget: 'chrome100',
    minify: 'terser',
    terserOptions: {
      compress: { drop_console: true, drop_debugger: true, passes: 2 },
      format: { comments: false },
    },
    assetsInlineLimit: 2048,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1' },
});

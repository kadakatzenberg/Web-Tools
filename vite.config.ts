import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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

/**
 * The calls to action are deliberately inert until the team's enquiry
 * destination exists: they render as focusable buttons that perform no
 * navigation. The build reports that state once rather than failing, so the
 * site can be deployed and reviewed before the destination is decided.
 */
function contactNotice(): Plugin {
  return {
    name: 'contact-url-notice',
    apply: 'build',
    async buildStart() {
      const source = await readFile(
        fileURLToPath(new URL('./src/config.ts', import.meta.url)),
        'utf8',
      );
      if (!/CONTACT_TEAM_URL: string \| null = null/.test(source)) return;
      this.warn(
        'CONTACT_TEAM_URL is null, so every call to action is a button that goes ' +
          'nowhere. Set it in src/config.ts to wire all of them at once.',
      );
    },
  };
}

/**
 * `public/photos/` is the drop folder for the client's original photographs, not
 * a deploy folder. `npm run photos` reads from it and writes the processed sets
 * into `public/media/photos/`. Vite copies `public/` verbatim, so the originals
 * would otherwise be published at full size beside the versions the page uses.
 */
function stripPhotoSources(): Plugin {
  return {
    name: 'strip-photo-sources',
    apply: 'build',
    async closeBundle() {
      await rm(fileURLToPath(new URL('./dist/photos', import.meta.url)), {
        recursive: true,
        force: true,
      });
    },
  };
}

export default defineConfig({
  plugins: [htmlEnv(), contactNotice(), stripPhotoSources()],
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

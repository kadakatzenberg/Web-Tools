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

const PLACEHOLDER_CONTACT = 'REPLACE_WITH_CONTACT_TEAM_URL';

/**
 * A production build must never ship a call to action that goes nowhere. Every
 * button on this page reads from one constant; if it is still the placeholder,
 * the build stops. Preview builds can opt out with ALLOW_PLACEHOLDER_CONTACT.
 */
function contactGuard(): Plugin {
  return {
    name: 'contact-url-guard',
    apply: 'build',
    async buildStart() {
      const source = await readFile(
        fileURLToPath(new URL('./src/config.ts', import.meta.url)),
        'utf8',
      );
      if (!source.includes(PLACEHOLDER_CONTACT)) return;
      if (process.env.ALLOW_PLACEHOLDER_CONTACT === 'true') {
        this.warn(
          'CONTACT_TEAM_URL is still the placeholder. Building anyway because ' +
            'ALLOW_PLACEHOLDER_CONTACT=true. Do not deploy this build to production.',
        );
        return;
      }
      this.error(
        '\n\n  CONTACT_TEAM_URL has not been set.\n\n' +
          '  Every call to action on this page points at src/config.ts. Replace\n' +
          `  ${PLACEHOLDER_CONTACT} with the destination the China Excursion\n` +
          '  team uses to take enquiries, then build again.\n\n' +
          '  To build a preview with the placeholder in place, run:\n' +
          '    ALLOW_PLACEHOLDER_CONTACT=true npm run build\n',
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
  plugins: [htmlEnv(), contactGuard(), stripPhotoSources()],
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

/**
 * The standalone build: the whole archive as one HTML file.
 *
 * `npm run build:standalone` produces `standalone/hei-mao-library.html`, which
 * runs by double-clicking it. Everything is inlined — scripts, styles, the
 * four font families as base64, the star map's layout worker as a blob — so
 * there is nothing to serve and nothing to install.
 *
 * It is a preview artefact, not the deployment. Two things are necessarily
 * worse than the real build:
 *
 *   - No URL routing. A `file://` document has an opaque origin, so pushing a
 *     path throws; `historyAvailable` in src/app/router.ts detects that and
 *     falls back to in-memory routing. Navigation works, the back button and
 *     shareable links do not.
 *   - No code splitting. The star map, the editor and d3-force all load up
 *     front instead of on demand, because there is nowhere to fetch a chunk
 *     from. That is most of the file's weight.
 *
 * It still talks to the live Supabase project, so it shows real entries and a
 * real star map — it needs a network connection, just not a web server.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * Fold the emitted CSS and JS back into the HTML and drop the now-orphaned
 * asset files.
 *
 * The script is injected as the last child of <body> rather than left in
 * <head> with its module attributes intact: an inline classic script runs
 * synchronously at parse time, and #root has to exist by then.
 */
function inlineEverything(): Plugin {
  return {
    name: 'inline-everything',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find(
        (chunk) => chunk.type === 'asset' && chunk.fileName.endsWith('.html'),
      );
      if (!html || html.type !== 'asset') return;

      let source = String(html.source);

      const styles: string[] = [];
      const scripts: string[] = [];

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName.endsWith('.html')) continue;

        if (chunk.type === 'asset' && fileName.endsWith('.css')) {
          styles.push(String(chunk.source));
          delete bundle[fileName];
        } else if (chunk.type === 'chunk' && fileName.endsWith('.js')) {
          let code = chunk.code;

          /**
           * `import.meta` is a syntax error in a classic script, and this has
           * to be a classic script (see `modulePreload` below).
           *
           * Vite emits `__vitePreload(load, deps, import.meta.url)` around
           * every dynamic import to resolve chunk URLs against the module's
           * own location. There are no chunks left to resolve here, so the
           * argument is dead — but it still has to parse. `document.baseURI`
           * is the honest classic-script equivalent: the URL the document was
           * loaded from.
           *
           * `build.modulePreload: false` does not remove this; it only stops
           * the `<link rel="modulepreload">` tags being written.
           */
          code = code.replace(/\bimport\.meta\.url\b/g, 'document.baseURI');
          code = code.replace(/\bimport\.meta\.env\b/g, '({})');

          /**
           * The other half of the same helper. `__VITE_PRELOAD__` is a marker
           * Vite substitutes with the dependency list for a dynamic import;
           * with `modulePreload: false` the substitution never happens and the
           * bare identifier survives into the output, where it throws a
           * ReferenceError the moment a lazy route is opened — which is to
           * say, the first time anyone clicks Star Map.
           */
          code = code.replace(/\b__VITE_PRELOAD__\b/g, 'void 0');

          // `</script>` anywhere in the bundle would close the tag early.
          scripts.push(code.replace(/<\/script>/gi, '<\\/script>'));
          delete bundle[fileName];
        }

        /**
         * Every reference to the file, not just the one that loads it.
         *
         * Vite emits a `<link rel="stylesheet">` *and* preload hints for the
         * same asset. Matching on href alone found all of them and injected
         * the stylesheet once per match — four copies of a 256KB sheet, and
         * four copies of every embedded font inside it.
         */
        source = source.replace(
          new RegExp(`[^\\S\\n]*<link[^>]*href="[^"]*${escapeForRegExp(fileName)}"[^>]*>\\n?`, 'g'),
          '',
        );
        source = source.replace(
          new RegExp(
            `[^\\S\\n]*<script[^>]*src="[^"]*${escapeForRegExp(fileName)}"[^>]*>\\s*</script>\\n?`,
            'g',
          ),
          '',
        );
      }

      /**
       * The replacements are functions, not strings, and that is not a style
       * choice.
       *
       * `String.replace` treats `$&`, `` $` ``, `$'` and `$1` in a *string*
       * replacement as substitutions. A minified React bundle contains those
       * sequences, and `` $` `` means "everything before the match" — so
       * injecting the script with a string replacement spliced a copy of the
       * entire document, head and inlined stylesheet included, into itself.
       * Four copies, 1.4MB, and a page that mounted React four times over.
       *
       * A replacer function is passed through verbatim, with no `$` parsing.
       */
      if (styles.length) {
        const block = `  <style>${styles.join('\n')}</style>\n  </head>`;
        source = source.replace('</head>', () => block);
      }
      if (scripts.length) {
        const block = `  <script>${scripts.join('\n;')}</script>\n  </body>`;
        source = source.replace('</body>', () => block);
      }

      // The manifest describes an installable app served from an origin.
      source = source.replace(/[^\S\n]*<link rel="manifest"[^>]*>\n?/g, '');

      /**
       * The favicon is the last thing pointing outside the document.
       *
       * It is read from `public/` rather than looked up in the bundle:
       * `publicDir` files are copied straight to the output directory and
       * never enter the rollup graph, so there is nothing here to find.
       * `publicDir` is switched off below for the same reason — otherwise the
       * build leaves an orphaned favicon and manifest beside a file that no
       * longer refers to either.
       */
      const faviconPath = fileURLToPath(new URL('./public/favicon.svg', import.meta.url));
      if (existsSync(faviconPath)) {
        const uri = `data:image/svg+xml;base64,${readFileSync(faviconPath).toString('base64')}`;
        source = source.replace(/href="\.?\/?favicon\.svg"/g, () => `href="${uri}"`);
      }

      html.source = source;
      html.fileName = 'hei-mao-library.html';
    },
  };
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default defineConfig({
  plugins: [react(), inlineEverything()],
  resolve: {
    alias: [
      // Swap the worker factory for the one that inlines the worker as a blob.
      // Listed first: Vite tries aliases in order and the '@' prefix would
      // otherwise claim this path.
      // Latin-only fonts. unicode-range cannot help when everything is
      // inlined, and the unused subsets are most of the file's weight.
      {
        find: /^@\/styles\/fonts\.css$/,
        replacement: fileURLToPath(new URL('./src/styles/fonts.standalone.css', import.meta.url)),
      },
      {
        find: /^@\/starmap\/worker-factory$/,
        replacement: fileURLToPath(
          new URL('./src/starmap/worker-factory.standalone.ts', import.meta.url),
        ),
      },
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
    ],
  },
  // Assets are referenced from inside a single document with no base path.
  base: './',
  // Nothing is served, so nothing is copied alongside; the favicon is read
  // from disk and inlined by the plugin above.
  publicDir: false,
  define: {
    // Lets the app say so, rather than leaving a reader wondering why the
    // address bar never changes.
    __STANDALONE__: 'true',
  },
  worker: {
    // A module worker cannot be constructed from a blob URL in Firefox, and
    // an inlined worker is a blob. Classic format works everywhere.
    format: 'iife',
  },
  build: {
    target: 'es2022',
    outDir: 'standalone',
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    /**
     * No preload helper, which is what forces this bundle to be a *classic*
     * script rather than a module.
     *
     * Vite wraps every dynamic import in `__vitePreload(..., import.meta.url)`
     * so it can inject `<link rel="modulepreload">` for the chunk. Here there
     * are no chunks to preload — `inlineDynamicImports` already folded them
     * in — but the wrapper was still emitted, and `import.meta` in a classic
     * script is a syntax error that killed the bundle before React mounted.
     *
     * `type="module"` would make `import.meta` legal and is the wrong fix: a
     * module script is fetched with CORS, and a `file://` document has an
     * opaque origin, so Chrome refuses to execute it. The artefact has to be
     * a classic script to open off a disk at all.
     */
    modulePreload: false,
    // Fonts and the favicon become data URIs instead of separate requests.
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        // One chunk: there is nowhere to load a second one from.
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
  },
});

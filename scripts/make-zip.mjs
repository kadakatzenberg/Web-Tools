/** Packages the deliverable, excluding installed dependencies and caches. */
import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'china-excursion-2026.zip');

const output = createWriteStream(target);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const mb = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`china-excursion-2026.zip written (${mb} MB)`);
});
archive.on('warning', (err) => {
  if (err.code !== 'ENOENT') throw err;
});
archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

const files = [
  'index.html',
  'capture.html',
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig.json',
  'netlify.toml',
  'README.md',
  '.gitignore',
];
for (const file of files) archive.file(join(root, file), { name: file });

const directories = ['src', 'public', 'scripts', 'dist'];
for (const dir of directories) {
  archive.directory(join(root, dir), dir, (entry) =>
    entry.name.includes('/.cache/') || entry.name.startsWith('.cache/') ? false : entry,
  );
}

await archive.finalize();

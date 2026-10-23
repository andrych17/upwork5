// Builds the Vercel preview into dist/: copy public/, add the copy guard and noindex,
// minify HTML/CSS and obfuscate JS. public/ itself stays clean for the client's
// Cloudflare deploy; nothing here belongs on the live site.
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { transform } from 'esbuild';
import { minify } from 'html-minifier-terser';
import JavaScriptObfuscator from 'javascript-obfuscator';

const SRC = 'public';
const OUT = 'dist';
const GUARD = '/assets/rt.js';
const CLOUDFLARE_ONLY = new Set(['_headers', '_redirects']);

const obfuscate = (code, extra = {}) => JavaScriptObfuscator.obfuscate(code, {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 1,
  target: 'browser',
  ...extra,
}).getObfuscatedCode();

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});

rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true, filter: (src) => !CLOUDFLARE_ONLY.has(src.split('/').pop()) });
// Guard gets the DevTools debugger trap; it only fires while DevTools are open.
writeFileSync(join(OUT, GUARD), obfuscate(readFileSync('scripts/guard.js', 'utf8'), {
  debugProtection: true,
  debugProtectionInterval: 2000,
  disableConsoleOutput: true,
}));

for (const file of walk(OUT)) {
  const ext = extname(file);
  if (file === join(OUT, GUARD)) continue;
  const text = () => readFileSync(file, 'utf8');

  if (ext === '.html') {
    const src = text();
    const html = src.replace(
      '<head>',
      `<head><script src="${GUARD}"></script><meta name="robots" content="noindex, nofollow, noarchive">`,
    );
    if (html === src) throw new Error(`no <head> in ${file}`);
    writeFileSync(file, await minify(html, {
      collapseWhitespace: true,
      removeComments: true,
      minifyCSS: true,
      minifyJS: true,
      removeRedundantAttributes: true,
      useShortDoctype: true,
    }));
  } else if (ext === '.js') {
    writeFileSync(file, obfuscate(text()));
  } else if (ext === '.css') {
    writeFileSync(file, (await transform(text(), { loader: 'css', minify: true })).code);
  }
}

console.log(`demo build ready in ${OUT}/`);

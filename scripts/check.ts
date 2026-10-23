// Pre-deploy check for the built site folder (out/, or dist/ for the demo).
// Fails on: local links/assets that don't exist, manifest icons that are missing or the
// wrong size, sw.js precache paths and sitemap URLs that don't exist. Warns on [BRACKET] placeholders left
// in pages (terms/privacy drafts).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? 'out');
const errors: string[] = [];
const warnings: string[] = [];

interface Manifest {
  name?: string;
  start_url?: string;
  display?: string;
  icons?: { src: string; sizes?: string }[];
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) return [];
    return entry.isDirectory() ? walk(path) : [path];
  });
const rel = (path: string) => relative(root, path) || '.';

// Same lookup Cloudflare Pages does: exact file, then .html, then folder index.
const exists = (urlPath: string, fromFile: string) => {
  const clean = decodeURIComponent(urlPath.split(/[?#]/)[0] ?? '');
  if (!clean) return true;
  const base = clean.startsWith('/') ? join(root, clean) : resolve(dirname(fromFile), clean);
  if (!base.startsWith(root)) return false;
  return [base, `${base}.html`, join(base, 'index.html')].some((p) => existsSync(p) && statSync(p).isFile());
};
const external = (url: string) => /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\{|\$)/i.test(url);

const files = walk(root);

for (const file of files.filter((f) => extname(f) === '.html')) {
  const html = readFileSync(file, 'utf8');
  for (const [, , url] of html.matchAll(/\s(href|src|poster|action)=["']([^"']+)["']/gi)) {
    if (!external(url) && !exists(url, file)) errors.push(`${rel(file)}: missing ${url}`);
  }
  for (const [, url] of html.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    if (!external(url) && !exists(url, file)) errors.push(`${rel(file)}: missing ${url} (css url)`);
  }
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)) {
    try {
      JSON.parse(json);
    } catch (err) {
      errors.push(`${rel(file)}: invalid JSON-LD (${message(err)})`);
    }
  }
  const brackets = [...new Set([...html.matchAll(/\[[A-Z][A-Z0-9 _/&.,'-]{2,}\]/g)].map((m) => m[0]))];
  if (brackets.length)
    warnings.push(
      `${rel(file)}: placeholders left ${brackets.slice(0, 8).join(' ')}${brackets.length > 8 ? ' …' : ''}`,
    );
}

const pngSize = (path: string) => {
  const buf = readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
};
for (const file of files.filter((f) => /\.(webmanifest|json)$/.test(f) && /manifest/.test(f))) {
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    errors.push(`${rel(file)}: invalid JSON (${message(err)})`);
    continue;
  }
  for (const key of ['name', 'start_url', 'display', 'icons'] as const) {
    if (!manifest[key]) errors.push(`${rel(file)}: missing "${key}"`);
  }
  const sizes = new Set<string>();
  for (const icon of manifest.icons ?? []) {
    if (!exists(icon.src, file)) {
      errors.push(`${rel(file)}: icon missing ${icon.src}`);
      continue;
    }
    const path = icon.src.startsWith('/') ? join(root, icon.src) : resolve(dirname(file), icon.src);
    const actual = extname(path) === '.png' ? pngSize(path) : null;
    if (actual && icon.sizes && !icon.sizes.split(' ').includes(actual)) {
      errors.push(`${rel(file)}: ${icon.src} is ${actual}, manifest says ${icon.sizes}`);
    }
    for (const s of (icon.sizes ?? '').split(' ')) sizes.add(s);
  }
  for (const need of ['192x192', '512x512']) {
    if (!sizes.has(need)) warnings.push(`${rel(file)}: no ${need} icon, Android install prompt needs it`);
  }
}

const sw = join(root, 'sw.js');
if (existsSync(sw)) {
  const code = readFileSync(sw, 'utf8');
  const paths = [...code.matchAll(/["'`](\/[^"'`\s$]*|\.\/[^"'`\s$]+)["'`]/g)].map((m) => m[1] ?? '');
  for (const path of new Set(paths)) {
    // Pages (/rules) and files (/icons/icon.svg); prefixes like /_next/static/ are skipped.
    if ((!path.endsWith('/') || path === '/') && !exists(path, sw)) errors.push(`sw.js: precache path missing ${path}`);
  }
} else {
  warnings.push('no sw.js at the root');
}

// Every sitemap URL must be a page in the build.
const sitemap = join(root, 'sitemap.xml');
if (existsSync(sitemap)) {
  for (const [, loc] of readFileSync(sitemap, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const path = new URL(loc).pathname;
    if (!exists(path === '/' ? '/index.html' : path, sitemap)) errors.push(`sitemap.xml: no page for ${loc}`);
  }
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`FAIL  ${e}`);
console.log(`${files.length} files checked in ${root}: ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);

// Finishes the Vercel preview build (npm run build:demo). With DEMO=1, app/layout.tsx adds noindex and
// loads /assets/rt.js on every page, and the text pages show sample values instead of [BRACKETS].
// This writes rt.js (scripts/guard.js, obfuscated, with a DevTools debugger trap) and moves the
// build to dist/, so it can't be mistaken for the live out/ folder. Nothing here belongs on the live site.
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import JavaScriptObfuscator from 'javascript-obfuscator';

const guard = JavaScriptObfuscator.obfuscate(readFileSync('scripts/guard.js', 'utf8'), {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 1,
  target: 'browser',
  debugProtection: true,
  debugProtectionInterval: 2000,
  disableConsoleOutput: true,
}).getObfuscatedCode();

mkdirSync('out/assets', { recursive: true });
writeFileSync('out/assets/rt.js', guard);
rmSync('dist', { recursive: true, force: true });
renameSync('out', 'dist');
console.log('demo build ready in dist/');

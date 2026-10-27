import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Static export has no image optimizer; photos in public/images are already resized WebP.
  { rules: { '@next/next/no-img-element': 'off' } },
  globalIgnores(['.next/**', 'out/**', 'dist/**', 'public/**', 'next-env.d.ts', 'lib/word-rush/words.ts']),
]);

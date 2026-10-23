import type { ReactNode } from 'react';

// Reading column for the text pages: rules, terms, privacy. Styles are the .doc block in app/globals.css.
export default function DocsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main id="main" className="doc">
      {children}
    </main>
  );
}

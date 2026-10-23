import Link from 'next/link';
import { DocFooter, DocNav } from './nav';
import '../docs.css';

// Shared frame for the text pages: rules, terms, privacy.
export default function DocsLayout({ children }) {
  return (
    <div className="wrap doc">
      <div className="bar">
        <Link className="logo" href="/">Meet<b>Do</b>Connect</Link>
        <DocNav />
      </div>
      <main id="main" className="prose">{children}</main>
      <DocFooter />
    </div>
  );
}

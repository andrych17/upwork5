import '../docs.css';

// Reading column for the text pages: rules, terms, privacy.
export default function DocsLayout({ children }) {
  return <main id="main" className="prose">{children}</main>;
}

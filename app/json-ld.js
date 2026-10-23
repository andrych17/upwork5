// Structured data for search and answer engines. "<" is escaped so the JSON can never close the script tag.
export default function JsonLd({ data }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', ...data }).replace(/</g, '\\u003c') }} />;
}

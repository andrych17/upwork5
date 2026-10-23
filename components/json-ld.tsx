import type { Graph, Thing, WithContext } from 'schema-dts';

// Structured data for search and answer engines. "<" is escaped so the JSON can never close the script tag.
export default function JsonLd({ data }: { data: WithContext<Thing> | Graph }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

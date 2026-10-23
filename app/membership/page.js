import JsonLd from '../json-ld';
import { JoinButton } from '../home-demos';
import { SITE_URL, pageMeta } from '../site';

export const metadata = pageMeta('/membership');

const FAQ = [
  ['Is this a sobriety program?', 'No. It is for anyone who wants a good evening without alcohol, whether they drink sometimes or never. It is not treatment or recovery support.'],
  ['Do I need to be creative or on camera?', 'No. Most sessions walk you through each step, and cameras are optional.'],
  ['What do I need to buy?', 'The prep card lists supplies, mostly kitchen and craft-drawer items, with an estimated cost.'],
  ['Can kids join?', 'Kitchen-Table Lab, Mocktail Studio and Cards and Collage Night are made for families. An adult books and stays in the room.'],
  ['Are sessions recorded?', 'No, so people can relax and take part.'],
];

export default function Membership() {
  return (
    <main id="main">
      <JsonLd data={{
        '@graph': [
          {
            '@type': 'FAQPage',
            mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
          },
          {
            '@type': 'Service',
            name: 'MeetDoConnect founding membership',
            provider: { '@id': `${SITE_URL}/#org` },
            description: '3 credits every week. One credit books any standard session.',
            offers: { '@type': 'Offer', price: '24', priceCurrency: 'USD', priceSpecification: { '@type': 'UnitPriceSpecification', price: '24', priceCurrency: 'USD', unitText: 'MONTH' } },
          },
        ],
      }} />
      <header className="page-head">
        <span className="eyebrow">Pricing</span>
        <h1>Membership</h1>
        <p className="lead answer">A founding membership is $24 per month and includes 3 credits every week. One credit books any standard session. Extra credits are $4 each, and a partner or family add-on is $8 a month.</p>
      </header>
      <section className="section">
        <div className="join">
          <div className="shell">
            <div className="core ink price-card">
              <span className="eyebrow">Founding member</span>
              <div className="price">$24<small> per month</small></div>
              <p>3 credits every week. One credit books any standard session.</p>
              <ul className="checks">
                <li>Extra credits: $4 each, or a 5-pack for $15</li>
                <li>Add a partner or family for $8 a month; your household uses one credit per session</li>
                <li>Cancel a booking up to 3 hours ahead and the credit returns</li>
              </ul>
              <JoinButton />
            </div>
          </div>
          <div className="faq-list">
            <h2>Questions</h2>
            {FAQ.map(([q, a]) => (
              <details key={q} className="faq">
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

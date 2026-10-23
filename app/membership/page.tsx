import type { Metadata } from 'next';
import { JoinButton } from '@/components/demos';
import JsonLd from '@/components/json-ld';
import { CheckList, Eyebrow, Lead, PageHead, Section, Shell } from '@/components/ui';
import { SITE_URL, metaFor } from '@/lib/site';

export const metadata: Metadata = metaFor('/membership');

const FAQ = [
  [
    'Is this a sobriety program?',
    'No. It is for anyone who wants a good evening without alcohol, whether they drink sometimes or never. It is not treatment or recovery support.',
  ],
  ['Do I need to be creative or on camera?', 'No. Most sessions walk you through each step, and cameras are optional.'],
  [
    'What if I need to cancel?',
    'Cancel 24 hours or more before the start and the credit comes back. Inside 24 hours the credit is used, unless you spend your Bad Hair Day pass.',
  ],
  [
    'What is a Bad Hair Day pass?',
    'Once a month, the pass lets you cancel inside the 24-hour window and keep your credit, or join a session with your camera off, no questions asked.',
  ],
  [
    'What do I need to buy?',
    'The prep card lists supplies, mostly kitchen and craft-drawer items, with an estimated cost.',
  ],
  [
    'Can kids join?',
    'Kitchen-Table Lab, Mocktail Studio and Cards and Collage Night are made for families. An adult books and stays in the room.',
  ],
  ['Are sessions recorded?', 'No, so people can relax and take part.'],
] as const;

const INCLUDED = [
  'Extra credits: $4 each, or a 5-pack for $15',
  'Add a partner or family for $8 a month; your household uses one credit per session',
  'Cancel 24 hours or more ahead and the credit returns',
  'One Bad Hair Day pass a month: cancel late and keep the credit, or join with your camera off',
];

export default function Membership() {
  return (
    <main id="main">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'FAQPage',
              mainEntity: FAQ.map(([q, a]) => ({
                '@type': 'Question',
                name: q,
                acceptedAnswer: { '@type': 'Answer', text: a },
              })),
            },
            {
              '@type': 'Service',
              name: 'MeetDoConnect founding membership',
              provider: { '@id': `${SITE_URL}/#org` },
              description: '3 credits every week. One credit books any standard session.',
              offers: {
                '@type': 'Offer',
                price: '24',
                priceCurrency: 'USD',
                priceSpecification: {
                  '@type': 'UnitPriceSpecification',
                  price: '24',
                  priceCurrency: 'USD',
                  unitText: 'MONTH',
                },
              },
            },
          ],
        }}
      />
      <PageHead eyebrow="Pricing" title="Membership">
        <Lead className="text-fg">
          A founding membership is $24 per month and includes 3 credits every week. One credit books any standard
          session. Extra credits are $4 each, a partner or family add-on is $8 a month, and every member gets one Bad
          Hair Day pass a month.
        </Lead>
      </PageHead>
      <Section>
        <div className="grid gap-6 lg:grid-cols-[5fr_7fr] lg:items-start lg:gap-x-14">
          <Shell ink coreClassName="gap-4.5">
            <Eyebrow>Founding member</Eyebrow>
            <div className="font-display text-[clamp(3.5rem,8vw,5.2rem)] leading-[0.9] font-bold tracking-[-0.045em]">
              $24<small className="font-sans text-base font-medium tracking-normal text-muted"> per month</small>
            </div>
            <p>3 credits every week. One credit books any standard session.</p>
            <CheckList items={INCLUDED} />
            <JoinButton />
          </Shell>
          <div>
            <h2 className="mb-2.5 text-[1.3rem]">Questions</h2>
            {FAQ.map(([q, a]) => (
              <details key={q} className="group border-t border-line">
                <summary className="relative list-none py-4 pr-9 font-bold after:absolute after:top-1/2 after:right-1.5 after:-translate-y-1/2 after:text-2xl after:leading-none after:font-normal after:text-accent after:transition-transform after:duration-200 after:content-['+'] group-open:after:rotate-45 [&::-webkit-details-marker]:hidden">
                  {q}
                </summary>
                <p className="max-w-prose pb-4.5 text-muted">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </Section>
    </main>
  );
}

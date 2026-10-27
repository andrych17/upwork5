import type { Metadata } from 'next';
import BookPage from '@/components/screens/book';
import { getSession, prepCards } from '@/lib/session-data';
import { memberMeta } from '@/lib/site';

export const dynamicParams = false;
export const generateStaticParams = () => prepCards.map(({ slug }) => ({ slug }));

export async function generateMetadata({ params }: PageProps<'/book/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  return memberMeta(`Book ${getSession(slug).title}`);
}

export default async function Page({ params }: PageProps<'/book/[slug]'>) {
  const { slug } = await params;
  return <BookPage slug={slug} />;
}

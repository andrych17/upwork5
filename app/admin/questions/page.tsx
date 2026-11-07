import type { Metadata } from 'next';
import AdminQuestions from '@/components/admin/questions';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Trivia questions | MeetDoConnect Admin');

export default function Page() {
  return <AdminQuestions />;
}

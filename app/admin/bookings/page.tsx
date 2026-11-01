import type { Metadata } from 'next';
import AdminBookings from '@/components/admin/bookings';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Bookings | MeetDoConnect Admin');

export default function Page() {
  return <AdminBookings />;
}

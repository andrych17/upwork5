import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import AdminShell from '@/components/admin/shell';
import { memberMeta } from '@/lib/site';

export const metadata: Metadata = memberMeta('Admin | MeetDoConnect');

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}

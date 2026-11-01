'use client';

import HelloVideoQueue from '@/components/admin/hello-video-queue';
import { useAdmin } from '@/components/admin/shell';

export default function AdminHelloVideos() {
  const { refreshCounts } = useAdmin();
  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Hello Videos</h1>
          <p>Approve new members, ask for a new video, or decline.</p>
        </div>
      </header>
      <section className="adm-card">
        <HelloVideoQueue onCount={refreshCounts} />
      </section>
    </>
  );
}

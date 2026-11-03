'use client';

// An admin changes their own password here. The same form members use, in the admin look.
import PasswordForm from '@/components/password-form';
import { useAdmin } from '@/components/admin/shell';

export default function AdminPassword() {
  const { me } = useAdmin();
  return (
    <>
      <header className="adm-head">
        <div>
          <h1>Password</h1>
          <p>Change the password for {me.email}. Other devices are signed out when you save.</p>
        </div>
      </header>
      <section className="adm-card">
        <div className="adm-card-body">
          <PasswordForm variant="admin" email={me.email} />
        </div>
      </section>
    </>
  );
}

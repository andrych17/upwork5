'use client';

// Connections (schema section 32): API keys for Daily, Resend, Twilio and R2, kept encrypted in Supabase Vault.
// Keys are write-only here: once saved, only their last 4 characters come back. A field with nothing saved uses the
// function secret of the same name, so nothing changes until a value is saved.
import { useCallback, useState } from 'react';
import { useAdmin } from '@/components/admin/shell';
import { ADMIN_TZ, adminRpc, useLoad } from '@/lib/admin';
import { SMS_ON } from '@/lib/site';

interface StoredKey {
  name: string;
  secret: boolean;
  set: boolean;
  shown: string | null;
  updated_at: string | null;
}

interface Field {
  name: string;
  label: string;
  placeholder?: string;
  hint?: string;
}

const GROUPS: { title: string; hint: string; fields: Field[] }[] = [
  {
    title: 'Daily (video rooms)',
    hint: 'Daily dashboard > Developers.',
    fields: [
      { name: 'DAILY_API_KEY', label: 'API key' },
      {
        name: 'DAILY_MONTHLY_MINUTES',
        label: 'Video minutes limit',
        placeholder: '8000',
        hint: 'Counted over the last 31 days, for everyone in every room. At the limit, nobody new gets into video until older minutes drop off. Daily’s free plan includes 10,000 a month. Empty means 8000; 0 turns the limit off.',
      },
    ],
  },
  {
    title: 'Resend (email)',
    hint: 'resend.com > API Keys. The sender address must be on a verified domain.',
    fields: [
      { name: 'RESEND_API_KEY', label: 'API key' },
      { name: 'RESEND_FROM', label: 'Send from', placeholder: 'MeetDoConnect <hello@meetdoconnect.com>' },
      { name: 'REPLY_TO', label: 'Replies go to', placeholder: 'hello@meetdoconnect.com' },
    ],
  },
  {
    title: 'Twilio (text messages)',
    hint: 'Twilio Console > Account info. Use a Messaging Service or a From number.',
    fields: [
      { name: 'TWILIO_ACCOUNT_SID', label: 'Account SID', placeholder: 'AC…' },
      { name: 'TWILIO_AUTH_TOKEN', label: 'Auth token' },
      { name: 'TWILIO_MESSAGING_SERVICE_SID', label: 'Messaging Service SID', placeholder: 'MG…' },
      { name: 'TWILIO_FROM', label: 'From number', placeholder: '+15551234567' },
    ],
  },
  {
    title: 'Cloudflare R2 (Hello Videos)',
    hint: 'Cloudflare > R2 > Manage API tokens. Give the token access to this bucket only.',
    fields: [
      { name: 'R2_ACCOUNT_ID', label: 'Account ID' },
      { name: 'R2_ACCESS_KEY_ID', label: 'Access key ID' },
      { name: 'R2_SECRET_ACCESS_KEY', label: 'Secret access key' },
      { name: 'R2_BUCKET', label: 'Bucket name' },
    ],
  },
];

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: ADMIN_TZ, month: 'short', day: 'numeric' });

function status(k: StoredKey | undefined): string {
  if (!k?.set) return 'Not saved here. The server’s own setting is used, if it has one.';
  const date = k.updated_at ? ` on ${when(k.updated_at)}` : '';
  if (!k.secret) return `Saved${date}: ${k.shown ?? ''}`;
  return k.shown ? `Saved${date}, ends in ${k.shown}` : `Saved${date}`;
}

export default function AdminConnections() {
  const { supabase } = useAdmin();
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const fetchKeys = useCallback(async () => {
    const res = await adminRpc(supabase, 'admin_service_keys', {});
    return res.ok ? (res.data.keys as StoredKey[]) : null;
  }, [supabase]);
  const { data: keys, loading, reload } = useLoad(fetchKeys);
  const byName = new Map((keys ?? []).map((k) => [k.name, k]));

  const save = async (field: Field, value: string) => {
    setBusy(field.name);
    const res = await adminRpc(supabase, 'admin_set_service_key', { p_name: field.name, p_value: value });
    setBusy('');
    if (!res.ok) {
      setMsg({ text: res.error, error: true });
      return;
    }
    setMsg({
      text: value
        ? `${field.label} saved. It is used from the next minute on.`
        : `${field.label} removed here. The server’s own setting applies again.`,
      error: false,
    });
    setTyped((t) => Object.fromEntries(Object.entries(t).filter(([name]) => name !== field.name)));
    reload();
  };

  return (
    <section className="adm-card" aria-labelledby="adm-connections">
      <div className="adm-card-head">
        <h2 id="adm-connections">Connections</h2>
      </div>
      <div className="adm-card-body adm-form">
        <p className="adm-sub">
          Keys for the services the site uses. They are stored encrypted, and after saving only the last 4 characters
          are shown. To change a key, paste the new one and save.
        </p>
        {msg && (
          <p className={msg.error ? 'adm-msg adm-msg-error' : 'adm-msg'} role="status">
            {msg.text}
          </p>
        )}
        {!keys ? (
          <p className={loading ? 'adm-empty' : 'adm-msg adm-msg-error'}>
            {loading ? 'Loading…' : 'Could not load connections. Refresh to try again.'}
          </p>
        ) : (
          GROUPS.filter((g) => SMS_ON || !g.title.startsWith('Twilio')).map((group) => (
            <fieldset key={group.title} className="adm-keys">
              <legend>{group.title}</legend>
              <small className="adm-sub">{group.hint}</small>
              <div className="adm-form-grid">
                {group.fields.map((field) => {
                  const stored = byName.get(field.name);
                  const value = typed[field.name] ?? '';
                  const id = `key-${field.name}`;
                  return (
                    <form
                      key={field.name}
                      className="adm-field"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (value.trim()) void save(field, value);
                      }}
                    >
                      <label htmlFor={id}>{field.label}</label>
                      <div className="adm-key-row">
                        <input
                          id={id}
                          className="adm-input"
                          type={stored?.secret ? 'password' : 'text'}
                          autoComplete={stored?.secret ? 'new-password' : 'off'}
                          spellCheck={false}
                          placeholder={stored?.set ? 'Type a new value to replace it' : (field.placeholder ?? '')}
                          value={value}
                          onChange={(e) => setTyped({ ...typed, [field.name]: e.target.value })}
                        />
                        <button
                          type="submit"
                          className="adm-btn adm-btn-primary adm-btn-sm"
                          disabled={busy !== '' || !value.trim()}
                        >
                          Save
                        </button>
                        {stored?.set && (
                          <button
                            type="button"
                            className="adm-btn adm-btn-sm"
                            disabled={busy !== ''}
                            onClick={() => {
                              if (window.confirm(`Remove the saved ${group.title.split(' (')[0]} ${field.label}?`))
                                void save(field, '');
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <small>{status(stored)}</small>
                      {field.hint && <small>{field.hint}</small>}
                    </form>
                  );
                })}
              </div>
            </fieldset>
          ))
        )}
      </div>
    </section>
  );
}

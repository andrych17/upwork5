'use client';

// Connections tab of Settings (schema section 32): API keys for Daily, Resend, Twilio and R2, kept encrypted in
// Supabase Vault. Keys are write-only here: once saved, only their last 4 characters come back. A field with nothing
// saved uses the function secret of the same name. This file only draws the fields; Settings owns the typed values
// and saves them with everything else from its one Save button.
import { ADMIN_TZ } from '@/lib/admin';
import { SMS_ON } from '@/lib/site';

export interface StoredKey {
  name: string;
  secret: boolean;
  set: boolean;
  shown: string | null;
  updated_at: string | null;
}

export interface KeyField {
  name: string;
  label: string;
  placeholder?: string;
  hint?: string;
}

const ALL_GROUPS: { title: string; hint: string; fields: KeyField[] }[] = [
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

export const KEY_GROUPS = ALL_GROUPS.filter((g) => SMS_ON || !g.title.startsWith('Twilio'));

/** "Daily API key", for save messages. */
export const keyLabel = (name: string): string => {
  for (const g of KEY_GROUPS) {
    const f = g.fields.find((x) => x.name === name);
    if (f) return `${g.title.split(' (')[0]} ${f.label}`;
  }
  return name;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: ADMIN_TZ, month: 'short', day: 'numeric' });

function status(k: StoredKey | undefined): string {
  if (!k?.set) return 'Not saved here. The server’s own setting is used, if it has one.';
  const date = k.updated_at ? ` on ${when(k.updated_at)}` : '';
  if (!k.secret) return `Saved${date}: ${k.shown ?? ''}`;
  return k.shown ? `Saved${date}, ends in ${k.shown}` : `Saved${date}`;
}

interface Props {
  keys: StoredKey[] | null | undefined;
  loading: boolean;
  typed: Record<string, string>;
  removing: string[];
  disabled: boolean;
  onType: (name: string, value: string) => void;
  onToggleRemove: (name: string) => void;
}

export default function ConnectionFields({ keys, loading, typed, removing, disabled, onType, onToggleRemove }: Props) {
  if (!keys) {
    return (
      <p className={loading ? 'adm-empty' : 'adm-msg adm-msg-error'}>
        {loading ? 'Loading…' : 'Could not load connections. Refresh to try again.'}
      </p>
    );
  }
  const byName = new Map(keys.map((k) => [k.name, k]));
  return (
    <>
      {KEY_GROUPS.map((group) => (
        <fieldset key={group.title} className="adm-keys">
          <legend>{group.title}</legend>
          <small className="adm-sub">{group.hint}</small>
          <div className="adm-form-grid">
            {group.fields.map((field) => {
              const stored = byName.get(field.name);
              const gone = removing.includes(field.name);
              const id = `key-${field.name}`;
              return (
                <div key={field.name} className="adm-field">
                  <label htmlFor={id}>{field.label}</label>
                  <div className="adm-key-row">
                    <input
                      id={id}
                      className="adm-input"
                      type={stored?.secret ? 'password' : 'text'}
                      autoComplete={stored?.secret ? 'new-password' : 'off'}
                      spellCheck={false}
                      disabled={disabled || gone}
                      placeholder={stored?.set ? 'Type a new value to replace it' : (field.placeholder ?? '')}
                      value={gone ? '' : (typed[field.name] ?? '')}
                      onChange={(e) => onType(field.name, e.target.value)}
                    />
                    {stored?.set && (
                      <button
                        type="button"
                        className={gone ? 'adm-btn adm-btn-sm' : 'adm-btn adm-btn-sm adm-btn-danger'}
                        disabled={disabled}
                        aria-pressed={gone}
                        onClick={() => onToggleRemove(field.name)}
                      >
                        {gone ? 'Keep' : 'Remove'}
                      </button>
                    )}
                  </div>
                  <small className={gone ? 'adm-will-remove' : undefined}>
                    {gone ? 'Will be removed when you save. The server’s own setting applies again.' : status(stored)}
                  </small>
                  {field.hint && <small>{field.hint}</small>}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </>
  );
}

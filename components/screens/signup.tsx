'use client';

// Sign-up in one sitting (Kelly 31 Oct): basics, rules and Terms (the account is created here), membership and
// payment, profile photo and Hello Video, interests, reminders. Every step after the account saves to Supabase,
// so "Save & leave" and coming back later resume at the first unfinished step. Google sign-up returns here too.
// Payments are in test mode (app_config.test_payments): Pay starts the membership without a card.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import GoogleButton from '@/components/google-button';
import HelloRecorder from '@/components/hello-recorder';
import PasswordInput from '@/components/password-input';
import { useAccount } from '@/lib/account';
import { isEmailRateLimit, useEmailWait } from '@/lib/email-wait';
import { money, usd, type Interval, type Tier } from '@/lib/prices';
import { usePlans } from '@/lib/use-plans';
import { savePushSubscription, VAPID_PUBLIC_KEY } from '@/lib/push';
import { resumeStep } from '@/lib/signup-step';
import { SMS_ON } from '@/lib/site';
import { getSupabase, setDemoUser, type MembershipSummary } from '@/lib/supabase';

const STEPS = 6;
const interests = [
  'Quiet co-work',
  'Writing',
  'Sketching',
  'Crafts',
  'Cooking',
  'Family sessions',
  'Music',
  'Trivia',
  'Idea sharing',
  'Wellness',
  'Tea & tasting',
  'Low-pressure conversation',
];
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX = 5 * 1024 * 1024;
// Same limits as profiles_screen_name_check in schema.sql.
const SCREEN_NAME_MIN = 2;
const SCREEN_NAME_MAX = 24;

type Result = { success: boolean; error?: string } | null;

async function loadSummary(): Promise<MembershipSummary | null> {
  const { data } = (await getSupabase()?.rpc('get_my_membership')) ?? { data: null };
  return data as MembershipSummary | null;
}

export default function SignupPage() {
  const { plans: PLANS } = usePlans();
  const router = useRouter();
  const supabase = getSupabase();
  const { ready, account } = useAccount();
  const [step, setStep] = useState(1);
  const [summary, setSummary] = useState<MembershipSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Step 1
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [screenName, setScreenName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ageOk, setAgeOk] = useState(false);
  // Step 2
  const [rulesOk, setRulesOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [code, setCode] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [notice, setNotice] = useState('');
  const codeWait = useEmailWait();
  // Step 3
  const [tier, setTier] = useState<Tier>('individual');
  const [plan, setPlan] = useState<Interval>('monthly');
  // Step 4
  const [photo, setPhoto] = useState<{ name: string; url: string | null }>({ name: '', url: null });
  const [helloSent, setHelloSent] = useState(false);
  // Step 5
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  // Step 6
  const [emailReminders, setEmailReminders] = useState(true);
  const [smsReminders, setSmsReminders] = useState(false);
  const [phone, setPhone] = useState('');
  const [appNote, setAppNote] = useState('');

  // Someone already signed in (Google, the email link, or coming back) continues where they stopped. Once the
  // person starts on this page (resumed set by the step actions), creating the account here doesn't jump steps.
  const resumed = useRef(false);
  useEffect(() => {
    if (!ready || resumed.current || !account || !supabase) return;
    resumed.current = true;
    loadSummary().then((s) => {
      setSummary(s);
      if (s?.interests?.length) setSelectedInterests(s.interests);
      if (s?.avatar_url) setPhoto({ name: 'Your photo', url: s.avatar_url });
      if (s?.reminders) {
        setEmailReminders(s.reminders.email);
        setSmsReminders(s.reminders.sms);
        setPhone(s.reminders.phone ?? '');
      }
      setStep(resumeStep(s));
    });
  }, [ready, account, supabase]);

  const go = (next: number) => {
    setErrorMsg('');
    setNotice('');
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const fail = (text: string) => {
    setErrorMsg(text);
    setBusy(false);
  };

  // ---------- step actions ----------

  const finishBasics = () => {
    resumed.current = true;
    if (account) return go(2);
    if (!firstName.trim()) return setErrorMsg('Add your first name.');
    const screen = screenName.trim().replace(/\s+/g, ' ');
    if (screen && (screen.length < SCREEN_NAME_MIN || screen.length > SCREEN_NAME_MAX))
      return setErrorMsg(`Screen names are ${SCREEN_NAME_MIN} to ${SCREEN_NAME_MAX} characters.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setErrorMsg('Check the email address.');
    if (password.length < 8) return setErrorMsg('Use a password with at least 8 characters.');
    if (!ageOk) return setErrorMsg('Please confirm the age line to continue.');
    go(2);
  };

  const acceptTerms = async () => {
    const { data, error } = await supabase!.rpc('accept_terms');
    if (error || !(data as Result)?.success) return fail('Could not save that. Please try again.');
    const s = await loadSummary();
    setSummary(s);
    setBusy(false);
    go(s?.role === 'member' || s?.payment_status !== 'pending' ? 4 : 3);
  };

  const finishRules = async () => {
    if (!rulesOk || !termsOk) return setErrorMsg('Please agree to the community rules and the Terms to continue.');
    if (!supabase) return go(3);
    setBusy(true);
    setErrorMsg('');
    if (account) return acceptTerms();

    if (awaitingCode) {
      const token = code.replace(/\D/g, '');
      if (token.length < 6) return fail('Enter the code from the email.');
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
      if (error) return fail('That code didn’t work. Check the newest email, or send a new code.');
      return acceptTerms();
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          screen_name: screenName.trim().replace(/\s+/g, ' ') || null,
        },
        emailRedirectTo: `${window.location.origin}/signup`,
      },
    });
    if (error) return fail(error.message);
    // Supabase answers an existing email with a user that has no identities, and sends nothing.
    if (data.user && data.user.identities?.length === 0)
      return fail('There is already an account with this email. Sign in instead.');
    if (!data.session) {
      setAwaitingCode(true);
      setBusy(false);
      setNotice(`We emailed a code to ${email.trim()}. Enter it below to confirm your email.`);
      codeWait.start();
      return;
    }
    return acceptTerms();
  };

  const resendCode = async () => {
    if (codeWait.left > 0) return;
    setErrorMsg('');
    const { error } = await supabase!.auth.resend({ type: 'signup', email: email.trim() });
    if (error && !isEmailRateLimit(error)) {
      setNotice('');
      setErrorMsg('We couldn’t send a new code right now. Please try again in a few minutes.');
      return;
    }
    setNotice(
      error
        ? `A code went to ${email.trim()} less than a minute ago. Please check that email first.`
        : `A new code is on its way to ${email.trim()}.`,
    );
    codeWait.start();
  };

  const pay = async () => {
    if (!supabase) return go(4);
    setBusy(true);
    setErrorMsg('');
    const { data, error } = await supabase.rpc('test_checkout', { p_tier: tier, p_interval: plan });
    const res = data as Result;
    if (error || !res?.success) return fail(res?.error || 'The payment didn’t go through. Please try again.');
    setSummary(await loadSummary());
    setBusy(false);
    go(4);
  };

  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg('');
    if (!PHOTO_TYPES.includes(file.type)) return setErrorMsg('Use a JPG, PNG or WebP photo.');
    if (file.size > PHOTO_MAX) return setErrorMsg('That photo is over 5 MB. Please pick a smaller one.');
    if (!supabase || !account) return setPhoto({ name: file.name, url: URL.createObjectURL(file) });
    setPhoto({ name: 'Uploading…', url: null });
    const path = `${account.id}/avatar`;
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
    if (error) {
      setPhoto({ name: '', url: null });
      return setErrorMsg('The photo didn’t upload. Please try again.');
    }
    const url = `${supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', account.id);
    setPhoto({ name: file.name, url });
  };

  const saveInterests = async () => {
    if (supabase) {
      setBusy(true);
      const { data, error } = await supabase.rpc('save_interests', { p_interests: selectedInterests });
      const res = data as Result;
      if (error || !res?.success) return fail(res?.error || 'Could not save your interests. Please try again.');
      setBusy(false);
    }
    go(6);
  };

  const turnOnApp = async () => {
    setAppNote('');
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setAppNote('This browser can’t show app notifications. Email reminders still work.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setAppNote('Notifications are blocked. You can turn them on later from the Reminders page.');
      return;
    }
    const failed = VAPID_PUBLIC_KEY ? await savePushSubscription() : null;
    setAppNote(failed ?? 'App notifications are on for this device.');
  };

  const finish = async () => {
    if (!supabase) {
      setDemoUser({
        id: 'demo',
        email: email || 'member@example.com',
        first_name: firstName || 'Member',
        last_name: lastName,
        plan: tier,
        billing_interval: plan,
        monthly_credits: PLANS[tier].credits,
        payment_status: 'active',
      });
      router.push('/calendar');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('set_reminder_prefs', {
      p_email: emailReminders,
      p_sms: smsReminders,
      p_phone: smsReminders ? phone.trim() || null : null,
    });
    const res = data as Result;
    if (error || !res?.success) return fail(res?.error || 'Could not save your reminders. Please try again.');
    router.push('/calendar');
  };

  // ---------- render ----------

  const isMember = summary?.role === 'member';
  const paid = summary && summary.payment_status !== 'pending';
  const helloDone = helloSent || summary?.hello_status === 'pending' || summary?.hello_status === 'approved';
  const price = PLANS[tier][plan];
  const saving = Math.round((PLANS[tier].monthly * 12 - PLANS[tier].annual) * 100) / 100;

  const primary: Record<number, { label: string; action: () => void; disabled?: boolean }> = {
    1: { label: 'Continue', action: finishBasics },
    2: {
      label: account || !supabase ? 'Continue' : awaitingCode ? 'Confirm email' : 'Create my account',
      action: () => void finishRules(),
    },
    3:
      isMember || paid
        ? { label: 'Continue', action: () => go(4) }
        : { label: `Pay ${money(price * 100)} and continue`, action: () => void pay() },
    4: { label: helloDone ? 'Continue' : 'Record first, then continue', action: () => go(5), disabled: !helloDone },
    5: { label: 'Continue', action: () => void saveInterests() },
    6: { label: 'Finish & see the Calendar', action: () => void finish() },
  };

  return (
    <main className="signup-page">
      <header className="signup-header">
        <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <div className="signup-progress" aria-label={`Step ${step} of ${STEPS}`}>
          {Array.from({ length: STEPS }, (_, i) => (
            <span className={i + 1 <= step ? 'complete' : ''} key={i} />
          ))}
        </div>
        <Link href="/">Save & leave</Link>
      </header>

      <div className="signup-shell">
        <aside className="signup-aside">
          <p className="section-label">Join MeetDoConnect</p>
          <h1>
            Good evenings
            <br />
            start here.
          </h1>
          <p>
            A few thoughtful steps keep rooms welcoming, human, and free from bots. Most people finish in about five
            minutes.
          </p>
          <div className="signup-trust">
            <span>Private by design</span>
            <span>Cancel membership anytime</span>
            <span>Hello Videos are admin-only</span>
          </div>
        </aside>

        <section className="signup-card">
          {errorMsg && (
            <div className="signup-alert error" role="alert">
              {errorMsg}
            </div>
          )}
          {notice && (
            <div className="signup-alert" role="status">
              {notice}
            </div>
          )}

          {step === 1 && (
            <div className="signup-step">
              <p className="step-count">Step 1 of {STEPS}</p>
              <h2>First, the basics.</h2>
              {account ? (
                <p className="step-intro">
                  You’re signed in as <strong>{account.email}</strong>. Continue to finish joining.
                </p>
              ) : (
                <>
                  <p className="step-intro">
                    Use an email you check. This is where session reminders and important account messages will go.
                  </p>
                  <p className="step-intro">
                    Joining as a Household? Everyone signs up with their own email and password. The account holder
                    picks Household ({usd(PLANS.household.monthly)} a month or {usd(PLANS.household.annual)} a year) in
                    step 3 and invites up to 3 people, who share 16 sessions a month. Invited by someone? Sign up with
                    the email they invited.
                  </p>
                  <GoogleButton next="/signup" label="Sign up with Google" onError={setErrorMsg} />
                  <div className="form-grid">
                    <label>
                      <span>First name</span>
                      <input
                        type="text"
                        autoComplete="given-name"
                        placeholder="Your first name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                      />
                    </label>
                    <label>
                      <span>Last name</span>
                      <input
                        type="text"
                        autoComplete="family-name"
                        placeholder="Your last name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                      />
                    </label>
                    <label className="full-field">
                      <span>Screen name (optional)</span>
                      <input
                        type="text"
                        autoComplete="nickname"
                        placeholder="What others see, e.g. Kel or KC"
                        maxLength={SCREEN_NAME_MAX}
                        value={screenName}
                        onChange={(e) => setScreenName(e.target.value)}
                      />
                      <small className="field-hint">
                        Shown to other members in rooms, games and Buddy Rooms. Leave it blank to use your first name.
                      </small>
                    </label>
                    <label className="full-field">
                      <span>Email</span>
                      <input
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                    <label className="full-field">
                      <span>Create a password</span>
                      <PasswordInput
                        autoComplete="new-password"
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="check-row">
                    <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} />
                    <span>
                      I am at least 12 years old. Children under 12 will attend only with a responsible adult.
                    </span>
                  </label>
                  <div className="signup-switch">
                    <span>Already have an account? </span>
                    <Link href="/signin">Sign in</Link>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="signup-step">
              <p className="step-count">Step 2 of {STEPS}</p>
              <h2>Short rules. Real safety.</h2>
              <p className="step-intro">These are the basics that let small rooms feel relaxed.</p>
              <div className="short-rules">
                <div>
                  <strong>01</strong>
                  <p>Be kind. No harassment, hate, sexual content, or pressure to connect afterward.</p>
                </div>
                <div>
                  <strong>02</strong>
                  <p>Protect privacy. Never record, photograph, or share another member or room.</p>
                </div>
                <div>
                  <strong>03</strong>
                  <p>Show up as yourself. Cameras are on unless you use a Bad Hair Day card.</p>
                </div>
                <div>
                  <strong>04</strong>
                  <p>Use Mute, Report, or Leave whenever you need them. Reports stay private.</p>
                </div>
              </div>
              <label className="check-row">
                <input type="checkbox" checked={rulesOk} onChange={(e) => setRulesOk(e.target.checked)} />
                <span>I agree to the short community rules.</span>
              </label>
              <label className="check-row">
                <input type="checkbox" checked={termsOk} onChange={(e) => setTermsOk(e.target.checked)} />
                <span>
                  I agree to the{' '}
                  <Link href="/terms" target="_blank" rel="noopener noreferrer">
                    Terms & Conditions
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" target="_blank" rel="noopener noreferrer">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              {awaitingCode && (
                <div className="form-grid">
                  <label className="full-field">
                    <span>Code from the email</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="12345678"
                      maxLength={10}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </label>
                  <p className="signup-switch full-field">
                    No email after a minute? Check spam, or{' '}
                    <button
                      type="button"
                      className="link-button"
                      disabled={codeWait.left > 0}
                      onClick={() => void resendCode()}
                    >
                      {codeWait.left > 0 ? `send a new code in ${codeWait.left}s` : 'send a new code'}
                    </button>
                    .
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="signup-step">
              <p className="step-count">Step 3 of {STEPS}</p>
              <h2>Choose your membership.</h2>
              {isMember ? (
                <p className="step-intro">
                  You’re part of {summary?.household?.owner_name || 'your account holder'}’s Household. They pay for the
                  plan, so there’s nothing to pay here.
                </p>
              ) : paid ? (
                <p className="step-intro">Your membership is active. Nothing to pay here.</p>
              ) : (
                <>
                  <p className="step-intro">
                    Solo gets 13 sessions a month. Household is for up to 4 people, each with their own sign-in, sharing
                    16 sessions a month, 4 each week, shared between household members. Solo can book up to 4 a week.
                    Your month starts today, and unused sessions don’t carry over.
                  </p>
                  <div className="signup-tiers" role="radiogroup" aria-label="Membership">
                    {(Object.keys(PLANS) as Tier[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="radio"
                        aria-checked={tier === key}
                        className={tier === key ? 'selected' : ''}
                        onClick={() => setTier(key)}
                      >
                        <strong>{PLANS[key].name}</strong>
                        <small>
                          {usd(PLANS[key].monthly)}/mo · {usd(PLANS[key].annual)}/yr
                        </small>
                        <small>
                          {PLANS[key].people} · {PLANS[key].credits} sessions/mo
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="signup-plans">
                    <button
                      className={plan === 'monthly' ? 'selected' : ''}
                      type="button"
                      onClick={() => setPlan('monthly')}
                    >
                      <span>Monthly</span>
                      <strong>{usd(PLANS[tier].monthly)}</strong>
                      <small>per month · cancel anytime</small>
                    </button>
                    <button
                      className={plan === 'annual' ? 'selected' : ''}
                      type="button"
                      onClick={() => setPlan('annual')}
                    >
                      <span>Annual</span>
                      <strong>{usd(PLANS[tier].annual)}</strong>
                      <small>
                        per year
                        {saving > 0 ? ` · save ${usd(saving)}` : ''}
                      </small>
                    </button>
                  </div>
                  <div className="payment-mock">
                    <div className="developer-note">
                      {summary && !summary.test_payments
                        ? 'Online payments open soon'
                        : 'Test mode · no card is charged'}
                    </div>
                    <p className="step-intro">
                      Card payments are being connected. For now, pressing Pay starts your membership right away and
                      nothing is charged. You’ll see a receipt on your Membership page.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="signup-step">
              <p className="step-count">Step 4 of {STEPS}</p>
              <h2>Put a face to the name.</h2>
              <p className="step-intro">
                Your profile photo appears in rooms when you use a Bad Hair Day card. Your Hello Video is seen only by
                an admin to help keep bots out. Rooms open for you once it’s approved, usually within a day. You can
                book sessions in the meantime.
              </p>
              <div className="upload-grid">
                <label className="upload-box">
                  <input
                    type="file"
                    accept={PHOTO_TYPES.join(',')}
                    onChange={(e) => void uploadPhoto(e.target.files?.[0])}
                  />
                  {photo.url ? (
                    <img className="upload-photo" src={photo.url} alt="Your profile photo" />
                  ) : (
                    <span className="upload-mark">+</span>
                  )}
                  <strong>Profile photo</strong>
                  <small>{photo.name || 'Clear face photo · JPG or PNG'}</small>
                </label>
                <div className="upload-box hello-box">
                  {helloDone ? (
                    <>
                      <span className="upload-mark">✓</span>
                      <strong>Hello Video sent</strong>
                      <small>We’ll let you know once it’s approved.</small>
                    </>
                  ) : (
                    <HelloRecorder title="Private Hello Video" onSent={() => setHelloSent(true)} />
                  )}
                </div>
              </div>
              <div className="hello-prompt">
                <strong>Not sure what to say?</strong>
                <p>“Hi, I’m [first name]. I’m looking forward to [an activity you enjoy].” That’s enough.</p>
              </div>
              {!helloDone && (
                <button type="button" className="link-button" onClick={() => go(5)}>
                  I’ll record it later (rooms stay closed until it’s approved)
                </button>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="signup-step">
              <p className="step-count">Step 5 of {STEPS}</p>
              <h2>What sounds good?</h2>
              <p className="step-intro">
                Choose a few interests. We’ll use these to make the Calendar more useful, never to rank or publicly
                profile you.
              </p>
              <div className="interest-grid">
                {interests.map((interest) => {
                  const on = selectedInterests.includes(interest);
                  return (
                    <button
                      className={on ? 'selected' : ''}
                      type="button"
                      aria-pressed={on}
                      key={interest}
                      onClick={() =>
                        setSelectedInterests((current) =>
                          on ? current.filter((item) => item !== interest) : [...current, interest],
                        )
                      }
                    >
                      {interest}
                      <span>{on ? '✓' : '+'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="signup-step">
              <p className="step-count">Step 6 of {STEPS}</p>
              <h2>Stay in the loop, quietly.</h2>
              <p className="step-intro">
                Choose how reminders reach you. Payment and safety messages cannot be switched off.
              </p>
              <div className="notification-list">
                <div>
                  <span>
                    <strong>Email reminders</strong>24 hours and 1 hour before each session
                  </span>
                  <label>
                    <input
                      type="checkbox"
                      aria-label="Email reminders"
                      checked={emailReminders}
                      onChange={(e) => setEmailReminders(e.target.checked)}
                    />
                    <i />
                  </label>
                </div>
                {SMS_ON && (
                  <div>
                    <span>
                      <strong>Text reminders</strong>1 hour before each session
                    </span>
                    <label>
                      <input
                        type="checkbox"
                        aria-label="Text reminders"
                        checked={smsReminders}
                        onChange={(e) => setSmsReminders(e.target.checked)}
                      />
                      <i />
                    </label>
                  </div>
                )}
                <div>
                  <span>
                    <strong>App notifications</strong>On this phone or computer
                  </span>
                  <button type="button" className="link-button" onClick={() => void turnOnApp()}>
                    Turn on
                  </button>
                </div>
              </div>
              {appNote && <p className="step-intro">{appNote}</p>}
              {SMS_ON && smsReminders && (
                <label className="reminder-phone">
                  Mobile number with country code
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+1 555 123 4567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                  <small>
                    By turning on text reminders you agree to get session reminders from MeetDoConnect by SMS, one for
                    each session you book. Message and data rates may apply. Reply STOP to cancel, HELP for help.
                  </small>
                </label>
              )}
              <div className="required-notice">
                <strong>Always delivered:</strong> payment trouble, account security, and safety messages.
              </div>
            </div>
          )}

          <footer className="signup-actions">
            <button
              type="button"
              onClick={() => go(Math.max(1, step - 1))}
              disabled={step === 1 || busy || (step === 3 && Boolean(account))}
            >
              Back
            </button>
            <button
              className="signup-next"
              type="button"
              onClick={primary[step].action}
              disabled={busy || primary[step].disabled}
            >
              {busy ? 'One moment…' : primary[step].label} <span aria-hidden="true">→</span>
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}

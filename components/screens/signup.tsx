'use client';

import Link from 'next/link';
import { useState } from 'react';

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

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [plan, setPlan] = useState<'monthly' | 'annual'>('monthly');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [profileFile, setProfileFile] = useState('');
  const [videoFile, setVideoFile] = useState('');

  const toggleInterest = (interest: string) => {
    setSelectedInterests((current) =>
      current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest],
    );
  };

  const next = () => setStep((current) => Math.min(6, current + 1));
  const back = () => setStep((current) => Math.max(1, current - 1));

  return (
    <main className="signup-page">
      <header className="signup-header">
        <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <div className="signup-progress" aria-label={`Step ${step} of 6`}>
          {[1, 2, 3, 4, 5, 6].map((number) => (
            <span className={number <= step ? 'complete' : ''} key={number} />
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
          {step === 1 && (
            <div className="signup-step">
              <p className="step-count">Step 1 of 6</p>
              <h2>First, the basics.</h2>
              <p className="step-intro">
                Use an email you check. This is where session reminders and important account messages will go.
              </p>
              <div className="form-grid">
                <label>
                  <span>First name</span>
                  <input type="text" placeholder="Your first name" />
                </label>
                <label>
                  <span>Last name</span>
                  <input type="text" placeholder="Your last name" />
                </label>
                <label className="full-field">
                  <span>Email</span>
                  <input type="email" placeholder="you@example.com" />
                </label>
                <label className="full-field">
                  <span>Create a password</span>
                  <input type="password" placeholder="At least 8 characters" />
                </label>
              </div>
              <label className="check-row">
                <input type="checkbox" />
                <span>I am at least 12 years old. Children under 12 will attend only with a responsible adult.</span>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="signup-step">
              <p className="step-count">Step 2 of 6</p>
              <h2>Choose your membership.</h2>
              <p className="step-intro">
                Both plans include three sessions each week and three Bad Hair Day cards each month.
              </p>
              <div className="signup-plans">
                <button
                  className={plan === 'monthly' ? 'selected' : ''}
                  type="button"
                  onClick={() => setPlan('monthly')}
                >
                  <span>Monthly</span>
                  <strong>$24</strong>
                  <small>per month · cancel anytime</small>
                </button>
                <button className={plan === 'annual' ? 'selected' : ''} type="button" onClick={() => setPlan('annual')}>
                  <span>Annual</span>
                  <strong>$240</strong>
                  <small>per year · two months included</small>
                </button>
              </div>
              <div className="payment-mock">
                <div className="developer-note">Payment form placeholder · developer connects Stripe</div>
                <label>
                  <span>Card number</span>
                  <input type="text" placeholder="1234 1234 1234 1234" />
                </label>
                <div>
                  <label>
                    <span>Expiry</span>
                    <input type="text" placeholder="MM / YY" />
                  </label>
                  <label>
                    <span>CVC</span>
                    <input type="text" placeholder="CVC" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="signup-step">
              <p className="step-count">Step 3 of 6</p>
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
                <input type="checkbox" />
                <span>I agree to the short community rules.</span>
              </label>
              <label className="check-row">
                <input type="checkbox" />
                <span>
                  I agree to the{' '}
                  <Link href="/terms" target="_blank" rel="noreferrer">
                    Terms & Conditions
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" target="_blank" rel="noreferrer">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="signup-step">
              <p className="step-count">Step 4 of 6</p>
              <h2>Put a face to the name.</h2>
              <p className="step-intro">
                Your profile photo appears in rooms when you use a Bad Hair Day card. Your Hello Video is seen only by
                an admin to help keep bots out.
              </p>
              <div className="upload-grid">
                <label className="upload-box">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setProfileFile(event.target.files?.[0]?.name ?? '')}
                  />
                  <span className="upload-mark">+</span>
                  <strong>Profile photo</strong>
                  <small>{profileFile || 'Clear face photo · JPG or PNG'}</small>
                </label>
                <label className="upload-box">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(event) => setVideoFile(event.target.files?.[0]?.name ?? '')}
                  />
                  <span className="upload-mark">▶</span>
                  <strong>Private Hello Video</strong>
                  <small>{videoFile || 'About 10–20 seconds · seen only by admin'}</small>
                </label>
              </div>
              <div className="hello-prompt">
                <strong>Not sure what to say?</strong>
                <p>“Hi, I’m [first name]. I’m looking forward to [an activity you enjoy].” That’s enough.</p>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="signup-step">
              <p className="step-count">Step 5 of 6</p>
              <h2>What sounds good?</h2>
              <p className="step-intro">
                Choose a few interests. We’ll use these to make the Calendar more useful, never to rank or publicly
                profile you.
              </p>
              <div className="interest-grid">
                {interests.map((interest) => (
                  <button
                    className={selectedInterests.includes(interest) ? 'selected' : ''}
                    type="button"
                    aria-pressed={selectedInterests.includes(interest)}
                    key={interest}
                    onClick={() => toggleInterest(interest)}
                  >
                    {interest}
                    <span>{selectedInterests.includes(interest) ? '✓' : '+'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="signup-step">
              <p className="step-count">Step 6 of 6</p>
              <h2>Stay in the loop, quietly.</h2>
              <p className="step-intro">
                Choose how reminders reach you. Payment and safety messages cannot be switched off.
              </p>
              <div className="notification-list">
                <div>
                  <span>
                    <strong>Booking confirmations</strong>Email and app
                  </span>
                  <label>
                    <input type="checkbox" defaultChecked />
                    <i />
                  </label>
                </div>
                <div>
                  <span>
                    <strong>24-hour prep reminder</strong>Email, text, and app
                  </span>
                  <label>
                    <input type="checkbox" defaultChecked />
                    <i />
                  </label>
                </div>
                <div>
                  <span>
                    <strong>One-hour Join reminder</strong>Text and app
                  </span>
                  <label>
                    <input type="checkbox" defaultChecked />
                    <i />
                  </label>
                </div>
                <div>
                  <span>
                    <strong>New week is ready</strong>Email and app
                  </span>
                  <label>
                    <input type="checkbox" defaultChecked />
                    <i />
                  </label>
                </div>
                <div>
                  <span>
                    <strong>Activity-buddy updates</strong>App and email
                  </span>
                  <label>
                    <input type="checkbox" defaultChecked />
                    <i />
                  </label>
                </div>
              </div>
              <div className="quiet-hours">
                <label>
                  <span>Quiet hours start</span>
                  <input type="time" defaultValue="21:00" />
                </label>
                <label>
                  <span>Quiet hours end</span>
                  <input type="time" defaultValue="08:00" />
                </label>
              </div>
              <div className="required-notice">
                <strong>Always delivered:</strong> payment trouble, account security, and safety messages.
              </div>
            </div>
          )}

          <footer className="signup-actions">
            <button type="button" onClick={back} disabled={step === 1}>
              Back
            </button>
            {step < 6 ? (
              <button className="signup-next" type="button" onClick={next}>
                Continue <span aria-hidden="true">→</span>
              </button>
            ) : (
              <Link className="signup-next" href="/calendar">
                Finish & see the Calendar <span aria-hidden="true">→</span>
              </Link>
            )}
          </footer>
        </section>
      </div>
    </main>
  );
}

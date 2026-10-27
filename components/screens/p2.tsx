'use client';

import Link from 'next/link';
import { useState } from 'react';

type Section = 'report' | 'notifications' | 'profile' | 'buddies' | 'admin';

const sections: { id: Section; label: string }[] = [
  { id: 'report', label: 'Report flow' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'profile', label: 'Account & profile' },
  { id: 'buddies', label: 'Buddy Rooms' },
  { id: 'admin', label: 'Admin' },
];

export default function P2Workspace() {
  const [section, setSection] = useState<Section>('report');
  const [reportReason, setReportReason] = useState('');
  const [reportSent, setReportSent] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);

  return (
    <main className="p2-page">
      <header className="schedule-nav">
        <Link className="schedule-mark" href="/">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <span className="p2-header-label">P2 design workspace</span>
        <Link className="schedule-signin" href="/states">
          Back to P1 states
        </Link>
      </header>

      <section className="p2-hero">
        <p className="section-label">Design Brief · P2</p>
        <h1>
          Safety, settings,
          <br />
          <span>and stewardship.</span>
        </h1>
        <p>Connected prototypes for the secondary member and admin experiences.</p>
      </section>

      <nav className="p2-tabs" aria-label="P2 screens">
        {sections.map((item) => (
          <button
            className={section === item.id ? 'selected' : ''}
            type="button"
            key={item.id}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section className="p2-content" aria-live="polite">
        {section === 'report' && (
          <div className="p2-screen">
            <div className="p2-screen-heading">
              <div>
                <p className="section-label">Two-tap safety</p>
                <h2>Report privately.</h2>
              </div>
              <p>
                Reports are never shown to the person being reported. Two reports in a short period remove them from the
                room and trigger admin review.
              </p>
            </div>
            {!reportSent ? (
              <div className="report-card">
                <div className="report-person">
                  <img src="/images/guy-chair.webp" alt="" />
                  <div>
                    <strong>Report Jon?</strong>
                    <span>Quiet Co-Work · Today at 10:00 am</span>
                  </div>
                </div>
                <fieldset>
                  <legend>What happened?</legend>
                  {['Rude or disruptive', 'Inappropriate content', 'Made me uncomfortable', 'Something else'].map(
                    (reason) => (
                      <label key={reason}>
                        <input
                          type="radio"
                          name="reason"
                          checked={reportReason === reason}
                          onChange={() => setReportReason(reason)}
                        />
                        <span>{reason}</span>
                      </label>
                    ),
                  )}
                </fieldset>
                <label className="report-note">
                  <span>Optional private note</span>
                  <textarea placeholder="Share only what feels useful…" />
                </label>
                <div className="report-actions">
                  <button type="button">Cancel</button>
                  <button disabled={!reportReason} type="button" onClick={() => setReportSent(true)}>
                    Send private report
                  </button>
                </div>
              </div>
            ) : (
              <div className="report-success" role="status">
                <span>✓</span>
                <h3>Report received privately.</h3>
                <p>
                  You did the right thing. You can leave, mute Jon, or stay in the room. An admin will review this
                  report.
                </p>
                <button type="button" onClick={() => setReportSent(false)}>
                  Done
                </button>
              </div>
            )}
          </div>
        )}

        {section === 'notifications' && (
          <div className="p2-screen">
            <div className="p2-screen-heading">
              <div>
                <p className="section-label">Notification settings</p>
                <h2>Helpful, not noisy.</h2>
              </div>
              <p>Choose channels by message type. Payment, account security, and safety notices always remain on.</p>
            </div>
            <div className="notification-matrix">
              <div className="matrix-head">
                <span>Message</span>
                <span>Email</span>
                <span>Text</span>
                <span>App</span>
              </div>
              {[
                ['Booking confirmation', true, false, true],
                ['48-hour prep reminder', true, false, false],
                ['24-hour prep + free-cancel reminder', true, true, true],
                ['One-hour Join link', false, true, true],
                ['New week ready', true, false, true],
                ['Activity-buddy picks', true, false, true],
              ].map(([label, email, text, app]) => (
                <div className="matrix-row" key={String(label)}>
                  <strong>{label}</strong>
                  {[email, text, app].map((checked, i) => (
                    <label key={i}>
                      <input type="checkbox" defaultChecked={Boolean(checked)} />
                      <span />
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="notification-bottom">
              <div className="quiet-setting">
                <strong>Quiet hours</strong>
                <label>
                  From <input type="time" defaultValue="21:00" />
                </label>
                <label>
                  Until <input type="time" defaultValue="08:00" />
                </label>
              </div>
              <div className="required-messages">
                <strong>Always delivered</strong>
                <p>Payment trouble, account security, and safety messages cannot be switched off.</p>
              </div>
            </div>
            <button className="save-p2" type="button">
              Save notification settings
            </button>
          </div>
        )}

        {section === 'profile' && (
          <div className="p2-screen">
            <div className="p2-screen-heading">
              <div>
                <p className="section-label">Account & profile</p>
                <h2>Enough to feel human.</h2>
              </div>
              <p>Profiles are not publicly browsable. First names and faces appear only inside shared rooms.</p>
            </div>
            <div className="profile-layout">
              <aside className="profile-photo-card">
                <img src="/images/purpose-solo.webp" alt="Current profile" />
                <button type="button">Replace photo</button>
                <p>Required for your Bad Hair Day tile.</p>
              </aside>
              <div className="profile-form">
                <div className="form-grid">
                  <label>
                    <span>First name</span>
                    <input defaultValue="KC" />
                  </label>
                  <label>
                    <span>Last name</span>
                    <input defaultValue="Christian" />
                  </label>
                  <label className="full-field">
                    <span>Short introduction</span>
                    <textarea defaultValue="Usually working on a creative project, reading, or trying a new recipe." />
                  </label>
                  <label className="full-field">
                    <span>Email</span>
                    <input type="email" defaultValue="kc@example.com" />
                  </label>
                </div>
                <div className="hello-review">
                  <span>Private Hello Video</span>
                  <strong>Approved</strong>
                  <p>Seen only by an administrator. Replace it only if requested.</p>
                  <button type="button">Record a new video</button>
                </div>
                <div className="privacy-controls">
                  <label>
                    <input type="checkbox" defaultChecked />
                    <span>Show my first name and profile photo inside rooms I join.</span>
                  </label>
                  <label>
                    <input type="checkbox" defaultChecked />
                    <span>Allow private activity-buddy picks after sessions.</span>
                  </label>
                </div>
                <button className="save-p2" type="button">
                  Save account
                </button>
              </div>
            </div>
          </div>
        )}

        {section === 'buddies' && (
          <div className="p2-screen">
            <div className="p2-screen-heading">
              <div>
                <p className="section-label">Buddy Rooms</p>
                <h2>Mutual, private, optional.</h2>
              </div>
              <p>Only mutual choices appear. Members can block or close a room at any time without giving a reason.</p>
            </div>
            <div className="buddy-management">
              {[
                ['Maya', '/images/community-painting.webp', 'Quiet Co-Work', 'Want to try Write Together next week?'],
                ['Nina', '/images/girl-glasses-guitar.webp', 'Share a Song', 'That playlist was so good.'],
                ['Alex', '/images/purpose-solo.webp', 'Idea Lab', 'I found another session Thursday.'],
              ]
                .filter(([name]) => !blocked.includes(name))
                .map(([name, image, sessionName, message]) => (
                  <article key={name}>
                    <img src={image} alt="" />
                    <div>
                      <span>Met in {sessionName}</span>
                      <strong>{name}</strong>
                      <p>{message}</p>
                    </div>
                    <div>
                      <button type="button">Open chat</button>
                      <button type="button" onClick={() => setBlocked((current) => [...current, name])}>
                        Block or close
                      </button>
                    </div>
                  </article>
                ))}
              {blocked.length > 0 && (
                <div className="closed-room-note" role="status">
                  Room closed privately. No explanation was shared.
                </div>
              )}
            </div>
          </div>
        )}

        {section === 'admin' && (
          <div className="p2-screen">
            <div className="p2-screen-heading">
              <div>
                <p className="section-label">Admin</p>
                <h2>Keep the community healthy.</h2>
              </div>
              <p>Admin-only controls for sessions, payments, reports, Hello Videos, and member removal.</p>
            </div>
            <div className="admin-metrics">
              <article>
                <span>Tonight</span>
                <strong>7</strong>
                <p>sessions</p>
              </article>
              <article>
                <span>Needs review</span>
                <strong>3</strong>
                <p>Hello Videos</p>
              </article>
              <article>
                <span>Open reports</span>
                <strong>2</strong>
                <p>private</p>
              </article>
              <article>
                <span>Payment trouble</span>
                <strong>4</strong>
                <p>members</p>
              </article>
            </div>
            <div className="admin-grid">
              <div className="admin-panel">
                <div className="admin-panel-head">
                  <strong>Reports to review</strong>
                  <button type="button">View all</button>
                </div>
                <div className="admin-row">
                  <span className="admin-priority">2 reports</span>
                  <div>
                    <strong>Same member · Quiet Co-Work</strong>
                    <p>Automatically removed pending review.</p>
                  </div>
                  <button type="button">Review</button>
                </div>
                <div className="admin-row">
                  <span>1 report</span>
                  <div>
                    <strong>Share a Song</strong>
                    <p>Made another member uncomfortable.</p>
                  </div>
                  <button type="button">Review</button>
                </div>
              </div>
              <div className="admin-panel">
                <div className="admin-panel-head">
                  <strong>Hello Videos</strong>
                  <button type="button">View queue</button>
                </div>
                <div className="admin-row">
                  <span>New</span>
                  <div>
                    <strong>Robin T.</strong>
                    <p>Submitted 12 minutes ago.</p>
                  </div>
                  <button type="button">Review</button>
                </div>
                <div className="admin-row">
                  <span>New</span>
                  <div>
                    <strong>Sam P.</strong>
                    <p>Submitted yesterday.</p>
                  </div>
                  <button type="button">Review</button>
                </div>
              </div>
            </div>
            <div className="admin-actions">
              <button type="button">Add a session</button>
              <button type="button">View paid members</button>
              <button type="button">Payment issues</button>
              <button type="button">Removed members</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

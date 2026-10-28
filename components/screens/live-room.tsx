'use client';

import Link from 'next/link';
import { useState } from 'react';

const people = [
  { name: 'Maya', image: '/images/community-painting.webp', role: 'Starter' },
  { name: 'Jon', image: '/images/guy-chair.webp', role: 'Timekeeper' },
  { name: 'Nina', image: '/images/girl-glasses-guitar.webp', role: '' },
  { name: 'Alex', image: '/images/purpose-solo.webp', role: 'Closer' },
  { name: 'Sam', image: '/images/guitar-duo.webp', role: '' },
  { name: 'Priya', image: '/images/purpose-together.webp', role: '' },
  { name: 'Luis', image: '/images/guy-library.webp', role: '' },
  { name: 'Tess', image: '/images/gma-granddaughter-cooking.webp', role: '' },
  { name: 'Drew', image: '/images/dad-child-drawing.webp', role: '' },
  { name: 'Casey', image: '/images/couple-cooking.webp', role: '' },
  { name: 'Robin', image: '/images/dad-child-baking.webp', role: '' },
];

const reportReasons = ['Made me uncomfortable', 'Rude or disrespectful', 'Inappropriate on camera', 'Something else'];

type SafetyStep = 'menu' | 'mute' | 'report' | 'sent';

export default function LiveRoomPage() {
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [captions, setCaptions] = useState(false);
  const [safety, setSafety] = useState<SafetyStep | null>(null);
  // Sample only: in Milestone 4 mute turns off that person's audio for you, and reports go to the admin page.
  const [mutedPeople, setMutedPeople] = useState<string[]>([]);
  const [reportWho, setReportWho] = useState('');
  const [reportWhy, setReportWhy] = useState('');
  const [reportNote, setReportNote] = useState('');

  const closeSafety = () => {
    setSafety(null);
    setReportWho('');
    setReportWhy('');
    setReportNote('');
  };
  const toggleMute = (name: string) =>
    setMutedPeople((current) =>
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name],
    );

  return (
    <main className="live-room-page">
      <header className="live-topbar">
        <div>
          <span className="live-dot" />
          <strong>Quiet Co-Work</strong>
          <span>12 people · Room locked</span>
        </div>
        <div className="live-time">
          <span>10:16 am</span>
          <strong>43:12 left</strong>
        </div>
      </header>

      <div className="live-layout">
        <section className="video-grid" aria-label="Room participants">
          <article className="video-tile speaking">
            <img src="/images/community-crafting.webp" alt="" />
            <div className="tile-bottom">
              <strong>You · KC</strong>
              <span>Mic on</span>
            </div>
          </article>
          {people.map((person, index) => (
            <article className={`video-tile ${index === 0 ? 'speaking' : ''}`} key={person.name}>
              <img src={person.image} alt="" />
              {person.role && <span className="role-badge">{person.role}</span>}
              <div className="tile-bottom">
                <strong>{person.name}</strong>
                <span>
                  {mutedPeople.includes(person.name) ? 'Muted by you' : index === 0 ? 'Speaking' : 'Listening'}
                </span>
              </div>
              {captions && index === 0 && (
                <p className="tile-caption">“My goal is to finish the first section today.”</p>
              )}
            </article>
          ))}
        </section>

        <aside className="room-guide">
          <div className="current-prompt">
            <p className="section-label">What we’re doing now</p>
            <span className="prompt-time">45 min focus · 31:08 left</span>
            <h1>Work quietly on the one thing you brought.</h1>
            <p>Conversation pauses here. Encouragement comes from everyone’s presence.</p>
            <div className="progress-track">
              <span />
            </div>
          </div>
          <div className="next-prompt">
            <span>Up next</span>
            <strong>10-minute check-out</strong>
            <p>Share what got done or name your next small step.</p>
          </div>
          <div className="your-role">
            <span className="role-badge">Participant</span>
            <p>No role this round. Keep working and let the Timekeeper guide the transition.</p>
          </div>
        </aside>
      </div>

      {safety && (
        <div
          className="safety-popover"
          role="dialog"
          aria-label="Room safety controls"
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeSafety();
          }}
        >
          {safety === 'menu' && (
            <>
              <strong>Room safety</strong>
              <p>Actions are private. Choose what you need.</p>
              <button type="button" onClick={() => setSafety('mute')}>
                Mute someone
              </button>
              <button type="button" onClick={() => setSafety('report')}>
                Report privately
              </button>
              <button type="button" onClick={closeSafety}>
                Close
              </button>
            </>
          )}

          {safety === 'mute' && (
            <>
              <strong>Mute someone</strong>
              <p>Only you stop hearing them. Nobody is told.</p>
              <div className="safety-list">
                {people.map((person) => {
                  const isMuted = mutedPeople.includes(person.name);
                  return (
                    <button
                      className={isMuted ? 'safety-picked' : ''}
                      type="button"
                      aria-pressed={isMuted}
                      key={person.name}
                      onClick={() => toggleMute(person.name)}
                    >
                      <span>{person.name}</span>
                      <span>{isMuted ? 'Muted' : 'Mute'}</span>
                    </button>
                  );
                })}
              </div>
              <button type="button" onClick={closeSafety}>
                Done
              </button>
            </>
          )}

          {safety === 'report' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (reportWho && reportWhy) setSafety('sent');
              }}
            >
              <strong>Report privately</strong>
              <p>Only the admin sees this. The person you report isn’t told.</p>
              <label className="safety-field">
                <span>Who</span>
                <select value={reportWho} onChange={(event) => setReportWho(event.target.value)} required>
                  <option value="">Choose a person</option>
                  {people.map((person) => (
                    <option key={person.name}>{person.name}</option>
                  ))}
                </select>
              </label>
              <fieldset className="safety-field">
                <legend>What happened</legend>
                {reportReasons.map((reason) => (
                  <label className="safety-reason" key={reason}>
                    <input
                      type="radio"
                      name="report-reason"
                      value={reason}
                      checked={reportWhy === reason}
                      onChange={() => setReportWhy(reason)}
                    />
                    {reason}
                  </label>
                ))}
              </fieldset>
              <label className="safety-field">
                <span>Anything the admin should know (optional)</span>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={reportNote}
                  onChange={(event) => setReportNote(event.target.value)}
                />
              </label>
              <button className="safety-primary" type="submit" disabled={!reportWho || !reportWhy}>
                Send report
              </button>
              <button type="button" onClick={() => setSafety('menu')}>
                Back
              </button>
            </form>
          )}

          {safety === 'sent' && (
            <>
              <strong>Report sent</strong>
              <p>
                Thank you. An admin will review it, and {reportWho} won’t know who reported. If you feel unsafe, you can
                leave the room now.
              </p>
              <Link className="safety-leave" href="/sessions">
                Leave the room
              </Link>
              <button type="button" onClick={closeSafety}>
                Back to the room
              </button>
            </>
          )}
        </div>
      )}

      <footer className="live-controls">
        <div>
          <button className={muted ? 'control-off' : ''} type="button" onClick={() => setMuted((value) => !value)}>
            {muted ? 'Unmute microphone' : 'Mute microphone'}
          </button>
          <button
            className={cameraOn ? '' : 'control-off'}
            type="button"
            onClick={() => setCameraOn((value) => !value)}
          >
            {cameraOn ? 'Turn camera off' : 'Turn camera on'}
          </button>
          <button className={captions ? 'control-on' : ''} type="button" onClick={() => setCaptions((value) => !value)}>
            Captions {captions ? 'on' : 'off'}
          </button>
        </div>
        <div>
          <button className="safety-control" type="button" onClick={() => setSafety('menu')}>
            Safety controls
          </button>
          <Link className="leave-room" href="/after-session">
            Leave room & finish <span aria-hidden="true">→</span>
          </Link>
        </div>
      </footer>
    </main>
  );
}

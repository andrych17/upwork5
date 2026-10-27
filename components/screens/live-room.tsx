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

export default function LiveRoomPage() {
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [captions, setCaptions] = useState(false);
  const [safetyOpen, setSafetyOpen] = useState(false);

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
                <span>{index === 0 ? 'Speaking' : 'Listening'}</span>
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

      {safetyOpen && (
        <div className="safety-popover" role="dialog" aria-label="Room safety controls">
          <strong>Room safety</strong>
          <p>Actions are private. Choose what you need.</p>
          <button type="button">Mute someone</button>
          <button type="button">Report privately</button>
          <button type="button" onClick={() => setSafetyOpen(false)}>
            Close
          </button>
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
          <button className="safety-control" type="button" onClick={() => setSafetyOpen(true)}>
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

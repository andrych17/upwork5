'use client';

import Link from 'next/link';
import { useState } from 'react';

const participants = [
  { name: 'Maya', image: '/images/community-painting.webp', activity: 'Writing & quiet co-work' },
  { name: 'Jon', image: '/images/guy-chair.webp', activity: 'Music & idea sessions' },
  { name: 'Nina', image: '/images/girl-glasses-guitar.webp', activity: 'Music & creative nights' },
  { name: 'Alex', image: '/images/purpose-solo.webp', activity: 'Models, sketching & co-work' },
  { name: 'Sam', image: '/images/guitar-duo.webp', activity: 'Reading & music' },
];

export default function AfterSessionPage() {
  const [picked, setPicked] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPerson, setChatPerson] = useState(participants[0]);
  const [message, setMessage] = useState('');
  const [sentMessages, setSentMessages] = useState<string[]>([]);
  const [gameInvite, setGameInvite] = useState('');

  const toggle = (name: string) => {
    setPicked((current) => (current.includes(name) ? current.filter((item) => item !== name) : [...current, name]));
  };

  return (
    <main className="after-page">
      <header className="schedule-nav">
        <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <nav aria-label="Member navigation">
          <Link href="/calendar">Calendar</Link>
          <Link href="/sessions">My sessions</Link>
          <Link href="/membership">Membership</Link>
        </nav>
        <Link className="member-avatar" href="/membership" aria-label="Open account">
          KC
        </Link>
      </header>

      {chatOpen ? (
        <section className="buddy-chat">
          <div className="chat-heading">
            <img src={chatPerson.image} alt="" />
            <div>
              <p className="section-label">Private activity-buddy room</p>
              <h1>You & {chatPerson.name}</h1>
              <span>You both chose “I’d do this again.”</span>
            </div>
          </div>
          <div className="chat-thread" aria-label="Private chat">
            <div className="system-message">
              This room opened because you both chose each other. Only you and {chatPerson.name} can see it.
            </div>
            <div className="their-message">
              <strong>{chatPerson.name}</strong>
              <p>That was exactly the push I needed today. Thanks for the company.</p>
            </div>
            <div className="your-message">
              <strong>You</strong>
              <p>Same here. I’d happily do another quiet work session together.</p>
            </div>
            {sentMessages.map((sent, index) => (
              <div className="your-message" key={`${sent}-${index}`}>
                <strong>You</strong>
                <p>{sent}</p>
              </div>
            ))}
            {gameInvite && (
              <div className="game-invite-message" role="status">
                <div>
                  <span>Game invitation sent</span>
                  <strong>
                    {gameInvite} with {chatPerson.name}
                  </strong>
                  <p>{chatPerson.name} was notified and can accept from this Buddy Room.</p>
                </div>
                <Link href="/games">
                  Open game <span aria-hidden="true">→</span>
                </Link>
              </div>
            )}
            <div className="schedule-prompt">
              <div>
                <span>Do something together again</span>
                <strong>Invite {chatPerson.name} to another session.</strong>
                <p>
                  Pick a session and we’ll share the invitation here. {chatPerson.name} must confirm and use their own
                  credit before a seat is booked. If they are out of credits or cannot go, they can simply reply in this
                  chat.
                </p>
              </div>
              <div className="buddy-invite-actions">
                <Link href="/calendar">
                  Choose a session <span aria-hidden="true">↗</span>
                </Link>
                <button type="button" onClick={() => setGameInvite('Word Rush')}>
                  Invite to Word Rush
                </button>
                <button type="button" onClick={() => setGameInvite('Slow Chess')}>
                  Invite to Slow Chess
                </button>
              </div>
            </div>
          </div>
          <div className="chat-compose">
            <label>
              <span className="sr-only">Message {chatPerson.name}</span>
              <input
                type="text"
                value={message}
                placeholder="Write a friendly message…"
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && message.trim()) {
                    setSentMessages((current) => [...current, message.trim()]);
                    setMessage('');
                  }
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                if (!message.trim()) return;
                setSentMessages((current) => [...current, message.trim()]);
                setMessage('');
              }}
            >
              Send
            </button>
          </div>
          <div className="chat-safety">
            <button type="button">Block</button>
            <button type="button" onClick={() => setChatOpen(false)}>
              Back to activity-buddy picks
            </button>
            <Link href="/sessions">Back to my sessions</Link>
          </div>
        </section>
      ) : !submitted ? (
        <>
          <section className="after-hero">
            <p className="section-label">Quiet Co-Work complete</p>
            <h1>
              Anyone you’d like
              <br />
              to do this with <span>again?</span>
            </h1>
            <p>
              Choose anyone whose company you enjoyed. Your picks stay private unless they choose you too. There is no
              score, ranking, or awkward notification.
            </p>
          </section>

          <section className="buddy-picker">
            <div className="picker-note">
              <strong>{picked.length} selected</strong>
              <span>Picks stay open for 24 hours</span>
            </div>
            <div className="participant-grid">
              {participants.map((person) => {
                const selected = picked.includes(person.name);
                return (
                  <button
                    className={selected ? 'selected' : ''}
                    type="button"
                    aria-pressed={selected}
                    key={person.name}
                    onClick={() => {
                      toggle(person.name);
                      setChatPerson(person);
                      setChatOpen(true);
                    }}
                  >
                    <img src={person.image} alt="" />
                    <span className="pick-check" aria-hidden="true">
                      {selected ? '✓' : '+'}
                    </span>
                    <strong>{person.name}</strong>
                    <small>{person.activity}</small>
                    <span className="pick-label">{selected ? 'I’d do this again' : 'Choose'}</span>
                  </button>
                );
              })}
            </div>
            <div className="picker-actions">
              <button className="save-picks" type="button" onClick={() => setSubmitted(true)}>
                Save private picks <span aria-hidden="true">→</span>
              </button>
              <Link href="/sessions">Skip for now</Link>
            </div>
          </section>
        </>
      ) : (
        <section className="picks-saved" aria-live="polite">
          <div className="confirmation-mark" aria-hidden="true">
            ✓
          </div>
          <p className="section-label">Picks saved privately</p>
          <h1>
            That’s all
            <br />
            for tonight.
          </h1>
          <p>
            If anyone you chose also chooses you, a private activity-buddy room will open. One-sided picks are never
            shared.
          </p>
          {picked.includes('Maya') && (
            <div className="buddy-opened">
              <img src="/images/community-painting.webp" alt="" />
              <div>
                <span>Activity buddy room opened</span>
                <strong>You and Maya both chose each other.</strong>
                <p>Say hello or invite Maya to another session when you are ready.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const person =
                    participants.find((participant) => picked.includes(participant.name)) ?? participants[0];
                  setChatPerson(person);
                  setChatOpen(true);
                }}
              >
                Open private chat
              </button>
            </div>
          )}
          <div className="saved-actions">
            <Link href="/calendar">Book another session</Link>
            <Link href="/sessions">Back to my sessions</Link>
          </div>
        </section>
      )}
    </main>
  );
}

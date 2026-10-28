'use client';

import Link from 'next/link';
import { useState } from 'react';
import MenuToggle from '@/components/menu-toggle';
import { MAX_PICKS, updateBuddyDemo, useBuddyDemo } from '@/lib/buddy-demo';
import { getSession } from '@/lib/session-data';

// Sample people until real rooms arrive (Milestone 4). picksYouBack stands in for the other member's private pick.
const participants = [
  {
    name: 'Maya',
    image: '/images/community-painting.webp',
    activity: 'Writing & quiet co-work',
    picksYouBack: true,
    hello: 'That was exactly the push I needed today. Thanks for the company.',
  },
  {
    name: 'Jon',
    image: '/images/guy-chair.webp',
    activity: 'Music & idea sessions',
    picksYouBack: true,
    hello: 'Good session. I got more done in that hour than all week.',
  },
  {
    name: 'Nina',
    image: '/images/girl-glasses-guitar.webp',
    activity: 'Music & creative nights',
    picksYouBack: true,
    hello: 'I liked hearing about your project. Let me know how it turns out.',
  },
  {
    name: 'Alex',
    image: '/images/purpose-solo.webp',
    activity: 'Models, sketching & co-work',
    picksYouBack: false,
    hello: '',
  },
  { name: 'Sam', image: '/images/guitar-duo.webp', activity: 'Reading & music', picksYouBack: false, hello: '' },
];

export default function AfterSessionPage() {
  const demo = useBuddyDemo();
  const [message, setMessage] = useState('');

  const picked = demo.picks;
  const full = picked.length >= MAX_PICKS;
  const rooms = demo.saved ? participants.filter((person) => person.picksYouBack && picked.includes(person.name)) : [];
  const chatPerson = rooms.find((person) => person.name === demo.chat);

  const toggle = (name: string) =>
    updateBuddyDemo((current) => {
      if (current.picks.includes(name)) return { ...current, picks: current.picks.filter((item) => item !== name) };
      if (current.picks.length >= MAX_PICKS) return current;
      return { ...current, picks: [...current.picks, name] };
    });
  const openChat = (name: string | null) => updateBuddyDemo((current) => ({ ...current, chat: name }));
  const send = (name: string) => {
    const text = message.trim();
    if (!text) return;
    updateBuddyDemo((current) => ({
      ...current,
      messages: { ...current.messages, [name]: [...(current.messages[name] ?? []), text] },
    }));
    setMessage('');
  };
  const inviteToGame = (name: string, game: string) =>
    updateBuddyDemo((current) => ({ ...current, gameInvites: { ...current.gameInvites, [name]: game } }));

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
        <MenuToggle />
      </header>

      {chatPerson ? (
        <section className="buddy-chat">
          {rooms.length > 1 && (
            <nav className="buddy-room-tabs" aria-label="Your Buddy Rooms">
              {rooms.map((person) => (
                <button
                  className={person.name === chatPerson.name ? 'active' : ''}
                  type="button"
                  aria-current={person.name === chatPerson.name ? 'true' : undefined}
                  key={person.name}
                  onClick={() => openChat(person.name)}
                >
                  <img src={person.image} alt="" />
                  {person.name}
                </button>
              ))}
            </nav>
          )}
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
              <p>{chatPerson.hello}</p>
            </div>
            <div className="your-message">
              <strong>You</strong>
              <p>Same here. I’d happily do another session together.</p>
            </div>
            {(demo.messages[chatPerson.name] ?? []).map((sent, index) => (
              <div className="your-message" key={`${sent}-${index}`}>
                <strong>You</strong>
                <p>{sent}</p>
              </div>
            ))}
            {demo.sessionInvites[chatPerson.name] && (
              <SessionInvite name={chatPerson.name} slug={demo.sessionInvites[chatPerson.name]} />
            )}
            {demo.gameInvites[chatPerson.name] && (
              <div className="game-invite-message" role="status">
                <div>
                  <span>Game invitation sent</span>
                  <strong>
                    {demo.gameInvites[chatPerson.name]} with {chatPerson.name}
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
                <Link
                  href="/calendar"
                  onClick={() => updateBuddyDemo((current) => ({ ...current, inviting: chatPerson.name }))}
                >
                  Choose a session <span aria-hidden="true">↗</span>
                </Link>
                <button type="button" onClick={() => inviteToGame(chatPerson.name, 'Word Rush')}>
                  Invite to Word Rush
                </button>
                <button type="button" onClick={() => inviteToGame(chatPerson.name, 'Slow Chess')}>
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
                  if (event.key === 'Enter') send(chatPerson.name);
                }}
              />
            </label>
            <button type="button" onClick={() => send(chatPerson.name)}>
              Send
            </button>
          </div>
          <div className="chat-safety">
            <button type="button">Block</button>
            <button type="button" onClick={() => openChat(null)}>
              {rooms.length > 1 ? 'All my Buddy Rooms' : 'Back to activity-buddy picks'}
            </button>
            <Link href="/sessions">Back to my sessions</Link>
          </div>
        </section>
      ) : !demo.saved ? (
        <>
          <section className="after-hero">
            <p className="section-label">Quiet Co-Work complete</p>
            <h1>
              Anyone you’d like
              <br />
              to do this with <span>again?</span>
            </h1>
            <p>
              Choose up to three people whose company you enjoyed. Your picks stay private unless they choose you too.
              There is no score, ranking, or awkward notification.
            </p>
          </section>

          <section className="buddy-picker">
            <div className="picker-note">
              <strong>
                {picked.length} of {MAX_PICKS} selected
              </strong>
              <span>{full ? 'That’s the most you can choose' : 'Picks stay open for 24 hours'}</span>
            </div>
            <div className="participant-grid">
              {participants.map((person) => {
                const selected = picked.includes(person.name);
                return (
                  <button
                    className={selected ? 'selected' : ''}
                    type="button"
                    aria-pressed={selected}
                    disabled={!selected && full}
                    key={person.name}
                    onClick={() => toggle(person.name)}
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
              <button
                className="save-picks"
                type="button"
                onClick={() => updateBuddyDemo((current) => ({ ...current, saved: true }))}
              >
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
          {rooms.length > 0 && (
            <div className="buddy-opened-list">
              {rooms.map((person) => (
                <div className="buddy-opened" key={person.name}>
                  <img src={person.image} alt="" />
                  <div>
                    <span>Activity buddy room opened</span>
                    <strong>You and {person.name} both chose each other.</strong>
                    <p>Say hello or invite {person.name} to another session when you are ready.</p>
                  </div>
                  <button type="button" onClick={() => openChat(person.name)}>
                    Open private chat
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="saved-actions">
            <Link href="/calendar">Book another session</Link>
            <Link href="/sessions">Back to my sessions</Link>
            <button
              type="button"
              onClick={() => updateBuddyDemo((current) => ({ ...current, saved: false, chat: null }))}
            >
              Change my picks
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function SessionInvite({ name, slug }: { name: string; slug: string }) {
  const session = getSession(slug);
  return (
    <div className="game-invite-message session-invite-message" role="status">
      <div>
        <span>Session invitation sent</span>
        <strong>
          {session.title} · {session.day}, {session.month} {session.date} · {session.time}
        </strong>
        <p>
          Your seat is booked. Waiting for {name} to accept or decline. {name} confirms with their own credit.
        </p>
      </div>
      <Link href={`/book/${session.slug}`}>
        View session <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

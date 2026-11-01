'use client';

// Buddy Rooms with real data (schema section 26). /after-session?s=<slug>: pick up to 3 people from that
// session; picks stay private unless they pick you too. /after-session (no slug): your Buddy Rooms.
// ?buddy=<id> opens that chat. Messages arrive live through Supabase Realtime.
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import AccountMenu from '@/components/account-menu';
import MenuToggle from '@/components/menu-toggle';
import { useAccount } from '@/lib/account';
import {
  fetchMessages,
  gameHash,
  getMyBuddies,
  getSessionPeople,
  initials,
  MAX_PICKS,
  saveBuddyPicks,
  sendBuddyMessage,
  subscribeMessages,
  unpickBuddy,
  type Buddy,
  type BuddyMessage,
  type GameName,
  type SessionPeople,
} from '@/lib/buddies';
import { updateBuddyDemo } from '@/lib/buddy-demo';
import { fetchRoom, when } from '@/lib/rooms';
import { getSupabase } from '@/lib/supabase';
import { useNow } from '@/lib/use-now';

interface Loaded {
  key: string;
  people: SessionPeople | null;
  peopleError: string;
  buddies: Buddy[] | null;
}

function Face({ name, url }: { name: string; url: string | null }) {
  if (url) return <img src={url} alt="" />;
  return (
    <span className="buddy-face" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function Header() {
  return (
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
      <AccountMenu
        signedOut={
          <Link className="schedule-signin" href="/signin">
            Sign in
          </Link>
        }
      />
      <MenuToggle />
    </header>
  );
}

export default function BuddyRooms() {
  const supabase = getSupabase()!;
  const router = useRouter();
  const params = useSearchParams();
  const slug = params.get('s') ?? '';
  const { ready, account } = useAccount();
  const now = useNow();
  const me = account?.id ?? '';
  const [tick, setTick] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [picks, setPicks] = useState<string[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [chat, setChat] = useState<string | null>(params.get('buddy'));

  const key = `${me}|${slug}|${tick}`;
  useEffect(() => {
    if (!me) return;
    let live = true;
    const people = slug
      ? fetchRoom(supabase, slug).then((room) =>
          room ? getSessionPeople(supabase, room.id) : { data: null, error: 'This session isn’t on the calendar.' },
        )
      : Promise.resolve({ data: null, error: '' });
    Promise.all([people, getMyBuddies(supabase)]).then(([p, buddies]) => {
      if (live) setLoaded({ key, people: p.data, peopleError: p.error, buddies });
    });
    return () => {
      live = false;
    };
  }, [supabase, me, slug, key]);

  if (ready && !account) {
    return (
      <main className="after-page">
        <Header />
        <section className="after-hero">
          <p className="section-label">Buddy Rooms</p>
          <h1>
            Sign in to see
            <br />
            your <span>Buddy Rooms.</span>
          </h1>
          <p>
            <Link href={{ pathname: '/signin', query: { next: slug ? `/after-session?s=${slug}` : '/after-session' } }}>
              Sign in
            </Link>
          </p>
        </section>
      </main>
    );
  }

  const current = loaded && loaded.key.startsWith(`${me}|${slug}|`) ? loaded : null;
  if (!current) {
    return (
      <main className="after-page">
        <Header />
        <section className="after-hero" aria-busy="true">
          <p className="section-label">Buddy Rooms</p>
          <h1>Loading…</h1>
        </section>
      </main>
    );
  }

  const buddies = current.buddies ?? [];
  const chatBuddy = buddies.find((b) => b.id === chat);
  if (chatBuddy) {
    return (
      <main className="after-page">
        <Header />
        <ChatRoom
          me={me}
          buddy={chatBuddy}
          buddies={buddies}
          onOpen={setChat}
          onClosed={() => {
            setChat(null);
            setTick((t) => t + 1);
          }}
        />
      </main>
    );
  }

  const data = current.people;
  const saved = data ? data.people.filter((p) => p.picked).map((p) => p.id) : [];
  const chosen = picks ?? saved;
  const full = chosen.length >= MAX_PICKS;
  const showPicker = Boolean(data?.can_pick) && (editing || saved.length === 0);
  const matchedHere = data ? data.people.filter((p) => p.matched) : [];

  const toggle = (id: string) =>
    setPicks((now) => {
      const list = now ?? saved;
      if (list.includes(id)) return list.filter((item) => item !== id);
      return list.length >= MAX_PICKS ? list : [...list, id];
    });

  const save = async () => {
    if (!data) return;
    setBusy(true);
    setError('');
    const res = await saveBuddyPicks(supabase, data.session.id, chosen);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setPicks(null);
    setEditing(false);
    setTick((t) => t + 1);
  };

  if (slug && !data) {
    return (
      <main className="after-page">
        <Header />
        <section className="after-hero">
          <p className="section-label">Buddy picks</p>
          <h1>
            Nothing to pick
            <br />
            <span>here.</span>
          </h1>
          <p>{current.peopleError || 'We couldn’t load this session. Refresh to try again.'}</p>
        </section>
        <BuddyList buddies={buddies} onOpen={setChat} />
      </main>
    );
  }

  if (data && showPicker) {
    return (
      <main className="after-page">
        <Header />
        <section className="after-hero">
          <p className="section-label">{data.session.title} complete</p>
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
              {chosen.length} of {MAX_PICKS} selected
            </strong>
            <span>
              {full
                ? 'That’s the most you can choose'
                : `Picks stay open until ${when(data.picks_close_at).weekday} ${when(data.picks_close_at).time}`}
            </span>
          </div>
          {data.people.length === 0 ? (
            <p className="picker-empty">Nobody else was booked in this session.</p>
          ) : (
            <div className="participant-grid">
              {data.people.map((person) => {
                const selected = chosen.includes(person.id);
                return (
                  <button
                    className={selected ? 'selected' : ''}
                    type="button"
                    aria-pressed={selected}
                    disabled={!selected && full}
                    key={person.id}
                    onClick={() => toggle(person.id)}
                  >
                    <Face name={person.first_name} url={person.avatar_url} />
                    <span className="pick-check" aria-hidden="true">
                      {selected ? '✓' : '+'}
                    </span>
                    <strong>{person.first_name}</strong>
                    <small>{person.matched ? 'You picked each other' : 'In this session'}</small>
                    <span className="pick-label">{selected ? 'I’d do this again' : 'Choose'}</span>
                  </button>
                );
              })}
            </div>
          )}
          {error && (
            <p className="buddy-error" role="alert">
              {error}
            </p>
          )}
          <div className="picker-actions">
            <button className="save-picks" type="button" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save private picks'} <span aria-hidden="true">→</span>
            </button>
            {editing ? (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setPicks(null);
                  setEditing(false);
                }}
              >
                Keep my picks
              </button>
            ) : (
              <Link href="/sessions">Skip for now</Link>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="after-page">
      <Header />
      <section className="picks-saved" aria-live="polite">
        {data ? (
          <>
            <div className="confirmation-mark" aria-hidden="true">
              ✓
            </div>
            <p className="section-label">{saved.length ? 'Picks saved privately' : data.session.title}</p>
            <h1>
              {data.can_pick || saved.length ? (
                <>
                  That’s all
                  <br />
                  for tonight.
                </>
              ) : now < Date.parse(data.session.starts_at) ? (
                <>
                  Picks open
                  <br />
                  when it starts.
                </>
              ) : (
                <>
                  Picks for this
                  <br />
                  session closed.
                </>
              )}
            </h1>
            <p>
              If anyone you chose also chooses you, a private activity-buddy room will open. One-sided picks are never
              shared.
            </p>
          </>
        ) : (
          <>
            <p className="section-label">Buddy Rooms</p>
            <h1>
              Your activity
              <br />
              buddies.
            </h1>
            <p>
              After a session, pick up to three people you’d happily do it again with. When someone picks you too, a
              private room opens here. One-sided picks are never shared.
            </p>
          </>
        )}
        {(data ? matchedHere : buddies).length > 0 && (
          <div className="buddy-opened-list">
            {(data ? buddies.filter((b) => matchedHere.some((m) => m.id === b.id)) : buddies).map((person) => (
              <div className="buddy-opened" key={person.id}>
                <Face name={person.first_name} url={person.avatar_url} />
                <div>
                  <span>Activity buddy room</span>
                  <strong>You and {person.first_name} both chose each other.</strong>
                  <p>
                    {person.last_body
                      ? `${person.last_from_me ? 'You' : person.first_name}: ${person.last_body}`
                      : `Say hello or invite ${person.first_name} to another session when you are ready.`}
                  </p>
                </div>
                <button type="button" onClick={() => setChat(person.id)}>
                  Open private chat
                </button>
              </div>
            ))}
          </div>
        )}
        {!data && buddies.length === 0 && (
          <p className="picker-empty">No Buddy Rooms yet. They appear here after a session when a pick is mutual.</p>
        )}
        <div className="saved-actions">
          <Link href="/calendar">Book another session</Link>
          <Link href="/sessions">Back to my sessions</Link>
          {data?.can_pick && (
            <button type="button" onClick={() => setEditing(true)}>
              Change my picks
            </button>
          )}
          {data && buddies.length > matchedHere.length && (
            <button type="button" onClick={() => router.push('/after-session')}>
              All my Buddy Rooms
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

function BuddyList({ buddies, onOpen }: { buddies: Buddy[]; onOpen: (id: string) => void }) {
  if (buddies.length === 0) return null;
  return (
    <section className="picks-saved">
      <p className="section-label">Your Buddy Rooms</p>
      <div className="buddy-opened-list">
        {buddies.map((person) => (
          <div className="buddy-opened" key={person.id}>
            <Face name={person.first_name} url={person.avatar_url} />
            <div>
              <span>Activity buddy room</span>
              <strong>You and {person.first_name}</strong>
            </div>
            <button type="button" onClick={() => onOpen(person.id)}>
              Open private chat
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

interface ChatProps {
  me: string;
  buddy: Buddy;
  buddies: Buddy[];
  onOpen: (id: string | null) => void;
  onClosed: () => void;
}

function ChatRoom({ me, buddy, buddies, onOpen, onClosed }: ChatProps) {
  const supabase = getSupabase()!;
  const [thread, setThread] = useState<{ id: string; messages: BuddyMessage[] | null } | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const name = buddy.first_name;

  useEffect(() => {
    let live = true;
    const add = (row: BuddyMessage) =>
      setThread((t) =>
        t && t.id === buddy.id && t.messages && !t.messages.some((m) => m.id === row.id)
          ? { ...t, messages: [...t.messages, row] }
          : t,
      );
    const stop = subscribeMessages(supabase, me, buddy.id, add);
    fetchMessages(supabase, me, buddy.id).then((messages) => {
      if (live) setThread({ id: buddy.id, messages });
    });
    return () => {
      live = false;
      stop();
    };
  }, [supabase, me, buddy.id]);

  const messages = thread?.id === buddy.id ? thread.messages : undefined;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages?.length]);

  const send = async (kind: 'text' | 'game', body: string, payload: BuddyMessage['payload'] = null) => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    const failed = await sendBuddyMessage(supabase, buddy.id, kind, text, payload);
    setSending(false);
    if (failed) {
      setError(failed);
      return;
    }
    if (kind === 'text') setMessage('');
    // Realtime delivers the new row; reload as well in case the socket is slow or blocked.
    const fresh = await fetchMessages(supabase, me, buddy.id);
    if (fresh) setThread({ id: buddy.id, messages: fresh });
  };

  const inviteToGame = (game: GameName) => void send('game', `Want to play ${game}?`, { game });

  const block = async () => {
    if (!window.confirm(`Close your Buddy Room with ${name}? ${name} isn’t told, and the chat closes for both of you.`))
      return;
    const failed = await unpickBuddy(supabase, buddy.id);
    if (failed) setError(failed);
    else onClosed();
  };

  return (
    <section className="buddy-chat">
      {buddies.length > 1 && (
        <nav className="buddy-room-tabs" aria-label="Your Buddy Rooms">
          {buddies.map((person) => (
            <button
              className={person.id === buddy.id ? 'active' : ''}
              type="button"
              aria-current={person.id === buddy.id ? 'true' : undefined}
              key={person.id}
              onClick={() => onOpen(person.id)}
            >
              <Face name={person.first_name} url={person.avatar_url} />
              {person.first_name}
            </button>
          ))}
        </nav>
      )}
      <div className="chat-heading">
        <Face name={name} url={buddy.avatar_url} />
        <div>
          <p className="section-label">Private activity-buddy room</p>
          <h1>You & {name}</h1>
          <span>You both chose “I’d do this again.”</span>
        </div>
      </div>
      <div className="chat-thread" aria-label="Private chat" aria-live="polite">
        <div className="system-message">
          This room opened because you both chose each other. Only you and {name} can see it.
        </div>
        {messages === undefined && <div className="system-message">Loading messages…</div>}
        {messages === null && <div className="system-message">Couldn’t load the messages. Refresh to try again.</div>}
        {messages?.map((m) => {
          const mine = m.sender_id === me;
          if (m.kind === 'session' && m.payload?.slug)
            return (
              <div className="game-invite-message session-invite-message" key={m.id}>
                <div>
                  <span>{mine ? 'Session invitation sent' : `${name} invited you`}</span>
                  <strong>{m.body}</strong>
                  <p>
                    {mine
                      ? `Your seat is booked. ${name} confirms with their own credit.`
                      : 'Book your own seat if you can make it, or reply here.'}
                  </p>
                </div>
                <Link href={`/book/${m.payload.slug}`}>
                  View session <span aria-hidden="true">→</span>
                </Link>
              </div>
            );
          if (m.kind === 'game')
            return (
              <div className="game-invite-message" key={m.id}>
                <div>
                  <span>{mine ? 'Game invitation sent' : `${name} invited you to a game`}</span>
                  <strong>
                    {m.payload?.game} with {mine ? name : 'you'}
                  </strong>
                  <p>{m.body}</p>
                </div>
                <Link href={`/games#${gameHash(m.payload?.game, name)}`}>
                  Open game <span aria-hidden="true">→</span>
                </Link>
              </div>
            );
          return (
            <div className={mine ? 'your-message' : 'their-message'} key={m.id}>
              <strong>{mine ? 'You' : name}</strong>
              <p>{m.body}</p>
            </div>
          );
        })}
        <div className="schedule-prompt">
          <div>
            <span>Do something together again</span>
            <strong>Invite {name} to another session.</strong>
            <p>
              Pick a session and we’ll share the invitation here. {name} must confirm and use their own credit before a
              seat is booked. If they are out of credits or cannot go, they can simply reply in this chat.
            </p>
          </div>
          <div className="buddy-invite-actions">
            <Link
              href="/calendar"
              onClick={() => updateBuddyDemo((current) => ({ ...current, inviting: name, invitingId: buddy.id }))}
            >
              Choose a session <span aria-hidden="true">↗</span>
            </Link>
            <button type="button" disabled={sending} onClick={() => inviteToGame('Word Rush')}>
              Invite to Word Rush
            </button>
            <button type="button" disabled={sending} onClick={() => inviteToGame('Slow Chess')}>
              Invite to Slow Chess
            </button>
          </div>
        </div>
        <div ref={bottom} />
      </div>
      {error && (
        <p className="buddy-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="chat-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void send('text', message);
        }}
      >
        <label>
          <span className="sr-only">Message {name}</span>
          <input
            type="text"
            value={message}
            maxLength={2000}
            placeholder="Write a friendly message…"
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <button type="submit" disabled={sending || !message.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
      <div className="chat-safety">
        <button type="button" onClick={() => void block()}>
          Block
        </button>
        <button type="button" onClick={() => onOpen(null)}>
          {buddies.length > 1 ? 'All my Buddy Rooms' : 'Back to activity-buddy picks'}
        </button>
        <Link href="/sessions">Back to my sessions</Link>
      </div>
    </section>
  );
}

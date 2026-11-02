'use client';

// Live room (/live-room?s=<session slug>), Milestone 4. The room-join Edge Function checks the seat, the time
// window and the Hello Video, then returns a private Daily room and a token for this person. Video runs on
// Daily's call object (daily-js) inside the board's own layout: tiles, the activity guide, Safety (mute
// someone just for you, report privately to the admins) and Leave, which goes on to Buddy picks.
import type { DailyCall, DailyParticipant } from '@daily-co/daily-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { callEdge } from '@/lib/edge';
import { loadRoomPrefs } from '@/lib/media';
import { catalogFor, fetchRoom, type Room } from '@/lib/rooms';
import { getSupabase } from '@/lib/supabase';
import { useQueryParam } from '@/lib/use-query';

interface Person {
  id: string;
  name: string;
  avatar_url: string | null;
}

interface JoinInfo {
  url: string;
  token: string;
  title: string;
  slug: string;
  starts_at: string;
  ends_at: string;
  locks_at: string;
  name: string;
  camera_off: boolean;
  is_admin: boolean;
  people: Person[];
}

interface Tile {
  key: string;
  userId: string;
  name: string;
  local: boolean;
  video: MediaStreamTrack | null;
  audio: MediaStreamTrack | null;
  videoOn: boolean;
  audioOn: boolean;
}

type Phase = 'loading' | 'joining' | 'in' | 'error';
type SafetyStep = 'menu' | 'mute' | 'report' | 'sent';

const reportReasons = ['Made me uncomfortable', 'Rude or disrespectful', 'Inappropriate on camera', 'Something else'];

const playable = (track: DailyParticipant['tracks']['video']) =>
  track.state === 'playable' ? (track.persistentTrack ?? track.track ?? null) : null;

function toTile(p: DailyParticipant): Tile {
  return {
    key: p.session_id,
    userId: p.user_id,
    name: p.local ? 'You' : p.user_name || 'Guest',
    local: p.local,
    video: playable(p.tracks.video),
    audio: p.local ? null : playable(p.tracks.audio),
    videoOn: p.tracks.video.state === 'playable' || p.tracks.video.state === 'loading',
    audioOn: p.tracks.audio.state === 'playable' || p.tracks.audio.state === 'loading',
  };
}

/** "5 min: hello. 45 min: work. Last 10 min: share." -> timed steps of the hour. */
function steps(run: string | undefined, total: number) {
  const parts = (run ?? '').split(/(?=(?:Last\s+)?\d+\s*min:)/i).map((s) => s.trim());
  const parsed = parts
    .map((p) => p.match(/^(Last\s+)?(\d+)\s*min:\s*(.+)$/i))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ last: Boolean(m[1]), minutes: Number(m[2]), text: m[3].trim() }));
  let at = 0;
  return parsed.map((s) => {
    const start = s.last ? total - s.minutes : at;
    at = start + s.minutes;
    return { ...s, start };
  });
}

// The last minutes of a session: a banner above the controls counts down to the end (Kelly, 2 Nov).
const WRAP_UP_MINUTES = 5;
const WRAP_UP_TEXT = 'It’s not goodbye… it’s until we meet again.';

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Media({ track, kind, muted }: { track: MediaStreamTrack | null; kind: 'video' | 'audio'; muted?: boolean }) {
  const ref = useCallback(
    (el: HTMLMediaElement | null) => {
      if (!el) return;
      const current = (el.srcObject as MediaStream | null)?.getTracks()[0];
      if (track && current?.id !== track.id) el.srcObject = new MediaStream([track]);
      if (!track) el.srcObject = null;
    },
    [track],
  );
  return kind === 'video' ? <video ref={ref} autoPlay muted playsInline /> : <audio ref={ref} autoPlay muted={muted} />;
}

export default function LiveRoomPage() {
  const router = useRouter();
  const slug = useQueryParam('s');
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [speaker, setSpeaker] = useState('');
  const [now, setNow] = useState(0);
  const [safety, setSafety] = useState<SafetyStep | null>(null);
  const [mutedPeople, setMutedPeople] = useState<string[]>([]);
  const [reportWho, setReportWho] = useState('');
  const [reportWhy, setReportWhy] = useState('');
  const [reportNote, setReportNote] = useState('');
  const [reportError, setReportError] = useState('');
  const call = useRef<DailyCall | null>(null);

  // Join: room info, permission from the server, then Daily.
  useEffect(() => {
    const supabase = getSupabase();
    if (!slug || !supabase) return;
    let alive = true;
    (async () => {
      const r = await fetchRoom(supabase, slug);
      if (!alive) return;
      if (!r) {
        setError('This session was not found.');
        setPhase('error');
        return;
      }
      setRoom(r);
      const joined = await callEdge<JoinInfo>('room-join', { session_id: r.id });
      if (!alive) return;
      if (joined.error !== null) {
        setError(joined.error);
        setPhase('error');
        return;
      }
      setInfo(joined.data);
      setPhase('joining');
      const prefs = loadRoomPrefs();
      const { default: Daily } = await import('@daily-co/daily-js');
      if (!alive) return;
      const c = Daily.createCallObject({
        audioSource: prefs.micId || true,
        videoSource: prefs.cameraId || true,
        subscribeToTracksAutomatically: true,
      });
      call.current = c;
      const refresh = () => setTiles(Object.values(c.participants()).map(toTile));
      for (const ev of [
        'participant-joined',
        'participant-updated',
        'participant-left',
        'track-started',
        'track-stopped',
      ] as const)
        c.on(ev, refresh);
      c.on('active-speaker-change', (e) => setSpeaker(e?.activeSpeaker?.peerId ?? ''));
      c.on('left-meeting', () => alive && router.push(`/after-session?s=${encodeURIComponent(slug)}`));
      c.on('error', (e) => {
        setError(e?.errorMsg?.includes('exp') ? 'This session has ended.' : 'The video connection dropped.');
        setPhase('error');
      });
      try {
        await c.join({
          url: joined.data.url,
          token: joined.data.token,
          startVideoOff: joined.data.camera_off || !prefs.cameraOn,
          startAudioOff: !prefs.micOn,
        });
        if (!alive) return;
        refresh();
        setPhase('in');
      } catch {
        if (!alive) return;
        setError('The camera or microphone didn’t start, or the connection failed. Check them and try again.');
        setPhase('error');
      }
    })();
    return () => {
      alive = false;
      const c = call.current;
      call.current = null;
      if (c) void c.leave().finally(() => c.destroy());
    };
  }, [slug, router]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const me = tiles.find((t) => t.local);
  const others = tiles.filter((t) => !t.local);
  const person = (userId: string) => info?.people.find((p) => p.id === userId);
  const ends = info ? new Date(info.ends_at).getTime() : 0;
  const starts = info ? new Date(info.starts_at).getTime() : 0;
  const locked = info ? now > new Date(info.locks_at).getTime() : false;
  const wrapUp = ends > 0 && now > 0 && ends > now && ends - now <= WRAP_UP_MINUTES * 60_000;
  const plan = steps(room ? catalogFor(room)?.run : undefined, room?.minutes ?? 60);
  const elapsedMin = now && starts ? (now - starts) / 60_000 : 0;
  const currentIdx = plan.findIndex((s) => elapsedMin >= s.start && elapsedMin < s.start + s.minutes);
  const current = plan[currentIdx];
  const next = currentIdx >= 0 ? plan[currentIdx + 1] : plan.find((s) => s.start > elapsedMin);

  const closeSafety = () => {
    setSafety(null);
    setReportWho('');
    setReportWhy('');
    setReportNote('');
    setReportError('');
  };
  const leave = async () => {
    const c = call.current;
    if (c) await c.leave();
    else router.push(slug ? `/after-session?s=${encodeURIComponent(slug)}` : '/sessions');
  };
  const sendReport = async () => {
    const supabase = getSupabase();
    if (!supabase || !room) return;
    setReportError('');
    const { data, error: rpcError } = await supabase.rpc('report_participant', {
      p_session: room.id,
      p_reported: reportWho || null,
      p_reason: reportWhy,
      p_note: reportNote || null,
    });
    const res = data as { success: boolean; error?: string } | null;
    if (rpcError || !res?.success) return setReportError(res?.error || 'The report didn’t send. Please try again.');
    setSafety('sent');
  };
  const reportName = others.find((t) => t.userId === reportWho)?.name ?? 'they';

  const preview = !getSupabase();
  if (phase === 'error' || !slug || preview) {
    return (
      <main className="live-room-page">
        <header className="live-topbar">
          <div>
            <strong>{room?.title ?? 'Live room'}</strong>
          </div>
        </header>
        <section className="room-message">
          <h1>{slug && !preview ? 'You can’t join right now.' : 'Pick a session first.'}</h1>
          <p>
            {preview
              ? 'Live rooms need member accounts, which are not connected on this preview.'
              : slug
                ? error
                : 'Rooms open from My sessions, 5 minutes before the start.'}
          </p>
          <Link className="enter-room" href="/sessions">
            Back to My sessions <span aria-hidden="true">→</span>
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="live-room-page">
      <header className="live-topbar">
        <div>
          <span className="live-dot" />
          <strong>{info?.title ?? room?.title ?? 'Live room'}</strong>
          <span>
            {phase === 'in' ? `${tiles.length} ${tiles.length === 1 ? 'person' : 'people'}` : 'Connecting…'}
            {locked ? ' · Room locked' : ''}
          </span>
        </div>
        <div className="live-time">
          <span>{now ? new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}</span>
          <strong className={wrapUp ? 'live-time-low' : ''}>{ends ? `${clock(ends - now)} left` : ''}</strong>
        </div>
      </header>

      <div className="live-layout">
        <section className="video-grid" aria-label="Room participants">
          {phase !== 'in' && (
            <article className="video-tile">
              <div className="tile-fallback">
                <span>…</span>
              </div>
              <div className="tile-bottom">
                <strong>Joining the room</strong>
              </div>
            </article>
          )}
          {[...(me ? [me] : []), ...others].map((t) => {
            const muted = mutedPeople.includes(t.userId);
            const photo = person(t.userId)?.avatar_url;
            return (
              <article className={`video-tile ${t.key === speaker && !t.local ? 'speaking' : ''}`} key={t.key}>
                {t.video && t.videoOn ? (
                  <Media track={t.video} kind="video" />
                ) : photo ? (
                  <img src={photo} alt="" />
                ) : (
                  <div className="tile-fallback">
                    <span>{t.name.charAt(0).toUpperCase()}</span>
                  </div>
                )}
                {!t.local && <Media track={t.audio} kind="audio" muted={muted} />}
                <div className="tile-bottom">
                  <strong>{t.local ? `You · ${info?.name ?? ''}` : t.name}</strong>
                  <span>
                    {muted ? 'Muted by you' : !t.audioOn ? 'Mic off' : t.key === speaker ? 'Speaking' : 'Listening'}
                  </span>
                </div>
              </article>
            );
          })}
        </section>

        <aside className="room-guide">
          <div className="current-prompt">
            <p className="section-label">What we’re doing now</p>
            {current ? (
              <>
                <span className="prompt-time">
                  {current.minutes} min · {clock((current.start + current.minutes - elapsedMin) * 60_000)} left
                </span>
                <h1>{current.text}</h1>
              </>
            ) : (
              <h1>{elapsedMin < 0 ? 'Settling in. We start on the hour.' : 'Enjoy the hour together.'}</h1>
            )}
            <div className="progress-track">
              <span
                style={{
                  transform: `scaleX(${current ? Math.min(1, (elapsedMin - current.start) / current.minutes) : 0})`,
                  transformOrigin: 'left',
                }}
              />
            </div>
          </div>
          {next && (
            <div className="next-prompt">
              <span>Up next</span>
              <strong>{next.minutes}-minute step</strong>
              <p>{next.text}</p>
            </div>
          )}
          <div className="your-role">
            <span className="role-badge">{info?.is_admin ? 'Admin' : 'Participant'}</span>
            <p>
              {info?.is_admin
                ? 'You can see everyone in the room. Members can report privately from Safety controls.'
                : 'Mute, Report and Leave are one tap away under Safety controls.'}
            </p>
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
                {others.length === 0 && <p>Nobody else is here yet.</p>}
                {others.map((t) => {
                  const isMuted = mutedPeople.includes(t.userId);
                  return (
                    <button
                      className={isMuted ? 'safety-picked' : ''}
                      type="button"
                      aria-pressed={isMuted}
                      key={t.key}
                      onClick={() =>
                        setMutedPeople((list) => (isMuted ? list.filter((id) => id !== t.userId) : [...list, t.userId]))
                      }
                    >
                      <span>{t.name}</span>
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
                if (reportWhy) void sendReport();
              }}
            >
              <strong>Report privately</strong>
              <p>Only the admin sees this. The person you report isn’t told.</p>
              <label className="safety-field">
                <span>Who</span>
                <select value={reportWho} onChange={(event) => setReportWho(event.target.value)} required>
                  <option value="">Choose a person</option>
                  {others.map((t) => (
                    <option key={t.key} value={t.userId}>
                      {t.name}
                    </option>
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
              {reportError && <p role="alert">{reportError}</p>}
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
                Thank you. An admin will review it, and {reportName} won’t know who reported. If you feel unsafe, you
                can leave the room now.
              </p>
              <button className="safety-leave" type="button" onClick={() => void leave()}>
                Leave the room
              </button>
              <button type="button" onClick={closeSafety}>
                Back to the room
              </button>
            </>
          )}
        </div>
      )}

      {wrapUp && (
        <div className="wrap-up-banner">
          <strong aria-hidden="true">{clock(ends - now)}</strong>
          <span role="status">{WRAP_UP_TEXT}</span>
        </div>
      )}

      <footer className="live-controls">
        <div>
          <button
            className={me?.audioOn ? '' : 'control-off'}
            type="button"
            disabled={phase !== 'in'}
            onClick={() => call.current?.setLocalAudio(!me?.audioOn)}
          >
            {me?.audioOn ? 'Mute microphone' : 'Unmute microphone'}
          </button>
          {!info?.camera_off && (
            <button
              className={me?.videoOn ? '' : 'control-off'}
              type="button"
              disabled={phase !== 'in'}
              onClick={() => call.current?.setLocalVideo(!me?.videoOn)}
            >
              {me?.videoOn ? 'Turn camera off' : 'Turn camera on'}
            </button>
          )}
        </div>
        <div>
          <button className="safety-control" type="button" onClick={() => setSafety('menu')}>
            Safety controls
          </button>
          <button className="leave-room" type="button" onClick={() => void leave()}>
            Leave room & finish <span aria-hidden="true">→</span>
          </button>
        </div>
      </footer>
    </main>
  );
}

'use client';

// Hello Video (/hello-video): record 30 seconds to 2 minutes in the browser, watch it back, send it for review.
// The file goes straight to a private R2 bucket through a 10-minute signed link (hello-video Edge Function);
// only admins watch it, and it is deleted as soon as it is reviewed.
// Without Supabase keys (preview site) everything works except the upload, which stays on this device.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import MenuToggle from '@/components/menu-toggle';
import { callEdge } from '@/lib/edge';
import { getSupabase, type MembershipSummary } from '@/lib/supabase';

type HelloStatus = MembershipSummary['hello_status'];
type Phase = 'idle' | 'camera' | 'recording' | 'review' | 'uploading' | 'sent';
interface Clip {
  blob: Blob;
  url: string;
  mime: string;
  duration: number;
}
interface Account {
  signedIn: boolean;
  status: HelloStatus;
  required: boolean;
  hold: boolean;
  reason: string | null;
}

const MIN_SECONDS = 30;
const MAX_SECONDS = 120;
const MAX_BYTES = 100 * 1024 * 1024;
// Safari records MP4, Chrome and Firefox WebM. Both play in the admin page.
const TYPES = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

const NOTE: Record<HelloStatus, { title: string; text: (a: Account) => string }> = {
  none: {
    title: 'No Hello Video yet',
    text: (a) =>
      a.required
        ? a.hold
          ? 'You can book now. Your bookings are held until it’s approved.'
          : 'You can book sessions once it’s approved.'
        : 'Record one whenever you’re ready.',
  },
  pending: {
    title: 'Waiting for review',
    text: (a) =>
      a.hold
        ? 'Your bookings are held until it’s approved. You’ll see the result here and on Membership.'
        : 'You’ll see the result here and on Membership. Recording again replaces it.',
  },
  declined: {
    title: 'We couldn’t approve this video',
    text: () => 'Your held bookings were released and the credits are back. Please contact us.',
  },
  approved: { title: 'You’re approved', text: () => 'Thanks for saying hi. Your video was deleted after the review.' },
  rejected: {
    title: 'Please record again',
    text: (a) =>
      a.reason ? `Note from the team: ${a.reason}` : 'Your last video wasn’t approved. Give it another go.',
  },
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function cameraError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError')
    return 'Camera or microphone is blocked. Allow both in your browser settings, then try again.';
  if (name === 'NotFoundError') return 'No camera or microphone was found on this device.';
  if (name === 'NotReadableError') return 'Another app is using the camera. Close it and try again.';
  return 'The camera didn’t start. Reload the page and try again.';
}

function put(url: string, clip: Clip, contentType: string, onProgress: (share: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (event) => event.lengthComputable && onProgress(event.loaded / event.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('upload network'));
    xhr.send(clip.blob);
  });
}

async function loadAccount(): Promise<Account> {
  const supabase = getSupabase();
  if (!supabase) return { signedIn: true, status: 'none', required: false, hold: false, reason: null };
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return { signedIn: false, status: 'none', required: false, hold: false, reason: null };
  const [{ data: summary }, { data: last }] = await Promise.all([
    supabase.rpc('get_my_membership'),
    supabase
      .from('hello_videos')
      .select('status, reject_reason')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const m = summary as MembershipSummary | null;
  const status = m?.hello_status ?? 'none';
  return {
    signedIn: true,
    status,
    required: Boolean(m?.hello_required),
    hold: Boolean(m?.hello_hold),
    reason: status === 'rejected' && last?.status === 'rejected' ? (last.reject_reason as string | null) : null,
  };
}

export default function HelloVideoPage() {
  const live = Boolean(getSupabase());
  const [account, setAccount] = useState<Account | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<Clip | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    let current = true;
    loadAccount().then((next) => current && setAccount(next));
    return () => {
      current = false;
    };
  }, []);

  const closeCamera = useCallback(() => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }, []);

  // Camera off and the recording freed when leaving the page.
  useEffect(() => closeCamera, [closeCamera]);
  useEffect(
    () => () => {
      if (clip) URL.revokeObjectURL(clip.url);
    },
    [clip],
  );

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) stop();
    }, 250);
    return () => clearInterval(id);
  }, [phase, stop]);

  const supported =
    typeof window === 'undefined' ||
    (Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined');

  const openCamera = async () => {
    setError('');
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true,
      });
      setPhase('camera');
    } catch (e) {
      setError(cameraError(e));
    }
  };

  const record = () => {
    if (!stream.current) return;
    const mimeType = TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream.current, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 1_500_000,
      audioBitsPerSecond: 96_000,
    });
    rec.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    rec.onstop = () => {
      const mime = (rec.mimeType || mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunks, { type: mime });
      const duration = Math.min(MAX_SECONDS, Math.round((Date.now() - startedAt.current) / 1000));
      closeCamera();
      setClip({ blob, url: URL.createObjectURL(blob), mime, duration });
      setPhase('review');
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    setSeconds(0);
    rec.start(1000);
    setPhase('recording');
  };

  const retake = () => {
    setClip(null);
    setProgress(0);
    openCamera();
  };

  const send = async () => {
    if (!clip) return;
    setError('');
    if (clip.blob.size > MAX_BYTES) {
      setError('This video is too large. Please record a shorter one.');
      return;
    }
    setPhase('uploading');
    setProgress(0);
    if (!live) {
      setProgress(1);
      setPhase('sent');
      setAccount((a) => (a ? { ...a, status: 'pending' } : a));
      return;
    }
    const started = await callEdge<{ id: string; upload_url: string; content_type: string }>('hello-video', {
      action: 'start',
      mime: clip.mime,
      size: clip.blob.size,
      duration: clip.duration,
    });
    if (started.error !== null) {
      setError(started.error);
      setPhase('review');
      return;
    }
    try {
      await put(started.data.upload_url, clip, started.data.content_type, setProgress);
    } catch {
      setError('The upload stopped. Check your connection and press Send again.');
      setPhase('review');
      return;
    }
    const finished = await callEdge<{ status: string }>('hello-video', { action: 'finish', id: started.data.id });
    if (finished.error !== null) {
      setError(finished.error);
      setPhase('review');
      return;
    }
    setPhase('sent');
    setAccount((a) => (a ? { ...a, status: 'pending', reason: null } : a));
  };

  const status = account?.status ?? 'none';
  const note = account
    ? { title: NOTE[status].title, text: NOTE[status].text(account) }
    : { title: 'Checking your account', text: 'One moment.' };
  const canRecord = account?.signedIn && status !== 'approved' && status !== 'declined' && supported;

  return (
    <main className="schedule-page">
      <header className="schedule-nav">
        <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <nav aria-label="Hello Video navigation">
          <Link href="/calendar">Calendar</Link>
          <Link href="/sessions">My sessions</Link>
          <Link href="/membership">Membership</Link>
        </nav>
        <Link className="schedule-signin" href="/membership">
          My membership
        </Link>
        <MenuToggle />
      </header>

      <section className="schedule-hero">
        <div>
          <p className="section-label">Hello Video</p>
          <h1>
            Say hi
            <br />
            <span>in two minutes.</span>
          </h1>
        </div>
        <div className="public-note" role="status">
          <span className="note-dot" />
          <div>
            <strong>{note.title}</strong>
            <p>{note.text}</p>
          </div>
        </div>
      </section>

      <section className="reminders-shell">
        <div>
          <h2>What to say</h2>
          <div className="room-ready-list">
            <div>
              <span>01</span>
              <p>
                <strong>Your first name</strong>And where you’ll be joining from.
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>Why you joined</strong>What you’d like to get from the rooms.
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>Who watches it</strong>Only the MeetDoConnect team. It’s deleted as soon as it’s reviewed.
              </p>
            </div>
          </div>
        </div>

        <div className="reminders-card hello-card">
          {account && !account.signedIn && (
            <>
              <h2>Sign in first</h2>
              <Link className="enter-room" href="/signin">
                Sign in <span aria-hidden="true">→</span>
              </Link>
            </>
          )}

          {status === 'approved' && phase !== 'sent' && (
            <>
              <h2>All set</h2>
              <Link className="enter-room" href="/calendar">
                Find a session <span aria-hidden="true">→</span>
              </Link>
            </>
          )}

          {account?.signedIn && !supported && (
            <p className="reminders-tip">
              This browser can’t record video. Open MeetDoConnect in Chrome, Edge, Firefox or Safari on a phone or
              computer with a camera.
            </p>
          )}

          {canRecord && phase === 'idle' && (
            <>
              <h2>{status === 'pending' ? 'Record a new one' : 'Record your Hello Video'}</h2>
              <button className="enter-room" type="button" onClick={openCamera}>
                Turn on camera <span aria-hidden="true">→</span>
              </button>
              <p className="reminders-tip">
                Your browser asks for the camera and microphone. Nothing is recorded until you press Record. 30 seconds
                to 2 minutes.
              </p>
            </>
          )}

          {(phase === 'camera' || phase === 'recording') && (
            <>
              <div className="hello-stage">
                <video
                  className="mirror"
                  autoPlay
                  muted
                  playsInline
                  ref={(el) => {
                    if (el && stream.current && el.srcObject !== stream.current) el.srcObject = stream.current;
                  }}
                />
                {phase === 'recording' && (
                  <span className="hello-timer rec" aria-live="off">
                    {clock(seconds)} / {clock(MAX_SECONDS)}
                  </span>
                )}
              </div>
              {phase === 'camera' ? (
                <>
                  <button className="enter-room" type="button" onClick={record}>
                    Record <span aria-hidden="true">→</span>
                  </button>
                  <button
                    className="enter-room reminders-secondary"
                    type="button"
                    onClick={() => {
                      closeCamera();
                      setPhase('idle');
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button className="enter-room" type="button" disabled={seconds < MIN_SECONDS} onClick={stop}>
                  {seconds < MIN_SECONDS ? `Keep going: ${MIN_SECONDS - seconds} s to the minimum` : 'Stop'}
                  <span aria-hidden="true">■</span>
                </button>
              )}
              {phase === 'recording' && <p className="reminders-tip">Recording stops by itself at 2 minutes.</p>}
            </>
          )}

          {(phase === 'review' || phase === 'uploading') && clip && (
            <>
              <div className="hello-stage">
                <video src={clip.url} controls playsInline />
              </div>
              {phase === 'uploading' ? (
                <>
                  <div className="hello-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)}>
                    <span style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                  <p className="reminders-tip">Sending… {Math.round(progress * 100)}%. Keep this page open.</p>
                </>
              ) : (
                <>
                  <button className="enter-room" type="button" onClick={send}>
                    Send for review <span aria-hidden="true">→</span>
                  </button>
                  <button className="enter-room reminders-secondary" type="button" onClick={retake}>
                    Record again
                  </button>
                  <p className="reminders-tip">{clock(clip.duration)} long. Watch it back first if you like.</p>
                </>
              )}
            </>
          )}

          {phase === 'sent' && (
            <>
              <h2>Sent, thank you</h2>
              <p className="reminders-tip">
                The team will watch it soon. You’ll see the result here and on Membership.
                {!live && ' (Preview: uploads are not connected yet, so the video stayed on this device.)'}
              </p>
              <Link className="enter-room" href="/membership">
                Back to membership <span aria-hidden="true">→</span>
              </Link>
            </>
          )}

          {error && (
            <p className="reminders-message error" role="alert">
              {error}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}

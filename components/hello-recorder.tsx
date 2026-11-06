'use client';

// Hello Video recorder, used on /hello-video and in sign-up step 4. Same steps as a video interview:
// check the camera and microphone (pick devices, see the sound level), a 3-2-1 countdown, prompts on screen
// while recording, watch it back, then send. The file goes straight to a private R2 bucket through a
// 10-minute signed link from the hello-video Edge Function; only admins watch it, and it is deleted on review.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { logClientError } from '@/lib/client-errors';
import { callEdge } from '@/lib/edge';
import {
  canRecord,
  cameraError,
  isInAppBrowser,
  listDevices,
  openCamera,
  stopStream,
  trackDevice,
  useMicLevel,
  type Devices,
} from '@/lib/media';
import { getSupabase } from '@/lib/supabase';

type Phase = 'idle' | 'check' | 'countdown' | 'recording' | 'review' | 'uploading' | 'sent';
interface Clip {
  blob: Blob;
  url: string;
  mime: string;
  duration: number;
}

export const MIN_SECONDS = 30;
export const MAX_SECONDS = 60;
const MAX_BYTES = 100 * 1024 * 1024;
// Safari records MP4, Chrome and Firefox WebM. Both play in the admin page.
const TYPES = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
// Shown one after another while recording, so nobody freezes up.
const PROMPTS = [
  { at: 0, text: 'Say your first name and where you’re joining from.' },
  { at: 12, text: 'What made you sign up?' },
  { at: 28, text: 'Which activity are you looking forward to?' },
  { at: 45, text: 'Anything else you’d like us to know? Wrap up whenever you’re ready.' },
];

const noop = () => () => {};
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

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

interface Props {
  /** Called after the video was sent for review. */
  onSent?: () => void;
  /** Heading above the first button. */
  title?: string;
}

export default function HelloRecorder({ onSent, title = 'Record your Hello Video' }: Props) {
  const live = Boolean(getSupabase());
  const [phase, setPhase] = useState<Phase>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<Devices>({ cameras: [], mics: [] });
  const [count, setCount] = useState(3);
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<Clip | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);
  const { level, heard } = useMicLevel(
    phase === 'check' || phase === 'countdown' || phase === 'recording' ? stream : null,
  );

  // Camera off and the recording freed when leaving.
  const streamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);
  useEffect(() => () => stopStream(streamRef.current), []);
  const supported = useSyncExternalStore(noop, canRecord, () => true);
  useEffect(
    () => () => {
      if (clip) URL.revokeObjectURL(clip.url);
    },
    [clip],
  );

  const start = async (cameraId?: string, micId?: string) => {
    setError('');
    stopStream(streamRef.current);
    try {
      const next = await openCamera(cameraId, micId);
      setStream(next);
      setDevices(await listDevices());
      setPhase('check');
    } catch (e) {
      setStream(null);
      setError(cameraError(e));
      setPhase('idle');
    }
  };

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const record = useCallback(() => {
    const current = streamRef.current;
    if (!current) return;
    const mimeType = TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(current, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 1_500_000,
      audioBitsPerSecond: 96_000,
    });
    rec.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    rec.onstop = () => {
      const mime = (rec.mimeType || mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(chunks, { type: mime });
      const duration = Math.min(MAX_SECONDS, Math.round((Date.now() - startedAt.current) / 1000));
      stopStream(streamRef.current);
      setStream(null);
      setClip({ blob, url: URL.createObjectURL(blob), mime, duration });
      setPhase('review');
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    setSeconds(0);
    rec.start(1000);
    setPhase('recording');
  }, []);

  // 3, 2, 1, then record.
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count === 0) {
      record();
      return;
    }
    const id = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(id);
  }, [phase, count, record]);

  useEffect(() => {
    if (phase !== 'recording') return;
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) stop();
    }, 250);
    return () => clearInterval(id);
  }, [phase, stop]);

  const retake = () => {
    setClip(null);
    setProgress(0);
    void start();
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
      onSent?.();
      return;
    }
    const started = await callEdge<{ id: string; upload_url: string; content_type: string }>('hello-video', {
      action: 'start',
      mime: clip.mime,
      size: clip.blob.size,
      duration: clip.duration,
    });
    if (started.error !== null) {
      logClientError('hello_upload', started.error, { details: { size: clip.blob.size } });
      setError(started.error);
      setPhase('review');
      return;
    }
    try {
      await put(started.data.upload_url, clip, started.data.content_type, setProgress);
    } catch (e) {
      logClientError('hello_upload', e, { details: { size: clip.blob.size, mime: clip.mime } });
      setError('The upload stopped. Check your connection and press Send again.');
      setPhase('review');
      return;
    }
    const finished = await callEdge<{ status: string }>('hello-video', { action: 'finish', id: started.data.id });
    if (finished.error !== null) {
      logClientError('hello_upload', finished.error, { details: { step: 'finish' } });
      setError(finished.error);
      setPhase('review');
      return;
    }
    setPhase('sent');
    onSent?.();
  };

  const prompt = [...PROMPTS].reverse().find((p) => seconds >= p.at) ?? PROMPTS[0];
  const camOk = Boolean(stream?.getVideoTracks()[0]?.readyState === 'live');

  if (!supported) {
    return (
      <p className="reminders-tip">
        {isInAppBrowser()
          ? 'This app’s built-in browser can’t record video. Open the link in Chrome or Safari.'
          : 'This browser can’t record video. Open MeetDoConnect in Chrome, Edge, Firefox or Safari on a phone or computer with a camera.'}
      </p>
    );
  }

  return (
    <div className="hello-recorder">
      {phase === 'idle' && (
        <>
          <h2>{title}</h2>
          <button className="enter-room" type="button" onClick={() => void start()}>
            Turn on camera <span aria-hidden="true">→</span>
          </button>
          <p className="reminders-tip">
            Your browser asks for the camera and microphone. Nothing is recorded until you press Record. 30 to 60
            seconds.
          </p>
        </>
      )}

      {(phase === 'check' || phase === 'countdown' || phase === 'recording') && (
        <>
          <div className="hello-stage">
            <video
              className="mirror"
              autoPlay
              muted
              playsInline
              ref={(el) => {
                if (el && stream && el.srcObject !== stream) el.srcObject = stream;
              }}
            />
            {phase === 'countdown' && (
              <span className="hello-count" aria-live="assertive">
                {count || ''}
              </span>
            )}
            {phase === 'recording' && (
              <>
                <span className="hello-timer rec" aria-live="off">
                  {clock(seconds)} / {clock(MAX_SECONDS)}
                </span>
                <p className="hello-prompt-overlay" aria-live="polite">
                  {prompt.text}
                </p>
              </>
            )}
          </div>

          <div className="mic-meter" aria-label="Microphone level">
            <span>Mic</span>
            <i>
              <b style={{ transform: `scaleX(${level})` }} />
            </i>
          </div>

          {phase === 'check' && (
            <>
              <ul className="device-checks">
                <li className={camOk ? 'ok' : ''}>{camOk ? 'Camera works' : 'Camera not found'}</li>
                <li className={heard ? 'ok' : ''}>{heard ? 'We can hear you' : 'Say something to test the mic'}</li>
              </ul>
              {(devices.cameras.length > 1 || devices.mics.length > 1) && (
                <div className="device-row">
                  {devices.cameras.length > 1 && (
                    <label>
                      <span>Camera</span>
                      <select
                        value={trackDevice(stream, 'video')}
                        onChange={(e) => void start(e.target.value, trackDevice(stream, 'audio'))}
                      >
                        {devices.cameras.map((d, i) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Camera ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {devices.mics.length > 1 && (
                    <label>
                      <span>Microphone</span>
                      <select
                        value={trackDevice(stream, 'audio')}
                        onChange={(e) => void start(trackDevice(stream, 'video'), e.target.value)}
                      >
                        {devices.mics.map((d, i) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Microphone ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
              <button
                className="enter-room"
                type="button"
                disabled={!camOk}
                onClick={() => {
                  setCount(3);
                  setPhase('countdown');
                }}
              >
                Record <span aria-hidden="true">→</span>
              </button>
              <button
                className="enter-room reminders-secondary"
                type="button"
                onClick={() => {
                  stopStream(stream);
                  setStream(null);
                  setPhase('idle');
                }}
              >
                Cancel
              </button>
              {!heard && <p className="reminders-tip">The bar moves when the microphone hears you.</p>}
            </>
          )}

          {phase === 'recording' && (
            <>
              <button className="enter-room" type="button" disabled={seconds < MIN_SECONDS} onClick={stop}>
                {seconds < MIN_SECONDS ? `Keep going: ${MIN_SECONDS - seconds} s to the minimum` : 'Stop'}
                <span aria-hidden="true">■</span>
              </button>
              <p className="reminders-tip">Recording stops by itself at 1 minute.</p>
            </>
          )}
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
            The team will watch it soon.
            {!live && ' (Preview: uploads are not connected here, so the video stayed on this device.)'}
          </p>
        </>
      )}

      {error && (
        <p className="reminders-message error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

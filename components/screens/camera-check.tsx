'use client';

// Camera check before a live room (/camera-check?s=<session slug>): the real camera, a microphone level,
// device pickers, and camera/mic on or off to start with. The choices go to the live room in this tab.
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAccount } from '@/lib/account';
import {
  cameraError,
  canCapture,
  listDevices,
  loadRoomPrefs,
  openCamera,
  saveRoomPrefs,
  stopStream,
  trackDevice,
  useMicLevel,
  type Devices,
  type RoomPrefs,
} from '@/lib/media';
import { ROOM_OPENS_MINUTES, addMinutes, fetchRoom, locksAt, timeOf, type Room } from '@/lib/rooms';
import { getSupabase } from '@/lib/supabase';
import { useQueryParam } from '@/lib/use-query';

const noop = () => () => {};

export default function CameraCheckPage() {
  const slug = useQueryParam('s');
  const { account } = useAccount();
  const [room, setRoom] = useState<Room | null>(null);
  const [prefs, setPrefs] = useState<RoomPrefs>({ cameraId: '', micId: '', cameraOn: true, micOn: true });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<Devices>({ cameras: [], mics: [] });
  const [error, setError] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const { level, heard } = useMicLevel(prefs.micOn ? stream : null);
  const supported = useSyncExternalStore(noop, canCapture, () => true);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !slug) return;
    let current = true;
    fetchRoom(supabase, slug).then((r) => current && r && setRoom(r));
    return () => {
      current = false;
    };
  }, [slug]);

  // Start with what was picked last time in this tab.
  useEffect(() => {
    const saved = loadRoomPrefs();
    if (!canCapture()) return;
    let current = true;
    openCamera(saved.cameraId, saved.micId)
      .then(async (s) => {
        if (!current) return stopStream(s);
        streamRef.current = s;
        setPrefs(saved);
        setStream(s);
        setDevices(await listDevices());
      })
      .catch((e) => current && setError(cameraError(e)));
    return () => {
      current = false;
      stopStream(streamRef.current);
    };
  }, []);

  const switchDevice = async (cameraId: string, micId: string) => {
    stopStream(streamRef.current);
    try {
      const s = await openCamera(cameraId, micId);
      streamRef.current = s;
      setStream(s);
      setError('');
      setPrefs((p) => ({ ...p, cameraId, micId }));
    } catch (e) {
      setError(cameraError(e));
    }
  };

  // The preview follows the toggles; the room itself starts the same way.
  useEffect(() => {
    stream?.getVideoTracks().forEach((t) => (t.enabled = prefs.cameraOn));
    stream?.getAudioTracks().forEach((t) => (t.enabled = prefs.micOn));
  }, [stream, prefs.cameraOn, prefs.micOn]);

  const cameraId = trackDevice(stream, 'video');
  const micId = trackDevice(stream, 'audio');
  const initials = (account?.initials ?? 'You').slice(0, 2);
  const title = room?.title ?? 'Your session';
  const bhd = Boolean(room?.my_camera_off);
  const enter = () => saveRoomPrefs({ ...prefs, cameraId, micId, cameraOn: prefs.cameraOn && !bhd });

  return (
    <main className="camera-page">
      <header className="room-header">
        <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <div className="room-title">
          <strong>{title}</strong>
          {room && <span>Room opens at {timeOf(addMinutes(room.starts_at, -ROOM_OPENS_MINUTES))}</span>}
        </div>
        <Link href="/sessions">Leave setup</Link>
      </header>

      <section className="camera-layout">
        <div className={`camera-preview ${prefs.cameraOn && !bhd ? '' : 'camera-disabled'}`}>
          {prefs.cameraOn && !bhd && stream ? (
            <video
              className="camera-live"
              autoPlay
              muted
              playsInline
              ref={(el) => {
                if (el && el.srcObject !== stream) el.srcObject = stream;
              }}
            />
          ) : (
            <div className="profile-fallback">
              <span>{initials}</span>
              <strong>{bhd ? 'Bad Hair Day card' : stream ? 'Camera is off' : 'Waiting for the camera'}</strong>
            </div>
          )}
          <span className="preview-name">You · {initials}</span>
          <div className="preview-controls">
            <button
              className={prefs.micOn ? '' : 'disabled'}
              type="button"
              aria-pressed={!prefs.micOn}
              onClick={() => setPrefs((p) => ({ ...p, micOn: !p.micOn }))}
            >
              {prefs.micOn ? 'Mic on' : 'Mic off'}
            </button>
            {!bhd && (
              <button
                className={prefs.cameraOn ? '' : 'disabled'}
                type="button"
                aria-pressed={!prefs.cameraOn}
                onClick={() => setPrefs((p) => ({ ...p, cameraOn: !p.cameraOn }))}
              >
                {prefs.cameraOn ? 'Camera on' : 'Camera off'}
              </button>
            )}
          </div>
        </div>

        <div className="camera-copy">
          <p className="section-label">Almost there</p>
          <h1>
            Faces make
            <br />
            this work.
          </h1>
          <p className="camera-lead">
            See you in a moment. Check that your face is comfortably framed, your sound works, and the task you brought
            is within reach.
          </p>

          {(error || !supported) && (
            <div className="camera-warning" role="alert">
              <strong>Camera check</strong>
              {error || 'This browser can’t use a camera. Open MeetDoConnect in Chrome, Edge, Firefox or Safari.'}
            </div>
          )}
          {(bhd || !prefs.cameraOn) && (
            <div className="camera-warning" role="status">
              <strong>{bhd ? 'Using a Bad Hair Day card?' : 'Camera off'}</strong>
              {bhd
                ? 'Your camera stays off this time and your profile photo appears instead. Other members will not see a label.'
                : 'Cameras are on in rooms unless you use a Bad Hair Day card. You can turn it on in the room.'}
            </div>
          )}

          <div className="mic-meter" aria-label="Microphone level">
            <span>{prefs.micOn ? (heard ? 'We can hear you' : 'Say something') : 'Mic off'}</span>
            <i>
              <b style={{ transform: `scaleX(${prefs.micOn ? level : 0})` }} />
            </i>
          </div>

          <div className="room-ready-list">
            <div>
              <span>01</span>
              <p>
                <strong>Keep it kind</strong>Friendly presence matters more than perfect conversation.
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <strong>Protect privacy</strong>Do not record, photograph, or share what happens in the room.
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <strong>Leave when needed</strong>Mute, Report, and Leave stay within one tap throughout the session.
              </p>
            </div>
          </div>

          <div className="device-row">
            <label>
              <span>Microphone</span>
              <select
                aria-label="Microphone"
                value={micId}
                onChange={(e) => void switchDevice(cameraId, e.target.value)}
              >
                {devices.mics.length === 0 && <option value="">Default microphone</option>}
                {devices.mics.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microphone ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Camera</span>
              <select aria-label="Camera" value={cameraId} onChange={(e) => void switchDevice(e.target.value, micId)}>
                {devices.cameras.length === 0 && <option value="">Front camera</option>}
                {devices.cameras.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {slug ? (
            <Link className="enter-room" href={{ pathname: '/live-room', query: { s: slug } }} onClick={enter}>
              Enter {title} <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <Link className="enter-room" href="/sessions">
              Pick a session to join <span aria-hidden="true">→</span>
            </Link>
          )}
          {room && <p className="join-window-note">The room locks to new arrivals at {timeOf(locksAt(room))}.</p>}
        </div>
      </section>
    </main>
  );
}

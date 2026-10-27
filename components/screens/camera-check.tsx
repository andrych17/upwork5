'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function CameraCheckPage() {
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  return (
    <main className="camera-page">
      <header className="room-header">
        <Link className="schedule-mark" href="/" aria-label="MeetDoConnect home">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <div className="room-title">
          <strong>Quiet Co-Work</strong>
          <span>Room opens at 9:50 am</span>
        </div>
        <Link href="/sessions">Leave setup</Link>
      </header>

      <section className="camera-layout">
        <div className={`camera-preview ${cameraOn ? '' : 'camera-disabled'}`}>
          {cameraOn ? (
            <img src="/images/purpose-solo.webp" alt="Your camera preview" />
          ) : (
            <div className="profile-fallback">
              <span>KC</span>
              <strong>Camera is off</strong>
            </div>
          )}
          <span className="preview-name">You · KC</span>
          <div className="preview-controls">
            <button
              className={micOn ? '' : 'disabled'}
              type="button"
              aria-pressed={!micOn}
              onClick={() => setMicOn((current) => !current)}
            >
              {micOn ? 'Mic on' : 'Mic off'}
            </button>
            <button
              className={cameraOn ? '' : 'disabled'}
              type="button"
              aria-pressed={!cameraOn}
              onClick={() => setCameraOn((current) => !current)}
            >
              {cameraOn ? 'Camera on' : 'Camera off'}
            </button>
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

          {!cameraOn && (
            <div className="camera-warning" role="status">
              <strong>Using a Bad Hair Day card?</strong>
              Your profile photo will appear naturally in the room. Other members will not see a label.
            </div>
          )}

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
              <select aria-label="Microphone">
                <option>Default microphone</option>
              </select>
            </label>
            <label>
              <span>Camera</span>
              <select aria-label="Camera">
                <option>Front camera</option>
              </select>
            </label>
          </div>

          <Link className="enter-room" href="/live-room">
            Enter Quiet Co-Work <span aria-hidden="true">→</span>
          </Link>
          <p className="join-window-note">The room locks at 10:10 am, ten minutes after the start.</p>
        </div>
      </section>
    </main>
  );
}

'use client';

// Camera and microphone helpers shared by the Hello Video recorder, the camera check and the live room.
import { useEffect, useState } from 'react';

export interface Devices {
  cameras: MediaDeviceInfo[];
  mics: MediaDeviceInfo[];
}

// Social apps' built-in browsers (Instagram, Facebook, TikTok...) often block the camera without asking.
// ponytail: user-agent sniffing is a heuristic; a new app needs its token added here.
const IN_APP_UA = /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Bytedance|Line\/|MicroMessenger|Snapchat|; wv\)/i;

export const isInAppBrowser = () => typeof navigator !== 'undefined' && IN_APP_UA.test(navigator.userAgent);

export const canCapture = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

export const canRecord = () => canCapture() && typeof MediaRecorder !== 'undefined';

/** Plain words for a getUserMedia failure. */
export function cameraError(error: unknown): string {
  if (isInAppBrowser()) return 'This app’s built-in browser can’t use the camera. Open the link in Chrome or Safari.';
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Camera or microphone is blocked. Allow both in your browser settings, then try again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'No camera or microphone was found on this device.';
  if (name === 'NotReadableError')
    return 'Another app is using the camera. Close it (a call, another tab) and try again.';
  return 'The camera didn’t start. Reload the page and try again.';
}

/** Opens the camera and microphone, preferring the chosen devices and the selfie camera. */
export function openCamera(cameraId?: string, micId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: {
      ...(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'user' }),
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: micId ? { deviceId: { exact: micId } } : true,
  });
}

/** Device lists. Labels only appear once the person has allowed the camera. */
export async function listDevices(): Promise<Devices> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: all.filter((d) => d.kind === 'videoinput' && d.deviceId),
    mics: all.filter((d) => d.kind === 'audioinput' && d.deviceId),
  };
}

/** The device a stream is using, so the drop-downs show the right one. */
export const trackDevice = (stream: MediaStream | null, kind: 'video' | 'audio') =>
  (kind === 'video' ? stream?.getVideoTracks() : stream?.getAudioTracks())?.[0]?.getSettings().deviceId ?? '';

/**
 * Microphone level from 0 to 1, about 15 times a second, plus whether the mic has picked up a voice yet.
 * Uses its own AudioContext and closes it when the stream changes.
 */
export function useMicLevel(stream: MediaStream | null): { level: number; heard: boolean } {
  const [state, setState] = useState({ level: 0, heard: false, stream: null as MediaStream | null });

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return;
    const AudioCtx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let heard = false;
    const id = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      // RMS of normal speech sits around 0.02 to 0.2; scale it so a voice fills most of the bar.
      const level = Math.min(1, Math.sqrt(sum / data.length) * 6);
      heard ||= level > 0.18;
      setState({ level, heard, stream });
    }, 66);
    return () => {
      clearInterval(id);
      void ctx.close();
    };
  }, [stream]);

  return state.stream === stream ? { level: state.level, heard: state.heard } : { level: 0, heard: false };
}

export const stopStream = (stream: MediaStream | null) => stream?.getTracks().forEach((track) => track.stop());

'use client';

// The live-room games' connection to the server, shared by all four games: join on open, send moves to the game-act
// Edge Function, follow game_views (and this player's own view in game_private_views) over Realtime with a short
// refresh as a fallback, and send the timeout when a step's time runs out, like Trivia does.
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { callEdge } from '@/lib/edge';
import type { BaseView } from '@/lib/live-games';
import { getSupabase } from '@/lib/supabase';

export type Move = { type: string } & Record<string, unknown>;

interface ActResult {
  view: BaseView;
  own: boolean;
  rev: number;
  now: number;
}

interface Copy {
  rev: number;
  view: BaseView;
}

const REFRESH_MS = 3000;
const TICK_MS = 250;
// When time runs out, the first player sends the timeout a moment after the deadline and the others a little later
// each, so the game moves on even if the player whose turn it is has closed the page.
const TIMEOUT_GRACE_MS = 300;
const TIMEOUT_STAGGER_MS = 700;
// If the game still hasn't moved on (a clock a little off, a dropped call), ask again after this long.
const TIMEOUT_RETRY_MS = 2500;

const send = (sessionId: string, action: Move) => callEdge<ActResult>('game-act', { session_id: sessionId, action });

/** Takes this person out of the game when they leave the room. */
export function leaveGame(sessionId: string): void {
  void send(sessionId, { type: 'leave' });
}

// The newer of two copies wins; at the same rev a player's own view beats the shared one.
const newer = (a: Copy | null, b: Copy) => !a || b.rev > a.rev;

export function useLiveGame<V extends BaseView>(sessionId: string, me: string) {
  const [shared, setShared] = useState<Copy | null>(null);
  const [own, setOwn] = useState<Copy | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(0);
  const [msg, setMsg] = useState('');
  const [joinError, setJoinError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const lastTry = useRef({ due: 0, at: 0 });

  const takeShared = useCallback((c: Copy) => setShared((cur) => (newer(cur, c) ? c : cur)), []);
  const takeOwn = useCallback((c: Copy) => setOwn((cur) => (newer(cur, c) ? c : cur)), []);
  const took = useCallback(
    (data: ActResult) => {
      setOffset(data.now - Date.now());
      (data.own ? takeOwn : takeShared)({ rev: data.rev, view: data.view });
    },
    [takeOwn, takeShared],
  );

  // Joining puts this person in the game (or does nothing after a reload).
  useEffect(() => {
    let live = true;
    void send(sessionId, { type: 'join' }).then((r) => {
      if (!live) return;
      if (r.error !== null) setJoinError(r.error);
      else took(r.data);
    });
    return () => {
      live = false;
    };
  }, [sessionId, attempt, took]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const load = async () => {
      const [pub, mine] = await Promise.all([
        supabase.from('game_views').select('rev, view').eq('session_id', sessionId).maybeSingle(),
        supabase
          .from('game_private_views')
          .select('rev, view')
          .eq('session_id', sessionId)
          .eq('user_id', me)
          .maybeSingle(),
      ]);
      if (pub.data) takeShared(pub.data as Copy);
      if (mine.data) takeOwn(mine.data as Copy);
    };
    const row = (raw: unknown): Copy | null => {
      const r = raw as Partial<Copy> | null;
      return r?.view && typeof r.rev === 'number' ? { rev: r.rev, view: r.view } : null;
    };
    const filter = `session_id=eq.${sessionId}`;
    const channel = supabase
      .channel(`game-${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_views', filter }, (change) => {
        const c = row(change.new);
        // A very large view (a busy drawing) may come without its data: read it instead.
        if (c) takeShared(c);
        else void load();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_private_views', filter }, (change) => {
        const c = row(change.new);
        if (c) takeOwn(c);
      })
      .subscribe();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => {
      void supabase.removeChannel(channel);
      window.clearInterval(timer);
    };
  }, [sessionId, me, takeShared, takeOwn]);

  const act = async (move: Move, quiet = false) => {
    if (!quiet) setBusy(true);
    const r = await send(sessionId, move);
    if (!quiet) setBusy(false);
    if (r.error !== null) {
      if (!quiet) setMsg(r.error);
      return false;
    }
    setMsg('');
    took(r.data);
    return true;
  };

  const best = own && shared && own.rev >= shared.rev ? own : (shared ?? own);
  const view = (best?.view ?? null) as V | null;

  const onTick = useEffectEvent(() => {
    const t = Date.now();
    setNow(t);
    if (!view || view.phase === 'lobby' || view.phase === 'over') return;
    // The step's deadline, or the end of the session if that comes first (the engine then ends the game).
    const due = view.endsAt && (!view.deadline || view.endsAt < view.deadline) ? view.endsAt : view.deadline;
    if (!due || (lastTry.current.due === due && t - lastTry.current.at < TIMEOUT_RETRY_MS)) return;
    const mine = Math.max(
      0,
      view.players.findIndex((p) => p.id === me),
    );
    if (t + offset < due + TIMEOUT_GRACE_MS + mine * TIMEOUT_STAGGER_MS) return;
    lastTry.current = { due, at: t };
    void act({ type: 'timeout' }, true);
  });

  useEffect(() => {
    const id = window.setInterval(onTick, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  return {
    view,
    act,
    busy,
    msg,
    joinError,
    retry: () => {
      setJoinError('');
      setAttempt((a) => a + 1);
    },
    /** The server's clock, so every player's timers agree. */
    serverNow: now + offset,
  };
}

'use client';

// What Kelly's two team games (Invent It, Puzzle Room) draw the same way: the lobby where teams are made, the team's
// colour band, the category huddle and the team table.
import type { ReactNode } from 'react';
import { GameRules, TeamDot } from '@/components/games/live-game-parts';
import type { Move } from '@/components/games/use-live-game';
import { type GameKey, inkOn, type TeamGameView, TEAMS } from '@/lib/live-games';

export type Act = (move: Move) => Promise<boolean>;

const MIN_PLAYERS = 2;

export function TeamBand({ s, team, children }: { s: TeamGameView; team: number; children: ReactNode }) {
  const color = s.teams[team]?.color ?? '#333';
  return (
    <div className="trivia-band" style={{ background: color, color: inkOn(color) }}>
      {children}
    </div>
  );
}

/** The team table: rank, team and members, the latest round, total. */
export function TeamScores({
  s,
  me,
  last,
  final,
}: {
  s: TeamGameView;
  me: string;
  last?: { round: number; score: (team: number) => number | undefined };
  final?: boolean;
}) {
  const mine = s.players.find((p) => p.id === me)?.team ?? null;
  if (!s.ui.board.length) return null;
  return (
    <div className="game-table-wrap">
      <table className="trivia-scores">
        <thead>
          <tr>
            <th className="n">#</th>
            <th>Team</th>
            {last && <th className="n">Round {last.round}</th>}
            <th className="n">Total</th>
          </tr>
        </thead>
        <tbody>
          {s.ui.board.map((r) => {
            const win = final && s.winners.includes(r.team);
            return (
              <tr key={r.team} className={`${r.team === mine ? 'me' : ''} ${win ? 'win' : ''}`}>
                <td className="n">{r.rank}</td>
                <td>
                  <TeamDot color={r.color} />
                  <strong>Team {r.name}</strong>
                  {win && ' ★'}
                  {r.team === mine && ' (your team)'}
                  <br />
                  <span className="trivia-hint">{r.members.join(', ')}</span>
                </td>
                {last && <td className="n">{last.score(r.team) ?? '–'}</td>}
                <td className="n big">{r.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TeamLobby({
  game,
  s,
  me,
  act,
  busy,
}: {
  game: GameKey;
  s: TeamGameView;
  me: string;
  act: Act;
  busy: boolean;
}) {
  const mine = s.players.find((p) => p.id === me);
  const ready = s.players.length >= MIN_PLAYERS;
  return (
    <div className="trivia-panel trivia-lobby">
      <h3>Waiting to start</h3>
      <GameRules game={game} open />
      <ul className="trivia-players">
        {s.players.map((p) => {
          const team = s.teamMode === 'choose' && p.team != null ? TEAMS[p.team] : null;
          return (
            <li key={p.id} className="trivia-player">
              <TeamDot color={team?.color ?? '#17171724'} />
              <strong>
                {p.name}
                {p.id === me && <small>you</small>}
              </strong>
              <span className="trivia-hint">{team ? `Team ${team.name}` : ''}</span>
            </li>
          );
        })}
      </ul>
      <h3>How should teams be made?</h3>
      <div className="game-modes">
        {(
          [
            ['random', 'Random teams', 'We mix everyone into teams when someone presses Start.'],
            ['choose', 'Choose your own team', 'Each player picks a team below, then press Start.'],
          ] as const
        ).map(([mode, label, text]) => (
          <button
            key={mode}
            type="button"
            className="game-choice"
            aria-pressed={s.teamMode === mode}
            disabled={busy || !mine}
            onClick={() => void act({ type: 'mode', mode })}
          >
            <strong>{label}</strong>
            <span>{text}</span>
          </button>
        ))}
      </div>
      {s.teamMode === 'choose' && (
        <>
          <p className="trivia-hint">
            Pick your team. Players who haven’t picked are added to the smaller teams at Start. At least two teams need
            players.
          </p>
          <div className="game-teams">
            {TEAMS.map((t, i) => {
              const members = s.players.filter((p) => p.team === i);
              const on = mine?.team === i;
              return (
                <button
                  key={t.name}
                  type="button"
                  className="game-choice"
                  aria-pressed={on}
                  style={{ borderLeft: `10px solid ${t.color}` }}
                  disabled={busy || !mine}
                  onClick={() => void act({ type: 'team', team: on ? -1 : i })}
                >
                  <strong>Team {t.name}</strong>
                  <span>{members.length ? members.map((p) => p.name).join(', ') : 'nobody yet'}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      <div className="trivia-actions">
        <button
          className="trivia-btn primary big"
          type="button"
          disabled={busy || !ready || !mine}
          onClick={() => void act({ type: 'start' })}
        >
          Start the game
        </button>
        <span className="trivia-hint">
          {ready ? 'Anyone can press Start.' : `Need at least ${MIN_PLAYERS} players (${s.players.length} so far).`}
        </span>
      </div>
    </div>
  );
}

/** The team on stage taps one of three categories; `from` says what comes out of it ("Their puzzle"). */
export function TeamHuddle({
  s,
  me,
  act,
  busy,
  from,
}: {
  s: TeamGameView;
  me: string;
  act: Act;
  busy: boolean;
  from: string;
}) {
  const st = s.stage!;
  const team = s.teams[st.team];
  const onStage = s.players.find((p) => p.id === me)?.team === st.team;
  const members = s.players.filter((p) => p.team === st.team);
  const mine = st.votes[me];
  const tally = (st.cats ?? []).map((_, i) => Object.values(st.votes).filter((v) => v === i).length);
  return (
    <div className="trivia-card">
      <TeamBand s={s} team={st.team}>
        Team {team.name}
        {onStage && ' (your team)'} is choosing a category
      </TeamBand>
      <div className="trivia-card-body">
        <p className="game-now">{onStage ? 'Tap a category' : `Team ${team.name} is choosing`}</p>
        <p className="trivia-hint">
          {onStage
            ? 'Talk it over, then everyone on your team taps one. Most taps wins.'
            : `${from} will come from the category they pick.`}
        </p>
        <div className="game-cats">
          {s.ui.catNames.map((name, i) => (
            <button
              key={name}
              type="button"
              className="game-choice"
              aria-pressed={mine === i}
              disabled={busy || !onStage}
              onClick={() => void act({ type: 'pick', cat: i })}
            >
              <strong>{name}</strong>
              <span>
                {tally[i]} tap{tally[i] === 1 ? '' : 's'}
              </span>
            </button>
          ))}
        </div>
        <p className="trivia-hint">
          {Object.keys(st.votes).length} of {members.length} teammates have tapped. If time runs out, the most-tapped
          category wins (ties are settled at random).
        </p>
      </div>
    </div>
  );
}

/** "Up next": the teams still to go this round. */
export function UpNext({ s }: { s: TeamGameView }) {
  const upNext = s.order.slice(s.idx + 1);
  return (
    <>
      <h3>Up next</h3>
      {upNext.length ? (
        upNext.map((ti) => (
          <div key={ti}>
            <TeamDot color={s.teams[ti].color} /> Team {s.teams[ti].name}
          </div>
        ))
      ) : (
        <p className="trivia-hint">This is the last team this round.</p>
      )}
    </>
  );
}

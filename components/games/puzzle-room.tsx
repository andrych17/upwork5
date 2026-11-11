'use client';

// Puzzle Room in the live room: Kelly's team puzzle game (PuzzleRoom.html, 11 Nov zip). The team on stage talks a
// puzzle over out loud and only its Reader taps. Every tap goes to game-act, which runs her engine; the right answer
// stays on the server until the reveal.
import {
  ChatBreak,
  GameHead,
  GameLog,
  GameNote,
  GameRules,
  TeamDot,
  winnerTitle,
} from '@/components/games/live-game-parts';
import { type Act, TeamBand, TeamHuddle, TeamLobby, TeamScores, UpNext } from '@/components/games/team-parts';
import { useLiveGame } from '@/components/games/use-live-game';
import type { PuzzleView } from '@/lib/live-games';

const MAX_PLAYERS = 12;
const HINT_COST = 3;
const LETTERS = 'ABCD';
const SCORING =
  'A solved puzzle scores up to 10 points, plus up to 5 for speed, minus 3 per hint and 2 per wrong tap. An unsolved puzzle scores 0. Highest total wins.';

interface Props {
  s: PuzzleView;
  me: string;
  act: Act;
  busy: boolean;
}

function lastRound(s: PuzzleView) {
  const h = s.history.at(-1);
  return h && { round: h.round, score: (team: number) => h.teams[team]?.points };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Stage({ s, me, act, busy }: Props) {
  const st = s.stage!;
  const team = s.teams[st.team];
  const onStage = s.players.find((p) => p.id === me)?.team === st.team;
  const reader = s.players.find((p) => p.id === st.reader)?.name ?? '';
  const isReader = st.reader === me;
  return (
    <>
      <div className="trivia-card">
        <TeamBand s={s} team={st.team}>
          Team {team.name}
          {onStage && ' (your team)'} is on stage{s.ui.catName && ` · ${s.ui.catName}`}
        </TeamBand>
        <div className="trivia-card-body">
          <p className="game-prompt">{st.q}</p>
          {st.turn < 0 ? (
            <>
              <p className="game-now">Get ready…</p>
              <p>
                Team {team.name}, the puzzle appears in a moment. Reader this round:{' '}
                <strong>
                  {reader}
                  {isReader && ' (you)'}
                </strong>
                .
              </p>
              {onStage ? (
                <div className="trivia-actions">
                  <button
                    className="trivia-btn primary big"
                    type="button"
                    disabled={busy}
                    onClick={() => void act({ type: 'next' })}
                  >
                    We’re ready, start the clock
                  </button>
                </div>
              ) : (
                <p className="trivia-hint">Think along quietly. The team on stage is about to start.</p>
              )}
            </>
          ) : (
            <>
              <div className="game-opts" role="group" aria-label="Answers">
                {st.options.map((o, i) => {
                  const crossed = st.crossed.includes(i);
                  return (
                    <button
                      key={LETTERS[i]}
                      type="button"
                      className={crossed ? 'crossed' : undefined}
                      disabled={busy || !isReader || crossed}
                      onClick={() => void act({ type: 'guess', option: i })}
                    >
                      <span className="game-opt-letter">{LETTERS[i]}</span>
                      <span>{o}</span>
                    </button>
                  );
                })}
              </div>
              {st.shown.map((h, i) => (
                <p key={h} className="game-role">
                  Hint {i + 1}: {h}
                </p>
              ))}
              {isReader ? (
                <>
                  <div className="trivia-actions">
                    <button
                      className="trivia-btn big"
                      type="button"
                      disabled={busy || s.ui.hintsLeft < 1}
                      onClick={() => void act({ type: 'hint' })}
                    >
                      Hint (−{HINT_COST} points) · {s.ui.hintsLeft} left
                    </button>
                    <button
                      className="trivia-btn big"
                      type="button"
                      disabled={busy}
                      onClick={() => void act({ type: 'giveup' })}
                    >
                      Give up
                    </button>
                  </div>
                  <p className="trivia-hint">
                    You are your team’s Reader. Talk it over with your team out loud, then tap the answer you agree on.
                  </p>
                </>
              ) : onStage ? (
                <p className="trivia-hint">
                  Talk it over out loud! Your Reader, <strong>{reader}</strong>, taps the answer you agree on.
                </p>
              ) : (
                <p className="trivia-hint">
                  Team {team.name} is working on this one. Watch, think, and keep any answers to yourself!
                </p>
              )}
            </>
          )}
        </div>
      </div>
      <section className="trivia-panel" aria-label="Up next">
        <UpNext s={s} />
      </section>
    </>
  );
}

function Reveal({ s, me, act, busy }: Props) {
  const r = s.reveal!;
  const onStage = s.players.find((p) => p.id === me)?.team === r.team;
  let how = 'Not solved.';
  if (r.solved)
    how =
      `Solved ${r.hints ? `with ${plural(r.hints, 'hint')}` : 'with no hints'}` +
      (r.wrong ? `, ${plural(r.wrong, 'wrong tap')}` : '') +
      (r.bonus ? `, ${r.bonus} speed bonus.` : '.');
  return (
    <div className="trivia-card">
      <TeamBand s={s} team={r.team}>
        Team {s.teams[r.team]?.name}
        {onStage && ' (your team)'} · {r.cat}
      </TeamBand>
      <div className="trivia-card-body">
        <p className="game-prompt">{r.q}</p>
        <p>
          The answer: <strong>{r.answer}</strong>
        </p>
        {r.note && <p className="trivia-hint">{r.note}</p>}
        <p className="game-pts">{r.solved ? `+${r.points} points` : 'No points this time'}</p>
        <p className="trivia-hint">{how}</p>
        <div className="trivia-actions">
          <button
            className="trivia-btn primary big"
            type="button"
            disabled={busy}
            onClick={() => void act({ type: 'next' })}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function Results({ s, act, busy }: Omit<Props, 'me'>) {
  const rows = Object.entries(s.roundData).sort(([, a], [, b]) => b.points - a.points);
  return (
    <section className="trivia-panel" aria-label={`Round ${s.round} results`}>
      <h3>Round {s.round} results</h3>
      <div className="game-table-wrap">
        <table className="trivia-scores">
          <thead>
            <tr>
              <th>Team</th>
              <th>Puzzle</th>
              <th className="n">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([ti, r]) => {
              const team = s.teams[Number(ti)];
              return (
                <tr key={ti}>
                  <td>
                    <TeamDot color={team.color} />
                    <strong>{team.name}</strong>
                  </td>
                  <td className="trivia-hint">
                    {r.cat}: {r.answer}
                    {!r.solved && ' (not solved)'}
                  </td>
                  <td className="n big">{r.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="trivia-actions">
        <button
          className="trivia-btn primary big"
          type="button"
          disabled={busy}
          onClick={() => void act({ type: 'nextround' })}
        >
          {s.ui.more === false ? 'Show the final result' : 'Start the chat break'}
        </button>
        <span className="trivia-hint">Moves on by itself when the timer runs out.</span>
      </div>
    </section>
  );
}

function stepOf(s: PuzzleView): [string, string] {
  const round = `Round ${s.round}${s.rounds ? ` of ${s.rounds}` : ''} · `;
  if (s.phase === 'stage') {
    const turn = s.stage?.turn ?? 0;
    const name = s.teams[s.stage?.team ?? -1]?.name ?? '';
    return [
      `${round}Team ${name}${turn === -2 ? ' picks a category' : ' on stage'}`,
      turn === -2
        ? 'Teammates tap a category.'
        : turn < 0
          ? 'Get ready!'
          : 'Talk it over out loud. Only the Reader taps.',
    ];
  }
  if (s.phase === 'reveal') return [`${round}The answer`, 'Here is how that went.'];
  if (s.phase === 'break') return [`${round}Chat break`, 'Take a breath and talk.'];
  return [`${round}Round results`, 'Scores are in. A short break is next.'];
}

export default function PuzzleRoom({ sessionId, me }: { sessionId: string; me: string }) {
  const { view: s, act, busy, msg, joinError, retry, serverNow } = useLiveGame<PuzzleView>(sessionId, me);

  if (!s)
    return joinError ? (
      <GameNote game="puzzle-room" title="The game didn’t open.">
        <p>{joinError}</p>
        <button className="trivia-btn primary" type="button" onClick={retry}>
          Try again
        </button>
      </GameNote>
    ) : (
      <GameNote game="puzzle-room" title="Setting up the game…" />
    );

  const notice = msg || joinError;
  const head = (step: string, sub: string) => (
    <>
      <GameHead game="puzzle-room" step={step} sub={sub} view={s} serverNow={serverNow} />
      {notice && <p className="trivia-msg">{notice}</p>}
    </>
  );

  if (s.phase === 'lobby')
    return (
      <section className="trivia" aria-label="Puzzle Room">
        {head('Puzzle Room', `${s.players.length} of ${MAX_PLAYERS} players`)}
        <TeamLobby game="puzzle-room" s={s} me={me} act={act} busy={busy} />
      </section>
    );

  if (s.phase === 'over')
    return (
      <section className="trivia" aria-label="Puzzle Room">
        {head(
          winnerTitle(s.winners.map((i) => `Team ${s.teams[i]?.name}`)),
          `Final scores after ${plural(s.history.length, 'round')}`,
        )}
        <div className="trivia-panel">
          <TeamScores s={s} me={me} last={lastRound(s)} final />
          {!s.history.length && <p className="trivia-hint">Nothing was scored.</p>}
          <div className="trivia-actions">
            <button
              className="trivia-btn primary big"
              type="button"
              disabled={busy}
              onClick={() => void act({ type: 'again' })}
            >
              Play again with the same players
            </button>
          </div>
        </div>
        <GameLog lines={s.log} />
      </section>
    );

  const props = { s, me, act, busy };
  const board = <TeamScores s={s} me={me} last={lastRound(s)} />;
  let main;
  if (s.phase === 'stage' && s.stage?.turn === -2) main = <TeamHuddle {...props} from="Their puzzle" />;
  else if (s.phase === 'stage' && s.stage) main = <Stage {...props} />;
  else if (s.phase === 'reveal' && s.reveal) main = <Reveal {...props} />;
  else if (s.phase === 'break')
    main = (
      <>
        <ChatBreak
          prompt={s.brk?.prompt ?? ''}
          round={s.round}
          busy={busy}
          onNext={() => void act({ type: 'nextround' })}
        />
        <section className="trivia-panel" aria-label="Where things stand">
          <h3>Where things stand</h3>
          {board}
        </section>
      </>
    );
  else main = <Results {...props} />;

  const [step, sub] = stepOf(s);
  return (
    <section className="trivia" aria-label="Puzzle Room">
      {head(step, sub)}
      <div className="trivia-play game-play">
        <div className="trivia-side game-main">{main}</div>
        <div className="trivia-board-col">
          <section className="trivia-panel" aria-label="Scoreboard">
            <h3>Scoreboard</h3>
            {board}
            <p className="trivia-hint">{SCORING}</p>
          </section>
          <GameLog lines={s.log} />
          <section className="trivia-panel">
            <GameRules game="puzzle-room" />
          </section>
        </div>
      </div>
    </section>
  );
}

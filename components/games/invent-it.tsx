'use client';

// Invent It ("Yes, and...") in the live room: Kelly's team game (inventit.html, 11 Nov zip) for the people in the
// session, each on their own device. Every tap goes to game-act, which runs her engine; this page only draws the view.
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
import type { InventView } from '@/lib/live-games';

const MAX_PLAYERS = 12;
const ROLE_TEXT: Record<string, string> = {
  start: 'Say what it is: combine the two items into one invention.',
  and: 'Start with “Yes, and…” and add one feature.',
  name: 'Give the invention a name.',
  startname: 'Say what it is, add a feature, and give it a name.',
};

function Items({ items }: { items: string[] | null }) {
  return (
    <div className="game-items">
      {(items ?? []).map((item, i) => (
        <span key={item} className="game-item-row">
          {i > 0 && (
            <span className="game-plus" aria-hidden="true">
              +
            </span>
          )}
          <span className="game-item">{item}</span>
        </span>
      ))}
    </div>
  );
}

// The latest round's score next to the total (every round would not fit once a game runs many rounds).
function lastRound(s: InventView) {
  const h = s.history.at(-1);
  return h && { round: h.round, score: (team: number) => h.teams[team]?.avg };
}

function Stage({ s, me, act, busy }: { s: InventView; me: string; act: Act; busy: boolean }) {
  const st = s.stage!;
  const team = s.teams[st.team];
  const onStage = s.players.find((p) => p.id === me)?.team === st.team;
  const nameOf = (id: string) => s.players.find((p) => p.id === id)?.name ?? 'someone';
  const speaking = s.ui.speaker;
  return (
    <>
      <div className="trivia-card">
        <TeamBand s={s} team={st.team}>
          Team {team.name}
          {onStage && ' (your team)'} is on stage
        </TeamBand>
        <div className="trivia-card-body">
          <strong>{s.ui.catName ? `${s.ui.catName}: the two items` : 'The two items'}</strong>
          <Items items={st.items} />
          {st.turn < 0 ? (
            <>
              <p className="game-now">Get ready…</p>
              <p className="trivia-hint">
                Team {team.name}, you’re up in a moment. Speakers:{' '}
                {st.speakers.map((id) => `${nameOf(id)}${id === me ? ' (you)' : ''}`).join(', ')}.
              </p>
              {onStage ? (
                <div className="trivia-actions">
                  <button
                    className="trivia-btn primary big"
                    type="button"
                    disabled={busy}
                    onClick={() => void act({ type: 'next' })}
                  >
                    We’re ready, start
                  </button>
                </div>
              ) : (
                <p className="trivia-hint">Listen carefully. You will rate this invention.</p>
              )}
            </>
          ) : (
            <>
              <p className="game-now">{speaking === me ? 'You’re up!' : `${nameOf(speaking ?? '')} is speaking`}</p>
              <p className="game-role">{ROLE_TEXT[s.ui.role ?? ''] ?? ''}</p>
              {speaking === me ? (
                <div className="trivia-actions">
                  <button
                    className="trivia-btn primary big"
                    type="button"
                    disabled={busy}
                    onClick={() => void act({ type: 'next' })}
                  >
                    Done, next
                  </button>
                  <button
                    className="trivia-btn big"
                    type="button"
                    disabled={busy}
                    onClick={() => void act({ type: 'pass' })}
                  >
                    Pass
                  </button>
                </div>
              ) : (
                <p className="trivia-hint">Listen, then you will rate it.</p>
              )}
            </>
          )}
        </div>
      </div>
      <section className="trivia-panel" aria-label="Speaking order">
        <h3>Speaking order</h3>
        <ol className="game-lineup">
          {st.speakers.map((id, i) => {
            const name = nameOf(id);
            const state = i === st.turn ? 'now' : i < st.turn ? 'done' : '';
            const mark =
              i === st.turn ? 'speaking' : i < st.turn ? (st.said.includes(name) ? 'done' : 'passed') : 'waiting';
            return (
              <li key={id} className={state}>
                <span>
                  {name}
                  {id === me && ' (you)'}
                </span>
                <span className="trivia-hint">{mark}</span>
              </li>
            );
          })}
        </ol>
        <UpNext s={s} />
      </section>
    </>
  );
}

function Rate({ s, me, act, busy }: { s: InventView; me: string; act: Act; busy: boolean }) {
  const r = s.rate!;
  const team = s.teams[r.team];
  const onStage = s.players.find((p) => p.id === me)?.team === r.team;
  const mine = r.votes[me];
  const counted = `${Object.keys(r.votes).length} of ${s.ui.raters.length} have rated.`;
  return (
    <div className="trivia-card">
      <TeamBand s={s} team={r.team}>
        Team {team.name}’s invention
      </TeamBand>
      <div className="trivia-card-body">
        <Items items={s.stage?.items ?? null} />
        {onStage ? (
          <>
            <p className="game-now">Your team is being rated</p>
            <p className="trivia-hint">The others are tapping their ratings now. {counted}</p>
          </>
        ) : (
          <>
            <p className="game-now">How much would you buy it?</p>
            <div className="game-scale-ends">
              <span>1 = No way!</span>
              <span>5 = Absolutely!</span>
            </div>
            <div className="game-scale" role="group" aria-label="Rating from 1 to 5">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={mine === v}
                  disabled={busy}
                  onClick={() => void act({ type: 'rate', value: v })}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="trivia-hint">
              {mine ? `You rated it ${mine}. You can change it until the time is up. ` : ''}
              {counted}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Results({ s, act, busy }: { s: InventView; act: Act; busy: boolean }) {
  const rows = Object.entries(s.roundData).sort(([, a], [, b]) => b.avg - a.avg);
  return (
    <section className="trivia-panel" aria-label={`Round ${s.round} results`}>
      <h3>Round {s.round} results</h3>
      <div className="game-table-wrap">
        <table className="trivia-scores">
          <thead>
            <tr>
              <th>Team</th>
              <th>Items</th>
              <th className="n">Rated by</th>
              <th className="n">Score</th>
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
                    <br />
                    <span className="trivia-hint">{r.speakers.length ? r.speakers.join(', ') : 'nobody spoke'}</span>
                  </td>
                  <td className="trivia-hint">{(r.items ?? []).join(' + ')}</td>
                  <td className="n">{r.raters}</td>
                  <td className="n big">{r.avg}</td>
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

function stepOf(s: InventView): [string, string] {
  const name = s.teams[s.stage?.team ?? s.rate?.team ?? -1]?.name ?? '';
  const round = `Round ${s.round}${s.rounds ? ` of ${s.rounds}` : ''} · `;
  if (s.phase === 'stage') {
    const turn = s.stage?.turn ?? 0;
    return [
      `${round}Team ${name}${turn === -2 ? ' picks a category' : ' on stage'}`,
      turn === -2 ? 'Teammates tap a category.' : turn < 0 ? 'Get ready!' : 'Everyone listens. One speaker at a time.',
    ];
  }
  if (s.phase === 'rate') return [`${round}Rate Team ${name}`, 'How much would you buy it?'];
  if (s.phase === 'break') return [`${round}Chat break`, 'Take a breath and talk.'];
  return [`${round}Round results`, 'Scores are in. A short break is next.'];
}

export default function InventIt({ sessionId, me }: { sessionId: string; me: string }) {
  const { view: s, act, busy, msg, joinError, retry, serverNow } = useLiveGame<InventView>(sessionId, me);

  if (!s)
    return joinError ? (
      <GameNote game="invent-it" title="The game didn’t open.">
        <p>{joinError}</p>
        <button className="trivia-btn primary" type="button" onClick={retry}>
          Try again
        </button>
      </GameNote>
    ) : (
      <GameNote game="invent-it" title="Setting up the game…" />
    );

  const notice = msg || joinError;
  if (s.phase === 'lobby')
    return (
      <section className="trivia" aria-label="Invent It">
        <GameHead
          game="invent-it"
          step="Invent It"
          sub={`${s.players.length} of ${MAX_PLAYERS} players`}
          view={s}
          serverNow={serverNow}
        />
        {notice && <p className="trivia-msg">{notice}</p>}
        <TeamLobby game="invent-it" s={s} me={me} act={act} busy={busy} />
      </section>
    );

  if (s.phase === 'over')
    return (
      <section className="trivia" aria-label="Invent It">
        <GameHead
          game="invent-it"
          step={winnerTitle(s.winners.map((i) => `Team ${s.teams[i]?.name}`))}
          sub={`Final scores after ${s.history.length} round${s.history.length === 1 ? '' : 's'}`}
          view={s}
          serverNow={serverNow}
        />
        {notice && <p className="trivia-msg">{notice}</p>}
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

  const [step, sub] = stepOf(s);
  let main;
  if (s.phase === 'stage' && s.stage?.turn === -2)
    main = <TeamHuddle s={s} me={me} act={act} busy={busy} from="Their two items" />;
  else if (s.phase === 'stage') main = <Stage s={s} me={me} act={act} busy={busy} />;
  else if (s.phase === 'rate') main = <Rate s={s} me={me} act={act} busy={busy} />;
  else if (s.phase === 'break')
    main = (
      <ChatBreak
        prompt={s.brk?.prompt ?? ''}
        round={s.round}
        busy={busy}
        onNext={() => void act({ type: 'nextround' })}
      />
    );
  else main = <Results s={s} act={act} busy={busy} />;

  return (
    <section className="trivia" aria-label="Invent It">
      <GameHead game="invent-it" step={step} sub={sub} view={s} serverNow={serverNow} />
      {notice && <p className="trivia-msg">{notice}</p>}
      <div className="trivia-play game-play">
        <div className="trivia-side game-main">{main}</div>
        <div className="trivia-board-col">
          <section className="trivia-panel" aria-label="Scoreboard">
            <h3>Scoreboard</h3>
            <TeamScores s={s} me={me} last={lastRound(s)} />
            <p className="trivia-hint">
              A team’s score for its turn is the average of the 1 to 5 ratings it got. The total is every turn added up.
              Highest total wins.
            </p>
          </section>
          <GameLog lines={s.log} />
          <section className="trivia-panel">
            <GameRules game="invent-it" />
          </section>
        </div>
      </div>
    </section>
  );
}

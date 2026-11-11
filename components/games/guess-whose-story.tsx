'use client';

// Guess Whose Story in the live room: Kelly's everyone-for-themselves game (GuessWhosStory.html, 11 Nov zip). Each
// player taps Yes or No in secret, the room talks it over out loud, then everyone guesses the mystery person. Every tap
// goes to game-act, which runs her engine and sends each player only their own answer and guess until the reveal.
import type { ReactNode } from 'react';
import {
  ChatBreak,
  GameHead,
  GameLog,
  GameNote,
  GameRules,
  PlayerScores,
  winnerTitle,
} from '@/components/games/live-game-parts';
import { PlayerLobby } from '@/components/games/player-parts';
import { useLiveGame } from '@/components/games/use-live-game';
import type { StoryView } from '@/lib/live-games';

const MAX_PLAYERS = 12;
const QUESTIONS_PER_ROUND = 6;
const SCORING =
  'Guess the mystery person for 3 points. Be the mystery person for 1 point, plus 1 for every wrong guess (up to 5). Highest score wins.';

type Act = ReturnType<typeof useLiveGame<StoryView>>['act'];
type Cur = NonNullable<StoryView['cur']>;
interface Props {
  s: StoryView;
  me: string;
  act: Act;
  busy: boolean;
}

const nameIn = (s: StoryView) => (id: string | null) => s.players.find((p) => p.id === id)?.name ?? 'someone';

function Card({ c, children }: { c: Cur; children: ReactNode }) {
  return (
    <div className="trivia-card">
      <div className="trivia-band game-band-story">{c.cat}</div>
      <div className="trivia-card-body">
        <p className="game-prompt">{c.text}</p>
        {children}
      </div>
    </div>
  );
}

function YesNo({ picked, busy, onPick }: { picked: boolean | null; busy: boolean; onPick: (yes: boolean) => void }) {
  return (
    <div className="game-yn" role="group" aria-label="Yes or No">
      {[true, false].map((yes) => (
        <button
          key={String(yes)}
          type="button"
          aria-pressed={picked === yes}
          disabled={busy || picked !== null}
          onClick={() => onPick(yes)}
        >
          {yes ? 'Yes' : 'No'}
        </button>
      ))}
    </div>
  );
}

function Answer({ s, me, act, busy }: Props) {
  const c = s.cur!;
  const mine = c.yes[me] ?? null;
  if (!c.part.includes(me))
    return (
      <Card c={c}>
        <p className="trivia-hint">You joined during this question, so you will take part from the next one.</p>
      </Card>
    );
  return (
    <Card c={c}>
      <YesNo picked={mine} busy={busy} onPick={(value) => void act({ type: 'answer', value })} />
      <p className="trivia-hint" role="status">
        {mine !== null && `You said ${mine ? 'Yes' : 'No'}. `}
        {s.ui.answered} of {c.part.length} players have answered. Keep it secret!
      </p>
    </Card>
  );
}

function Talk({ s, me, act, busy }: Props) {
  const c = s.cur!;
  const mine = c.yes[me];
  if (!c.part.includes(me))
    return (
      <Card c={c}>
        <p className="trivia-hint">You will take part from the next question.</p>
      </Card>
    );
  let what: ReactNode;
  if (c.mode === 'spot')
    what = (
      <>
        You both answered. Talk about it out loud: what do you think the other person said, and why? You said{' '}
        <strong>{mine ? 'Yes' : 'No'}</strong>.
      </>
    );
  else if (c.isMystery)
    what = (
      <>
        <strong>You are the mystery person!</strong> Everyone will guess who it is. Stay cool: be vague, joke around, or
        point at someone else, but do not give it away.
      </>
    );
  else if (mine)
    what = (
      <>
        You said <strong>Yes</strong>, but you were not picked as the mystery person. You can help or confuse everyone
        as you like.
      </>
    );
  else
    what = (
      <>
        You said <strong>No</strong>. Work out who the mystery person is by talking it over out loud.
      </>
    );
  return (
    <Card c={c}>
      {c.mode === 'who' && (
        <p className="game-now">
          {c.yesCount} of {c.part.length} players said Yes
        </p>
      )}
      <p className={c.isMystery ? 'game-role' : undefined}>{what}</p>
      <div className="trivia-actions">
        <button
          className="trivia-btn primary big"
          type="button"
          disabled={busy}
          onClick={() => void act({ type: 'next' })}
        >
          Ready to guess
        </button>
      </div>
    </Card>
  );
}

function Vote({ s, me, act, busy }: Props) {
  const c = s.cur!;
  const nm = nameIn(s);
  const mine = c.votes[me];
  const count = `${s.ui.guessed} of ${s.ui.voters} guesses are in.`;
  if (!c.part.includes(me))
    return (
      <Card c={c}>
        <p className="trivia-hint">You will take part from the next question.</p>
      </Card>
    );
  if (c.mode === 'who' && c.isMystery)
    return (
      <Card c={c}>
        <p className="game-role">
          <strong>You are the mystery person.</strong> Sit back and enjoy the guessing. Get your story ready!
        </p>
        <p className="trivia-hint">{count}</p>
      </Card>
    );
  const others = c.part.filter((id) => id !== me);
  const vote = (target: string) => void act({ type: 'vote', target });
  return (
    <Card c={c}>
      {c.mode === 'spot' ? (
        <>
          <p>
            What do you think <strong>{nm(others[0])}</strong> answered?
          </p>
          <YesNo
            picked={mine === 'y' ? true : mine === 'n' ? false : null}
            busy={busy}
            onPick={(yes) => vote(yes ? 'y' : 'n')}
          />
        </>
      ) : (
        <>
          <p>Who do you think is the mystery person?</p>
          <div className="game-names" role="group" aria-label="Players">
            {others.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={mine === id}
                disabled={busy || Boolean(mine)}
                onClick={() => vote(id)}
              >
                {nm(id)}
              </button>
            ))}
          </div>
        </>
      )}
      <p className="trivia-hint" role="status">
        {mine && 'Your guess is locked in. '}
        {count}
      </p>
    </Card>
  );
}

function Reveal({ s, me, act, busy }: Props) {
  const c = s.cur!;
  const r = c.result;
  const nm = nameIn(s);
  if (!r) return null;
  const names = (ids: string[]) => ids.map(nm).join(', ');
  const also = c.part.filter((id) => r.yes[id] && id !== r.mystery);
  const mine = r.pts[me];
  return (
    <Card c={c}>
      {c.mode === 'spot' ? (
        <>
          <p>
            {c.part.map((id, i) => (
              <span key={id}>
                {i > 0 && ' · '}
                <strong>{nm(id)}</strong> said <strong>{r.yes[id] ? 'Yes' : 'No'}</strong>
              </span>
            ))}
          </p>
          <p>
            <strong>Story time!</strong> Whoever said Yes, tell the story behind it. If you both said Yes, swap stories.
          </p>
        </>
      ) : (
        <>
          <p className="game-now">
            The mystery person was {nm(r.mystery)}
            {r.mystery === me && ' (you!)'}!
          </p>
          <p className="game-role">
            <strong>Story time:</strong> {nm(r.mystery)}, tell us the story behind your Yes!
          </p>
          {also.length > 0 && <p className="trivia-hint">Also said Yes: {names(also)}.</p>}
        </>
      )}
      <div className="game-chips">
        {r.right.length ? (
          <span className="game-chip ok">Guessed right: {names(r.right)}</span>
        ) : (
          <span>Nobody guessed right.</span>
        )}
        {r.wrong.length > 0 && <span className="game-chip no">Fooled: {names(r.wrong)}</span>}
        {r.none.length > 0 && <span className="trivia-hint">No guess: {names(r.none)}</span>}
      </div>
      <p className="game-pts">{mine ? `You scored +${mine}` : 'You scored 0 this time'}</p>
      <div className="trivia-actions">
        <button
          className="trivia-btn primary big"
          type="button"
          disabled={busy}
          onClick={() => void act({ type: 'next' })}
        >
          Next question
        </button>
      </div>
    </Card>
  );
}

function Results({ s, me, act, busy }: Props) {
  const last = s.history.at(-1);
  const rows = s.players
    .map((p) => ({ id: p.id, name: p.name, pts: last?.pts[p.id] ?? 0 }))
    .sort((a, b) => b.pts - a.pts);
  return (
    <section className="trivia-panel" aria-label={`Round ${s.round} results`}>
      <h3>Round {s.round} results</h3>
      <div className="game-table-wrap">
        <table className="trivia-scores">
          <thead>
            <tr>
              <th>Player</th>
              <th className="n">Points this round</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.id === me ? 'me' : undefined}>
                <td>
                  <strong>{r.name}</strong>
                </td>
                <td className="n big">{r.pts}</td>
              </tr>
            ))}
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

const STEPS: Record<string, [string, string]> = {
  talk: ['Talk it over', 'Out loud, everyone. Who is it?'],
  vote: ['Time to guess', 'Lock in your guess.'],
  reveal: ['Story time', 'Here is how it went.'],
  break: ['Chat break', 'Take a breath and talk.'],
};

function stepOf(s: StoryView): [string, string] {
  const round = `Round ${s.round}${s.rounds ? ` of ${s.rounds}` : ''} · `;
  if (s.phase === 'answer') return [`${round}Question ${s.n} of ${QUESTIONS_PER_ROUND}`, 'Tap Yes or No in secret.'];
  const [step, sub] = STEPS[s.phase] ?? ['Round results', 'Scores are in. A short break is next.'];
  return [round + step, sub];
}

export default function GuessWhosStory({ sessionId, me }: { sessionId: string; me: string }) {
  const { view: s, act, busy, msg, joinError, retry, serverNow } = useLiveGame<StoryView>(sessionId, me);

  if (!s)
    return joinError ? (
      <GameNote game="guess-whose-story" title="The game didn’t open.">
        <p>{joinError}</p>
        <button className="trivia-btn primary" type="button" onClick={retry}>
          Try again
        </button>
      </GameNote>
    ) : (
      <GameNote game="guess-whose-story" title="Setting up the game…" />
    );

  const notice = msg || joinError;
  const props = { s, me, act, busy };
  const head = (step: string, sub: string) => (
    <>
      <GameHead game="guess-whose-story" step={step} sub={sub} view={s} serverNow={serverNow} />
      {notice && <p className="trivia-msg">{notice}</p>}
    </>
  );

  if (s.phase === 'lobby')
    return (
      <section className="trivia" aria-label="Guess Whose Story">
        {head('Guess Whose Story', `${s.players.length} of ${MAX_PLAYERS} players`)}
        <PlayerLobby game="guess-whose-story" dot="game-dot-story" players={s.players} me={me} act={act} busy={busy} />
      </section>
    );

  const board = <PlayerScores rows={s.ui.board} me={me} last={s.history.at(-1)} />;

  if (s.phase === 'over') {
    const rounds = s.history.length;
    return (
      <section className="trivia" aria-label="Guess Whose Story">
        {head(winnerTitle(s.winners.map(nameIn(s))), `Final scores after ${rounds} round${rounds === 1 ? '' : 's'}`)}
        <div className="trivia-panel">
          <PlayerScores rows={s.ui.board} me={me} last={s.history.at(-1)} winners={s.winners} />
          {!s.scored && <p className="trivia-hint">Nothing was scored.</p>}
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
  }

  let main: ReactNode;
  if (s.phase === 'answer' && s.cur) main = <Answer {...props} />;
  else if (s.phase === 'talk' && s.cur) main = <Talk {...props} />;
  else if (s.phase === 'vote' && s.cur) main = <Vote {...props} />;
  else if (s.phase === 'reveal' && s.cur) main = <Reveal {...props} />;
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
    <section className="trivia" aria-label="Guess Whose Story">
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
            <GameRules game="guess-whose-story" />
          </section>
        </div>
      </div>
    </section>
  );
}

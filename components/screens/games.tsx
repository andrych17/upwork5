'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isValidWord } from '@/lib/word-rush/engine';
import MenuToggle from '@/components/menu-toggle';

const board = [
  ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  ['', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', ''],
  ['', '', '', '', 'p', '', '', ''],
  ['', '', '', '', '', 'n', '', ''],
  ['p', 'p', 'p', 'p', '', 'p', 'p', 'p'],
  ['r', 'n', 'b', 'q', 'k', 'b', '', 'r'],
];

const vowels = ['A', 'A', 'A', 'E', 'E', 'E', 'E', 'I', 'I', 'I', 'O', 'O', 'U'];
const consonants = [
  'B',
  'C',
  'C',
  'D',
  'D',
  'F',
  'G',
  'H',
  'L',
  'M',
  'N',
  'N',
  'P',
  'R',
  'R',
  'S',
  'S',
  'T',
  'T',
  'V',
  'W',
  'Y',
];

function randomRack() {
  const pick = (pool: string[]) => pool[Math.floor(Math.random() * pool.length)];
  const letters = [
    pick(vowels),
    pick(vowels),
    pick(vowels),
    pick(consonants),
    pick(consonants),
    pick(consonants),
    pick(consonants),
    pick(consonants),
  ];
  return letters.sort(() => Math.random() - 0.5);
}

export default function GamesPage() {
  const [game, setGame] = useState<'word' | 'chess'>('word');
  const [wordMode, setWordMode] = useState<'solo' | 'duo'>('solo');
  const [seconds, setSeconds] = useState(60);
  const [running, setRunning] = useState(false);
  const [word, setWord] = useState('');
  const [words, setWords] = useState<{ word: string; player: 1 | 2 }[]>([]);
  const [scores, setScores] = useState<[number, number]>([0, 0]);
  const [currentPlayer, setCurrentPlayer] = useState<1 | 2>(1);
  const [rack, setRack] = useState<string[]>(() => randomRack());
  const [selectedTiles, setSelectedTiles] = useState<number[]>([]);
  const [moveSent, setMoveSent] = useState(false);

  useEffect(() => {
    if (!running || seconds === 0) return;
    const timer = window.setInterval(() => setSeconds((current) => current - 1), 1000);
    return () => window.clearInterval(timer);
  }, [running, seconds]);

  const canBuild = (candidate: string) => {
    const available = [...rack];
    return [...candidate.toUpperCase()].every((letter) => {
      const index = available.indexOf(letter);
      if (index === -1) return false;
      available.splice(index, 1);
      return true;
    });
  };

  const addWord = () => {
    const clean = word.trim().toLowerCase();
    if (
      clean.length < 3 ||
      words.some((entry) => entry.word === clean) ||
      seconds === 0 ||
      !canBuild(clean) ||
      !isValidWord(clean)
    )
      return;
    const player = wordMode === 'solo' ? 1 : currentPlayer;
    setWords((current) => [...current, { word: clean, player }]);
    setScores((current) => {
      const next: [number, number] = [...current];
      next[player - 1] += clean.length;
      return next;
    });
    setRack(randomRack());
    setSelectedTiles([]);
    if (wordMode === 'duo') setCurrentPlayer((current) => (current === 1 ? 2 : 1));
    setWord('');
  };

  const startWordRound = () => {
    setRunning(true);
    setSeconds(60);
    setWords([]);
    setScores([0, 0]);
    setCurrentPlayer(1);
    setRack(randomRack());
    setSelectedTiles([]);
    setWord('');
  };

  const selectTile = (letter: string, index: number) => {
    if (!running || seconds === 0 || selectedTiles.includes(index)) return;
    setSelectedTiles((current) => [...current, index]);
    setWord((current) => current + letter.toLowerCase());
  };

  // Kelly: typing works as well as tapping tiles. Each typed letter takes the first unused matching tile,
  // and letters that are not on the rack are ignored.
  const typeWord = (value: string) => {
    if (!running || seconds === 0) return;
    const used: number[] = [];
    for (const letter of value.toUpperCase()) {
      const index = rack.findIndex((tile, i) => tile === letter && !used.includes(i));
      if (index !== -1) used.push(index);
    }
    setSelectedTiles(used);
    setWord(used.map((i) => rack[i].toLowerCase()).join(''));
  };

  const clearTiles = () => {
    setSelectedTiles([]);
    setWord('');
  };

  const randomizeTiles = () => {
    setRack(randomRack());
    clearTiles();
  };

  return (
    <main className="games-page">
      <header className="schedule-nav">
        <Link className="schedule-mark" href="/">
          <span>Meet</span>
          <span>Do</span>
          <span>Connect</span>
        </Link>
        <nav aria-label="Games navigation">
          <Link href="/calendar">Calendar</Link>
          <Link href="/sessions">My sessions</Link>
          <Link className="active" href="/games">
            Games
          </Link>
        </nav>
        <Link className="schedule-signin" href="/sessions">
          My sessions
        </Link>
        <MenuToggle />
      </header>

      <section className="games-hero">
        <div>
          <p className="section-label">Buddy games</p>
          <h1>
            Two people.
            <br />
            <span>One friendly game.</span>
          </h1>
        </div>
        <div className="next-session-countdown">
          <span>Quiet Co-Work opens in</span>
          <strong>00:18:42</strong>
          <Link href="/camera-check">
            Go to camera check <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <nav className="game-switch" aria-label="Choose a game">
        <button className={game === 'word' ? 'selected' : ''} type="button" onClick={() => setGame('word')}>
          <span>01</span>
          <strong>Word Rush</strong>
          <small>Same letters · two timed turns</small>
        </button>
        <button className={game === 'chess' ? 'selected' : ''} type="button" onClick={() => setGame('chess')}>
          <span>02</span>
          <strong>Slow Chess</strong>
          <small>Two players · one thoughtful move</small>
        </button>
      </nav>

      {game === 'word' ? (
        <section className="word-game">
          <div className="word-instructions">
            <p className="section-label">Word Rush</p>
            <h2>{wordMode === 'solo' ? 'Race your own best score.' : 'Two players. One shared clock.'}</h2>
            <div className="word-mode-switch" aria-label="Word Rush mode">
              <button
                className={wordMode === 'solo' ? 'selected' : ''}
                type="button"
                onClick={() => {
                  setWordMode('solo');
                  startWordRound();
                }}
              >
                Solo
              </button>
              <button
                className={wordMode === 'duo' ? 'selected' : ''}
                type="button"
                onClick={() => {
                  setWordMode('duo');
                  startWordRound();
                }}
              >
                Duo
              </button>
            </div>
            <div className="letter-rack" aria-label={`Letters ${rack.join(' ')}`}>
              {rack.map((letter, index) => (
                <button
                  className={selectedTiles.includes(index) ? 'tile-used' : ''}
                  type="button"
                  disabled={!running || selectedTiles.includes(index)}
                  key={`${letter}-${index}`}
                  onClick={() => selectTile(letter, index)}
                  aria-label={`${letter}${selectedTiles.includes(index) ? ', selected' : ''}`}
                >
                  {letter}
                </button>
              ))}
            </div>
            <div className="tile-actions">
              <button type="button" onClick={clearTiles} disabled={!word}>
                Clear
              </button>
              <button type="button" onClick={randomizeTiles}>
                Randomize tiles
              </button>
            </div>
            <p>
              Make a word of at least three letters. Each accepted word scores one point per letter and immediately
              refreshes the rack. In Duo mode, players alternate plays until the shared timer ends.
            </p>
            {wordMode === 'duo' && (
              <div className="game-buddy-status">
                <div className="opponent-mark">MP</div>
                <div>
                  <strong>Playing with Maya</strong>
                  <span>{seconds === 0 ? 'The round is complete.' : `Player ${currentPlayer}'s turn`}</span>
                </div>
              </div>
            )}
          </div>
          <div className="word-play">
            <div className="timer-score word-scores">
              <div>
                <span>Time</span>
                <strong>
                  {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
                </strong>
              </div>
              <div>
                <span>{wordMode === 'solo' ? 'Your score' : 'Player 1 · You'}</span>
                <strong>{scores[0]}</strong>
              </div>
              {wordMode === 'duo' && (
                <div>
                  <span>Player 2 · Maya</span>
                  <strong>{scores[1]}</strong>
                </div>
              )}
            </div>
            <label className="word-entry">
              <span className="sr-only">Type a word or choose tiles</span>
              <input
                value={word}
                onChange={(event) => typeWord(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addWord();
                }}
                readOnly={!running || seconds === 0}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={running ? 'Choose tiles to build a word…' : 'Press start when ready'}
              />
              <button type="button" onClick={addWord} disabled={!running || word.length < 3}>
                Play word
              </button>
            </label>
            {!running && seconds > 0 && (
              <button className="start-game" type="button" onClick={startWordRound}>
                Start 60-second round
              </button>
            )}
            {seconds === 0 && (
              <div className="round-finished" role="status">
                <strong>
                  {wordMode === 'solo'
                    ? `Round complete · ${scores[0]} points`
                    : scores[0] === scores[1]
                      ? `Tie game · ${scores[0]} points each`
                      : `${scores[0] > scores[1] ? 'You win' : 'Maya wins'} · ${Math.max(...scores)} points`}
                </strong>
                <span>
                  {words.length} accepted words.{' '}
                  {wordMode === 'duo'
                    ? 'Both scores and the winner were posted to your Buddy Room.'
                    : 'Try again to beat your score.'}
                </span>
                <button type="button" onClick={startWordRound}>
                  Play again
                </button>
              </div>
            )}
            <div className="found-words">
              {words.map((item, index) => (
                <span className={item.player === 2 ? 'player-two-word' : ''} key={`${item.word}-${index}`}>
                  {wordMode === 'duo' ? `P${item.player} · ` : ''}
                  {item.word}
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="chess-game">
          <div className="chess-copy">
            <p className="section-label">Slow Chess</p>
            <h2>One move now. Another whenever you return.</h2>
            <p>
              This is two-player correspondence chess without the pressure. You each have 24 hours per move. Every
              confirmed move notifies the other player in the Buddy Room and through their enabled channels.
            </p>
            <div className="chess-opponent">
              <div className="opponent-mark">MP</div>
              <div>
                <strong>Maya P.</strong>
                <span>Last move · 2 hours ago</span>
              </div>
            </div>
            <div className="move-status" role="status">
              {moveSent ? (
                <>
                  <strong>Move sent.</strong>
                  <span>Maya will be notified. Your clock is paused.</span>
                </>
              ) : (
                <>
                  <strong>Your turn</strong>
                  <span>21 hours, 14 minutes remaining</span>
                </>
              )}
            </div>
          </div>
          <div className="chess-board-wrap">
            <div className="chess-board" aria-label="Slow Chess board">
              {board.flatMap((row, rowIndex) =>
                row.map((piece, colIndex) => (
                  <button
                    className={(rowIndex + colIndex) % 2 ? 'dark' : 'light'}
                    type="button"
                    key={`${rowIndex}-${colIndex}`}
                    aria-label={`${piece || 'Empty'} square ${rowIndex + 1}, ${colIndex + 1}`}
                  >
                    <span className={piece === piece.toUpperCase() ? 'white-piece' : 'black-piece'}>
                      {piece.toUpperCase()}
                    </span>
                  </button>
                )),
              )}
            </div>
            <button className="send-move" type="button" disabled={moveSent} onClick={() => setMoveSent(true)}>
              {moveSent ? 'Waiting for Maya' : 'Confirm move'} <span aria-hidden="true">→</span>
            </button>
            {moveSent && (
              <p className="move-notification" role="status">
                Maya was notified that it is her turn. You’ll be notified when she moves.
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

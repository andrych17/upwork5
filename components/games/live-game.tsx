'use client';

// Picks the page for the session's game. Only games in PLAYABLE get here (live-room.tsx checks).
import DrawAndGuess from '@/components/games/draw-and-guess';
import GuessWhosStory from '@/components/games/guess-whose-story';
import InventIt from '@/components/games/invent-it';
import PuzzleRoom from '@/components/games/puzzle-room';
import type { GameKey } from '@/lib/live-games';

export default function LiveGame({ game, sessionId, me }: { game: GameKey; sessionId: string; me: string }) {
  if (game === 'invent-it') return <InventIt sessionId={sessionId} me={me} />;
  if (game === 'guess-whose-story') return <GuessWhosStory sessionId={sessionId} me={me} />;
  if (game === 'puzzle-room') return <PuzzleRoom sessionId={sessionId} me={me} />;
  if (game === 'draw-and-guess') return <DrawAndGuess sessionId={sessionId} me={me} />;
  return null;
}

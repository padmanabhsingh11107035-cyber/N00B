import React from 'react';
import { LudoGameModule } from '../ludo/LudoGameModule';

interface LudoGameProps {
  currentUser: { id: string; username: string; avatar?: string };
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  // 'bot' (default): you vs computer players. 'pass_play': friends sharing this device.
  entryMode?: 'bot' | 'pass_play';
  initialPlayerCount?: number;
  difficulty?: 'easy' | 'normal' | 'hard';
}

// The Games screen's Ludo. The game itself lives in ../ludo; this only adapts it to the Games
// screen's contract — it reports a single win/loss when the player continues from the result
// screen, and the Games screen then pays out NOOB Points as for every other game.
export const LudoGame: React.FC<LudoGameProps> = ({ currentUser, onGameOver, entryMode = 'bot', initialPlayerCount, difficulty }) => (
  <LudoGameModule
    currentUser={currentUser}
    entryMode={entryMode}
    initialPlayerCount={initialPlayerCount}
    difficulty={difficulty}
    onFinished={onGameOver}
  />
);

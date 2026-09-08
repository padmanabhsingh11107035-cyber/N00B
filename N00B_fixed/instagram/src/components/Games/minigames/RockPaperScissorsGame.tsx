import React, { useState } from 'react';

interface RockPaperScissorsGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  opponentName?: string;
  bestOf?: number;
  // false = Pass and Play: Player 2 picks for real (hidden from Player 1
  // until reveal) instead of the bot choosing randomly.
  vsBot?: boolean;
}

const CHOICES = [
  { id: 'rock', name: 'Rock', emoji: '✊', beats: 'scissors' },
  { id: 'paper', name: 'Paper', emoji: '✋', beats: 'rock' },
  { id: 'scissors', name: 'Scissors', emoji: '✌️', beats: 'paper' }
];

export const RockPaperScissorsGame: React.FC<RockPaperScissorsGameProps> = ({
  onGameOver,
  opponentName = 'AI Bot',
  bestOf = 3,
  vsBot = true
}) => {
  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [playerChoice, setPlayerChoice] = useState<typeof CHOICES[0] | null>(null);
  const [opponentChoice, setOpponentChoice] = useState<typeof CHOICES[0] | null>(null);
  const [roundResult, setRoundResult] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [awaitingPlayer2, setAwaitingPlayer2] = useState(false);

  const targetWins = Math.ceil(bestOf / 2);
  const matchOver = playerScore >= targetWins || opponentScore >= targetWins;

  const resolveRound = (p1: typeof CHOICES[0], p2: typeof CHOICES[0]) => {
    setOpponentChoice(p2);

    let newPlayerScore = playerScore;
    let newOpponentScore = opponentScore;
    let resultText = '';

    if (p1.id === p2.id) {
      resultText = 'Round Tie!';
    } else if (p1.beats === p2.id) {
      newPlayerScore += 1;
      setPlayerScore(newPlayerScore);
      resultText = vsBot ? 'You took this round! (+1)' : 'Player 1 took this round! (+1)';
    } else {
      newOpponentScore += 1;
      setOpponentScore(newOpponentScore);
      resultText = `${vsBot ? opponentName : 'Player 2'} took this round!`;
    }

    setRoundResult(resultText);
    setIsRevealing(false);

    if (newPlayerScore >= targetWins) {
      setTimeout(() => onGameOver('win', 100), 1000);
    } else if (newOpponentScore >= targetWins) {
      setTimeout(() => onGameOver(vsBot ? 'loss' : 'win', vsBot ? 0 : 100), 1000);
    }
  };

  const handleChoose = (choice: typeof CHOICES[0]) => {
    if (isRevealing || matchOver) return;

    if (!vsBot && !awaitingPlayer2) {
      // Player 1's pick — hide it and hand off to Player 2
      setPlayerChoice(choice);
      setOpponentChoice(null);
      setRoundResult(null);
      setAwaitingPlayer2(true);
      return;
    }

    if (!vsBot && awaitingPlayer2) {
      // Player 2's pick — reveal both at once
      setIsRevealing(true);
      setAwaitingPlayer2(false);
      setTimeout(() => resolveRound(playerChoice!, choice), 500);
      return;
    }

    // vs Bot
    setIsRevealing(true);
    setPlayerChoice(choice);
    setOpponentChoice(null);
    setRoundResult(null);
    setTimeout(() => {
      const randomBot = CHOICES[Math.floor(Math.random() * CHOICES.length)];
      resolveRound(choice, randomBot);
    }, 600);
  };

  if (!vsBot && awaitingPlayer2) {
    return (
      <div className="flex flex-col items-center justify-center p-6 w-full max-w-sm mx-auto text-center space-y-4">
        <div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-400 text-amber-300 flex items-center justify-center text-3xl">
          🤫
        </div>
        <h3 className="text-lg font-black text-white">Player 1 has chosen!</h3>
        <p className="text-sm font-bold text-amber-300">📱 Pass the device to Player 2</p>
        <div className="grid grid-cols-3 gap-3 w-full pt-2">
          {CHOICES.map((c) => (
            <button
              key={c.id}
              onClick={() => handleChoose(c)}
              className="flex flex-col items-center gap-1 p-3 bg-zinc-900 hover:bg-zinc-800 active:bg-[#00FF66] active:text-black border border-zinc-700/60 rounded-2xl transition-all cursor-pointer hover:scale-105"
            >
              <span className="text-2xl">{c.emoji}</span>
              <span className="text-xs font-bold text-white">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
      {/* Score Header */}
      <div className="flex items-center justify-between w-full mb-4 px-4 py-3 bg-zinc-900/90 rounded-2xl border border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white">{vsBot ? 'You' : 'Player 1'}</span>
          <span className="text-lg font-black text-[#00FF66]">{playerScore}</span>
        </div>
        <div className="text-xs font-black text-zinc-400 bg-zinc-800 px-3 py-1 rounded-full">
          First to {targetWins}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-black text-pink-400">{opponentScore}</span>
          <span className="text-xs font-bold text-white">{vsBot ? opponentName : 'Player 2'}</span>
        </div>
      </div>

      {/* Duel Arena */}
      <div className="w-full bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 mb-4 flex items-center justify-around shadow-inner min-h-[140px]">
        {/* Player Chosen */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-[#00FF66]/40 flex items-center justify-center text-3xl shadow-[0_0_10px_rgba(0,255,102,0.2)]">
            {playerChoice && !isRevealing ? playerChoice.emoji : playerChoice ? '❔' : '❔'}
          </div>
          <span className="text-[11px] font-bold text-zinc-300">{vsBot ? 'You' : 'Player 1'}</span>
        </div>

        <span className="text-sm font-black text-zinc-600">VS</span>

        {/* Opponent Chosen */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-pink-500/40 flex items-center justify-center text-3xl shadow-[0_0_10px_rgba(236,72,153,0.2)]">
            {isRevealing ? '🤔' : opponentChoice ? opponentChoice.emoji : '❔'}
          </div>
          <span className="text-[11px] font-bold text-zinc-300">{vsBot ? opponentName : 'Player 2'}</span>
        </div>
      </div>

      {/* Round result banner */}
      {roundResult && (
        <div className="mb-4 text-center animate-bounce">
          <span className="text-xs font-extrabold text-amber-300 bg-amber-500/20 px-3 py-1 rounded-full border border-amber-500/30">
            {roundResult}
          </span>
        </div>
      )}

      {/* Choice Buttons */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {CHOICES.map((c) => (
          <button
            key={c.id}
            onClick={() => handleChoose(c)}
            disabled={isRevealing || matchOver}
            className="flex flex-col items-center gap-1 p-3 bg-zinc-900 hover:bg-zinc-800 active:bg-[#00FF66] active:text-black border border-zinc-700/60 rounded-2xl transition-all cursor-pointer hover:scale-105"
          >
            <span className="text-2xl">{c.emoji}</span>
            <span className="text-xs font-bold text-white">{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

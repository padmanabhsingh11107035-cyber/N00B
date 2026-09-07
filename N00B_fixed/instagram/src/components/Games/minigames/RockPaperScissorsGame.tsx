import React, { useState } from 'react';
import { Bot, User as UserIcon, Sparkles } from 'lucide-react';

interface RockPaperScissorsGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  opponentName?: string;
  bestOf?: number;
}

const CHOICES = [
  { id: 'rock', name: 'Rock', emoji: '✊', beats: 'scissors' },
  { id: 'paper', name: 'Paper', emoji: '✋', beats: 'rock' },
  { id: 'scissors', name: 'Scissors', emoji: '✌️', beats: 'paper' }
];

export const RockPaperScissorsGame: React.FC<RockPaperScissorsGameProps> = ({
  onGameOver,
  opponentName = 'AI Bot',
  bestOf = 3
}) => {
  const [playerScore, setPlayerScore] = useState(0);
  const [botScore, setBotScore] = useState(0);
  const [playerChoice, setPlayerChoice] = useState<typeof CHOICES[0] | null>(null);
  const [botChoice, setBotChoice] = useState<typeof CHOICES[0] | null>(null);
  const [roundResult, setRoundResult] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);

  const targetWins = Math.ceil(bestOf / 2);

  const handleChoose = (choice: typeof CHOICES[0]) => {
    if (isRevealing) return;

    setIsRevealing(true);
    setPlayerChoice(choice);
    setBotChoice(null);
    setRoundResult(null);

    // Bot decides
    setTimeout(() => {
      const randomBot = CHOICES[Math.floor(Math.random() * CHOICES.length)];
      setBotChoice(randomBot);

      let newPlayerScore = playerScore;
      let newBotScore = botScore;
      let resultText = '';

      if (choice.id === randomBot.id) {
        resultText = 'Round Tie!';
      } else if (choice.beats === randomBot.id) {
        newPlayerScore += 1;
        setPlayerScore(newPlayerScore);
        resultText = 'You took this round! (+1)';
      } else {
        newBotScore += 1;
        setBotScore(newBotScore);
        resultText = `${opponentName} took this round!`;
      }

      setRoundResult(resultText);
      setIsRevealing(false);

      // Check if match won
      if (newPlayerScore >= targetWins) {
        setTimeout(() => onGameOver('win', 100), 1000);
      } else if (newBotScore >= targetWins) {
        setTimeout(() => onGameOver('loss', 0), 1000);
      }
    }, 600);
  };

  return (
    <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
      {/* Score Header */}
      <div className="flex items-center justify-between w-full mb-4 px-4 py-3 bg-zinc-900/90 rounded-2xl border border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white">You</span>
          <span className="text-lg font-black text-[#00FF66]">{playerScore}</span>
        </div>
        <div className="text-xs font-black text-zinc-400 bg-zinc-800 px-3 py-1 rounded-full">
          First to {targetWins}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-black text-pink-400">{botScore}</span>
          <span className="text-xs font-bold text-white">{opponentName}</span>
        </div>
      </div>

      {/* Duel Arena */}
      <div className="w-full bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 mb-4 flex items-center justify-around shadow-inner min-h-[140px]">
        {/* Player Chosen */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-[#00FF66]/40 flex items-center justify-center text-3xl shadow-[0_0_10px_rgba(0,255,102,0.2)]">
            {playerChoice ? playerChoice.emoji : '❔'}
          </div>
          <span className="text-[11px] font-bold text-zinc-300">You</span>
        </div>

        <span className="text-sm font-black text-zinc-600">VS</span>

        {/* Bot Chosen */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-pink-500/40 flex items-center justify-center text-3xl shadow-[0_0_10px_rgba(236,72,153,0.2)]">
            {isRevealing ? '🤔' : botChoice ? botChoice.emoji : '❔'}
          </div>
          <span className="text-[11px] font-bold text-zinc-300">{opponentName}</span>
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
            disabled={isRevealing || playerScore >= targetWins || botScore >= targetWins}
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

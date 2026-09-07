import React, { useState } from 'react';
import { Sparkles, Check } from 'lucide-react';

interface WordleGuessGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
}

const WORDS_LIST = ['NOOBS', 'CYBER', 'PIXEL', 'GAMES', 'ARENA', 'LASER', 'LEVEL', 'POWER', 'SCORE', 'TURBO'];

export const WordleGuessGame: React.FC<WordleGuessGameProps> = ({ onGameOver }) => {
  const [targetWord] = useState(() => WORDS_LIST[Math.floor(Math.random() * WORDS_LIST.length)]);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [gameOver, setGameOver] = useState(false);

  const maxAttempts = 5;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentInput.length !== 5 || gameOver) return;

    const formatted = currentInput.toUpperCase();
    const newGuesses = [...guesses, formatted];
    setGuesses(newGuesses);
    setCurrentInput('');

    if (formatted === targetWord) {
      setGameOver(true);
      setTimeout(() => onGameOver('win', 100), 1000);
    } else if (newGuesses.length >= maxAttempts) {
      setGameOver(true);
      setTimeout(() => onGameOver('loss', 0), 1000);
    }
  };

  const getLetterStatus = (letter: string, idx: number, guess: string) => {
    if (targetWord[idx] === letter) return 'bg-[#00FF66] text-black border-[#00FF66] shadow-[0_0_8px_#00FF66]';
    if (targetWord.includes(letter)) return 'bg-amber-500 text-black border-amber-500';
    return 'bg-zinc-900 text-zinc-400 border-zinc-800';
  };

  return (
    <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
      <div className="flex items-center justify-between w-full mb-3 px-3 py-1.5 bg-zinc-900 rounded-xl border border-zinc-800 text-xs">
        <span className="font-bold text-zinc-300">Attempts: <strong className="text-[#00FF66]">{guesses.length} / {maxAttempts}</strong></span>
        <span className="text-zinc-500 font-bold">5-Letter Word</span>
      </div>

      {/* Grid of attempts */}
      <div className="space-y-2 mb-4">
        {Array.from({ length: maxAttempts }).map((_, rowIndex) => {
          const guess = guesses[rowIndex] || '';
          return (
            <div key={rowIndex} className="flex gap-2">
              {Array.from({ length: 5 }).map((_, colIndex) => {
                const char = guess[colIndex] || (rowIndex === guesses.length ? currentInput[colIndex] : '');
                const isSubmitted = rowIndex < guesses.length;
                const statusClass = isSubmitted ? getLetterStatus(char, colIndex, guess) : 'bg-zinc-950 border-zinc-800 text-white';

                return (
                  <div
                    key={colIndex}
                    className={`w-11 h-11 sm:w-12 sm:h-12 border-2 rounded-xl flex items-center justify-center text-lg font-black transition-all ${statusClass}`}
                  >
                    {char || ''}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Input Form */}
      {!gameOver && (
        <form onSubmit={handleSubmit} className="w-full flex gap-2">
          <input
            type="text"
            maxLength={5}
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            placeholder="Type 5 letters..."
            autoFocus
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-center font-black tracking-widest text-white text-sm uppercase focus:outline-none focus:border-[#00FF66]"
          />
          <button
            type="submit"
            disabled={currentInput.length !== 5}
            className="px-4 bg-[#00FF66] disabled:opacity-40 text-black font-black text-xs rounded-xl shadow-md cursor-pointer transition-all hover:scale-105"
          >
            <Check className="w-4 h-4" />
          </button>
        </form>
      )}

      {gameOver && (
        <p className="text-xs text-zinc-400 mt-2">
          Word was: <strong className="text-[#00FF66]">{targetWord}</strong>
        </p>
      )}
    </div>
  );
};

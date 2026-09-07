import React, { useState, useEffect } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';

interface MemoryMatchGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
}

const ICONS = ['🚀', '⚡', '💎', '🎮', '🔥', '👑'];

interface CardItem {
  id: number;
  icon: string;
  isFlipped: boolean;
  isMatched: boolean;
}

export const MemoryMatchGame: React.FC<MemoryMatchGameProps> = ({ onGameOver }) => {
  const [cards, setCards] = useState<CardItem[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [flipsCount, setFlipsCount] = useState(0);
  const [matchesFound, setMatchesFound] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    // Generate 12 shuffled cards (6 pairs)
    const deck: CardItem[] = [...ICONS, ...ICONS]
      .sort(() => Math.random() - 0.5)
      .map((icon, idx) => ({
        id: idx,
        icon,
        isFlipped: false,
        isMatched: false
      }));
    setCards(deck);
  }, []);

  const handleCardClick = (index: number) => {
    if (isLocked) return;
    const card = cards[index];
    if (card.isFlipped || card.isMatched) return;

    const newCards = [...cards];
    newCards[index].isFlipped = true;
    setCards(newCards);

    const newFlipped = [...flippedCards, index];
    setFlippedCards(newFlipped);

    if (newFlipped.length === 2) {
      setIsLocked(true);
      setFlipsCount((f) => f + 1);

      const [firstIdx, secondIdx] = newFlipped;
      if (cards[firstIdx].icon === cards[secondIdx].icon) {
        // Match!
        setTimeout(() => {
          newCards[firstIdx].isMatched = true;
          newCards[secondIdx].isMatched = true;
          setCards([...newCards]);
          setFlippedCards([]);
          setIsLocked(false);

          const newMatches = matchesFound + 1;
          setMatchesFound(newMatches);

          if (newMatches >= ICONS.length) {
            onGameOver('win', 100);
          }
        }, 500);
      } else {
        // No match -> flip back
        setTimeout(() => {
          newCards[firstIdx].isFlipped = false;
          newCards[secondIdx].isFlipped = false;
          setCards([...newCards]);
          setFlippedCards([]);
          setIsLocked(false);
        }, 900);
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-3 w-full max-w-sm mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between w-full mb-4 px-3 py-2 bg-zinc-900 rounded-xl border border-zinc-800">
        <span className="text-xs text-zinc-400 font-semibold">Pairs: <strong className="text-[#00FF66]">{matchesFound} / {ICONS.length}</strong></span>
        <span className="text-xs text-zinc-400 font-semibold">Flips: <strong className="text-white">{flipsCount}</strong></span>
      </div>

      {/* 4x3 Card Grid */}
      <div className="grid grid-cols-4 gap-2.5 w-full bg-zinc-950 p-4 rounded-3xl border border-zinc-800 shadow-xl">
        {cards.map((card, idx) => (
          <button
            key={card.id}
            onClick={() => handleCardClick(idx)}
            disabled={card.isFlipped || card.isMatched || isLocked}
            className={`h-16 rounded-2xl flex items-center justify-center text-2xl transition-all duration-300 transform cursor-pointer ${
              card.isFlipped || card.isMatched
                ? 'bg-zinc-900 border border-[#00FF66]/50 shadow-[0_0_10px_rgba(0,255,102,0.2)] rotate-0 scale-100'
                : 'bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/50 hover:scale-105'
            }`}
          >
            {card.isFlipped || card.isMatched ? card.icon : '❓'}
          </button>
        ))}
      </div>
    </div>
  );
};

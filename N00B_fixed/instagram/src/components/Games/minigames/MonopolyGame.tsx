import React, { useEffect, useRef, useState } from 'react';
import { Bot, User as UserIcon, Dices, Landmark } from 'lucide-react';

interface MonopolyGameProps {
  onGameOver: (result: 'win' | 'tie' | 'loss', finalScore: number) => void;
  // 'bot' (default): obviously just you vs bots — no per-slot toggle shown.
  // 'pass_play': multiple humans sharing this device — slots default to
  // human and can be toggled to bot for a mixed group.
  entryMode?: 'bot' | 'pass_play';
  initialPlayerCount?: number;
}

const PLAYER_COLORS = ['#00FF66', '#ec4899', '#38bdf8', '#f59e0b'];
const START_CASH = 1500;

type SquareType = 'go' | 'property' | 'chance' | 'jail' | 'free_parking' | 'go_to_jail';
interface Square {
  type: SquareType;
  name: string;
  price?: number;
  rent?: number;
  color?: string;
}

// Simplified 20-square board (real Monopoly's 40, halved for a quick mobile match)
const BOARD: Square[] = [
  { type: 'go', name: 'GO' },
  { type: 'property', name: 'Baltic Ave', price: 100, rent: 15, color: '#78350f' },
  { type: 'property', name: 'Vermont Ave', price: 120, rent: 18, color: '#78350f' },
  { type: 'chance', name: 'Chance' },
  { type: 'property', name: 'Oriental Ave', price: 140, rent: 20, color: '#0ea5e9' },
  { type: 'jail', name: 'Jail (Visiting)' },
  { type: 'property', name: 'Vermont St', price: 160, rent: 22, color: '#0ea5e9' },
  { type: 'property', name: 'Marvin Gdns', price: 180, rent: 26, color: '#a855f7' },
  { type: 'chance', name: 'Chance' },
  { type: 'property', name: 'Ventnor Ave', price: 200, rent: 30, color: '#a855f7' },
  { type: 'free_parking', name: 'Free Parking' },
  { type: 'property', name: 'Atlantic Ave', price: 220, rent: 34, color: '#f97316' },
  { type: 'property', name: 'Illinois Ave', price: 240, rent: 38, color: '#f97316' },
  { type: 'chance', name: 'Chance' },
  { type: 'property', name: 'Kentucky Ave', price: 260, rent: 42, color: '#ef4444' },
  { type: 'go_to_jail', name: 'Go To Jail' },
  { type: 'property', name: 'Pacific Ave', price: 280, rent: 46, color: '#ef4444' },
  { type: 'property', name: 'Park Place', price: 320, rent: 55, color: '#1d4ed8' },
  { type: 'chance', name: 'Chance' },
  { type: 'property', name: 'Boardwalk', price: 400, rent: 70, color: '#1d4ed8' }
];

const CHANCE_CARDS = [
  { text: 'Bank error in your favor! Collect $50.', amount: 50 },
  { text: 'You inherited $100.', amount: 100 },
  { text: 'Pay a $40 speeding fine.', amount: -40 },
  { text: 'School fees due. Pay $50.', amount: -50 },
  { text: 'Your investment paid off! Collect $75.', amount: 75 },
  { text: 'Pay for repairs: $60.', amount: -60 }
];

// Grid positions for the 20 squares around a hollow 6x6 grid
const GRID_POS: [number, number][] = [
  [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [5, 0],
  [4, 0], [3, 0], [2, 0], [1, 0], [0, 0],
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5],
  [1, 5], [2, 5], [3, 5], [4, 5]
];

// Non-property squares get their own accent color + icon since they have no
// property-group color of their own (classic Monopoly corner/special tiles).
const SPECIAL_STYLE: Record<string, { icon: string; color: string }> = {
  go: { icon: '➡️', color: '#16a34a' },
  jail: { icon: '🔒', color: '#52525b' },
  chance: { icon: '❓', color: '#a855f7' },
  free_parking: { icon: '🅿️', color: '#0284c7' },
  go_to_jail: { icon: '🚔', color: '#dc2626' }
};

export const MonopolyGame: React.FC<MonopolyGameProps> = ({ onGameOver, entryMode = 'bot', initialPlayerCount }) => {
  const [phase, setPhase] = useState<'setup' | 'playing'>('setup');
  const [numPlayers, setNumPlayers] = useState(initialPlayerCount || 2);
  const [playerTypes, setPlayerTypes] = useState<('human' | 'bot')[]>(() => {
    const n = initialPlayerCount || 2;
    return Array.from({ length: n }, (_, i) => (i === 0 ? 'human' : entryMode === 'pass_play' ? 'human' : 'bot'));
  });
  const [cash, setCash] = useState<number[]>([]);
  const [positions, setPositions] = useState<number[]>([]);
  const [owned, setOwned] = useState<Record<number, number>>({}); // squareIndex -> playerIndex
  const [bankrupt, setBankrupt] = useState<boolean[]>([]);
  const [inJail, setInJail] = useState<number[]>([]); // turns remaining in jail per player
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [log, setLog] = useState('');
  const [pendingBuy, setPendingBuy] = useState<number | null>(null);
  const [winner, setWinner] = useState<number | null>(null);
  const hasReported = useRef(false);

  const updatePlayerCount = (n: number) => {
    setNumPlayers(n);
    setPlayerTypes((prev) => {
      const next = [...prev];
      while (next.length < n) next.push(entryMode === 'pass_play' ? 'human' : 'bot');
      return next.slice(0, n).map((t, i) => (i === 0 ? 'human' : t));
    });
  };

  const startGame = () => {
    setCash(Array(numPlayers).fill(START_CASH));
    setPositions(Array(numPlayers).fill(0));
    setOwned({});
    setBankrupt(Array(numPlayers).fill(false));
    setInJail(Array(numPlayers).fill(0));
    setCurrentPlayer(0);
    setWinner(null);
    setLog('Player 1, roll the dice!');
    hasReported.current = false;
    setPhase('playing');
  };

  const nextActivePlayer = (from: number, bankruptArr: boolean[] = bankrupt) => {
    let next = (from + 1) % numPlayers;
    let guard = 0;
    while (bankruptArr[next] && guard < numPlayers) {
      next = (next + 1) % numPlayers;
      guard++;
    }
    return next;
  };

  // Resolves bankruptcy/win from a resulting cash array, otherwise clears the
  // dice and moves to the next player. Called explicitly at the end of every
  // turn path (roll, buy, pass, jail) so the turn always advances — no reliance
  // on a watcher effect keyed on state that may not change on a given turn.
  const checkBankruptcyThenAdvance = (cashArr: number[]) => {
    const newBankrupt = bankrupt.map((b, i) => b || cashArr[i] < 0);
    setBankrupt(newBankrupt);
    const activeCount = newBankrupt.filter((b) => !b).length;
    if (activeCount <= 1) {
      const lastStanding = newBankrupt.findIndex((b) => !b);
      setWinner(lastStanding === -1 ? 0 : lastStanding);
      return;
    }
    if (newBankrupt[0]) {
      setWinner(nextActivePlayer(0, newBankrupt));
      return;
    }
    setDiceValue(null);
    setPendingBuy(null);
    setCurrentPlayer((prev) => nextActivePlayer(prev, newBankrupt));
  };

  const applyLanding = (
    playerIdx: number,
    squareIdx: number,
    currentCash: number[],
    currentOwned: Record<number, number>
  ) => {
    const square = BOARD[squareIdx];
    const nextCash = [...currentCash];
    const nextOwned = { ...currentOwned };
    let log = '';
    let needsBuyDecision = false;
    let jailOverride = false;

    if (square.type === 'property') {
      const ownerIdx = nextOwned[squareIdx];
      if (ownerIdx === undefined) {
        if (playerIdx === 0) {
          needsBuyDecision = true;
          log = `Landed on ${square.name} ($${square.price}) — buy it?`;
        } else if (nextCash[playerIdx] - (square.price || 0) >= 100) {
          nextOwned[squareIdx] = playerIdx;
          nextCash[playerIdx] -= square.price || 0;
          log = `Player ${playerIdx + 1} bought ${square.name}.`;
        } else {
          log = `Player ${playerIdx + 1} landed on ${square.name} but passed.`;
        }
      } else if (ownerIdx !== playerIdx) {
        const rent = square.rent || 0;
        nextCash[playerIdx] -= rent;
        nextCash[ownerIdx] += rent;
        log = `Player ${playerIdx + 1} paid $${rent} rent to Player ${ownerIdx + 1} for ${square.name}.`;
      } else {
        log = `Player ${playerIdx + 1} landed on their own property.`;
      }
    } else if (square.type === 'chance') {
      const card = CHANCE_CARDS[Math.floor(Math.random() * CHANCE_CARDS.length)];
      nextCash[playerIdx] += card.amount;
      log = `Player ${playerIdx + 1}: ${card.text}`;
    } else if (square.type === 'go_to_jail') {
      jailOverride = true;
      log = `Player ${playerIdx + 1} was sent to jail!`;
    } else if (square.type === 'go') {
      log = `Player ${playerIdx + 1} landed on GO.`;
    } else {
      log = `Player ${playerIdx + 1} landed on ${square.name}.`;
    }

    return { cash: nextCash, owned: nextOwned, log, needsBuyDecision, jailOverride };
  };

  const rollDice = () => {
    if (isRolling || winner !== null || pendingBuy !== null) return;

    if (inJail[currentPlayer] > 0) {
      const newInJail = [...inJail];
      newInJail[currentPlayer] -= 1;
      setInJail(newInJail);
      setLog(`Player ${currentPlayer + 1} is in jail (${newInJail[currentPlayer]} turn(s) left).`);
      setTimeout(() => checkBankruptcyThenAdvance(cash), 800);
      return;
    }

    setIsRolling(true);
    setTimeout(() => {
      const roll = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
      setDiceValue(roll);

      const newPos = (positions[currentPlayer] + roll) % BOARD.length;
      const passedGo = newPos < positions[currentPlayer];
      const cashAfterGo = [...cash];
      if (passedGo) cashAfterGo[currentPlayer] += 200;

      const newPositions = [...positions];
      newPositions[currentPlayer] = newPos;

      const result = applyLanding(currentPlayer, newPos, cashAfterGo, owned);

      let finalPositions = newPositions;
      let finalInJail = inJail;
      if (result.jailOverride) {
        finalPositions = [...newPositions];
        finalPositions[currentPlayer] = 5;
        finalInJail = [...inJail];
        finalInJail[currentPlayer] = 2;
      }

      setPositions(finalPositions);
      setCash(result.cash);
      setOwned(result.owned);
      setInJail(finalInJail);
      setLog(result.log);
      setIsRolling(false);

      if (result.needsBuyDecision) {
        setPendingBuy(newPos);
        return;
      }
      setTimeout(() => checkBankruptcyThenAdvance(result.cash), 900);
    }, 500);
  };

  useEffect(() => {
    if (playerTypes[currentPlayer] === 'bot' && diceValue === null && !isRolling && winner === null && phase === 'playing') {
      const timer = setTimeout(() => rollDice(), 700);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayer, phase, winner]);

  useEffect(() => {
    if (winner !== null && !hasReported.current) {
      hasReported.current = true;
      const userWon = winner === 0;
      setTimeout(() => onGameOver(userWon ? 'win' : 'loss', userWon ? 100 : 0), 1200);
    }
  }, [winner, onGameOver]);

  const buyCurrentProperty = () => {
    if (pendingBuy === null) return;
    const square = BOARD[pendingBuy];
    const newCash = [...cash];
    newCash[0] -= square.price || 0;
    setCash(newCash);
    setOwned((o) => ({ ...o, [pendingBuy]: 0 }));
    setLog(`You bought ${square.name}!`);
    setTimeout(() => checkBankruptcyThenAdvance(newCash), 400);
  };

  const skipBuy = () => {
    setLog(`You passed on ${BOARD[pendingBuy!].name}.`);
    setTimeout(() => checkBankruptcyThenAdvance(cash), 400);
  };

  if (phase === 'setup') {
    return (
      <div className="w-full flex flex-col items-center gap-4 p-3">
        <span className="text-xs font-black text-white uppercase tracking-wider">How many players?</span>
        <div className="flex items-center gap-2 justify-center">
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => updatePlayerCount(n)}
              className={`w-9 h-9 rounded-xl font-bold text-sm cursor-pointer transition-all ${
                numPlayers === n ? 'bg-[#00FF66] text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="w-full space-y-1.5">
          {playerTypes.map((type, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-800">
              <span className="text-xs font-bold flex items-center gap-1.5" style={{ color: PLAYER_COLORS[i] }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PLAYER_COLORS[i] }} />
                {i === 0 ? 'You' : `Player ${i + 1}`}
              </span>
              {i === 0 ? (
                <span className="text-[10px] text-zinc-500 font-semibold">Human</span>
              ) : entryMode === 'bot' ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 flex items-center gap-1">
                  <Bot className="w-3 h-3" /> Bot
                </span>
              ) : (
                <button
                  onClick={() =>
                    setPlayerTypes((prev) => prev.map((t, idx) => (idx === i ? (t === 'bot' ? 'human' : 'bot') : t)))
                  }
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 hover:bg-zinc-700 cursor-pointer flex items-center gap-1"
                >
                  {type === 'bot' ? <Bot className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                  {type === 'bot' ? 'Bot' : 'Pass & Play'}
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-zinc-500 text-center leading-relaxed">
          Simplified rules: 20-square board, no trading/houses/mortgages. Buy properties, collect rent, avoid bankruptcy.
        </p>
        <button
          onClick={startGame}
          className="w-full py-2.5 rounded-2xl bg-[#00FF66] text-black font-bold text-xs cursor-pointer hover:bg-[#00FF66]/90"
        >
          Start Game
        </button>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center gap-3 p-2">
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {cash.map((c, i) => (
          <div
            key={i}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 border ${
              currentPlayer === i && winner === null ? 'border-white' : 'border-transparent opacity-60'
            } ${bankrupt[i] ? 'line-through opacity-30' : ''}`}
            style={{ backgroundColor: `${PLAYER_COLORS[i]}22`, color: PLAYER_COLORS[i] }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: PLAYER_COLORS[i] }} />
            {i === 0 ? 'You' : `P${i + 1}`}: ${c}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-6 grid-rows-6 gap-1 w-full max-w-[400px] aspect-square bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800 shadow-inner">
        {/* Center panel: board wordmark + live turn status, filling the hollow middle */}
        <div
          className="flex flex-col items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-zinc-900 to-black border border-zinc-800"
          style={{ gridColumn: '2 / 6', gridRow: '2 / 6' }}
        >
          <Landmark className="w-6 h-6 text-amber-400/80" />
          <span className="text-[13px] sm:text-sm font-black tracking-wider text-white">MONOPOLY</span>
          <span className="text-[9px] text-zinc-500 font-semibold">NOOB Edition</span>
          {diceValue !== null && (
            <span className="mt-1 px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700 text-[11px] font-black text-[#00FF66]">
              🎲 {diceValue}
            </span>
          )}
        </div>

        {BOARD.map((square, boardIdx) => {
          const [row, col] = GRID_POS[boardIdx];
          const ownerIdx = owned[boardIdx];
          const tokensHere = positions.map((p, i) => (p === boardIdx ? i : -1)).filter((i) => i !== -1);
          const accentColor = square.color || SPECIAL_STYLE[square.type]?.color || '#3f3f46';
          const icon = SPECIAL_STYLE[square.type]?.icon;
          return (
            <div
              key={boardIdx}
              className="relative flex flex-col overflow-hidden rounded-md bg-zinc-900"
              style={{
                gridColumn: col + 1,
                gridRow: row + 1,
                boxShadow: ownerIdx !== undefined ? `inset 0 0 0 2px ${PLAYER_COLORS[ownerIdx]}` : 'inset 0 0 0 1px #27272a'
              }}
            >
              <div className="w-full h-[5px] sm:h-2 shrink-0" style={{ backgroundColor: accentColor }} />
              <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center px-0.5 text-center gap-0.5">
                {icon && <span className="text-[9px] leading-none">{icon}</span>}
                <span className="text-[6.5px] sm:text-[7.5px] font-bold text-zinc-200 leading-[1.05] line-clamp-2">
                  {square.name}
                </span>
                {square.price && <span className="text-[6px] sm:text-[6.5px] text-zinc-500 font-semibold">${square.price}</span>}
              </div>
              {tokensHere.length > 0 && (
                <div className="absolute bottom-0.5 left-0 right-0 flex gap-0.5 flex-wrap justify-center px-0.5">
                  {tokensHere.map((i) => (
                    <span
                      key={i}
                      className="w-2.5 h-2.5 rounded-full border border-black flex items-center justify-center text-[5.5px] font-black text-black leading-none"
                      style={{ backgroundColor: PLAYER_COLORS[i] }}
                    >
                      {i === 0 ? 'Y' : i + 1}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-zinc-400 text-center min-h-[14px]">{log}</p>

      {winner !== null ? (
        <p className="text-sm font-black text-white animate-bounce">
          {winner === 0 ? '🎉 You Win!' : `Player ${winner + 1} Wins!`}
        </p>
      ) : pendingBuy !== null ? (
        <div className="flex gap-2">
          <button onClick={buyCurrentProperty} className="px-4 py-2 rounded-xl bg-[#00FF66] text-black font-bold text-xs cursor-pointer">
            Buy ${BOARD[pendingBuy].price}
          </button>
          <button onClick={skipBuy} className="px-4 py-2 rounded-xl bg-zinc-800 text-white font-bold text-xs cursor-pointer">
            Pass
          </button>
        </div>
      ) : (
        <button
          onClick={rollDice}
          disabled={isRolling || playerTypes[currentPlayer] === 'bot'}
          className="px-6 py-2.5 rounded-2xl bg-[#00FF66] text-black font-bold text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Dices className="w-4 h-4" />
          {playerTypes[currentPlayer] === 'bot' ? `Player ${currentPlayer + 1} is rolling...` : diceValue !== null ? `Rolled ${diceValue}` : 'Roll Dice'}
        </button>
      )}
    </div>
  );
};

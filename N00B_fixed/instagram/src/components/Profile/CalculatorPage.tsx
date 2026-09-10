import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Delete } from 'lucide-react';

interface CalculatorPageProps {
  onClose: () => void;
}

type Operator = '+' | '−' | '×' | '÷';

interface CalcState {
  display: string;
  expression: string;
  previousValue: number | null;
  operator: Operator | null;
  waitingForNewValue: boolean;
}

const INITIAL_STATE: CalcState = {
  display: '0',
  expression: '',
  previousValue: null,
  operator: null,
  waitingForNewValue: false
};

function calculate(a: number, b: number, op: Operator): number {
  switch (op) {
    case '+':
      return a + b;
    case '−':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      return b === 0 ? NaN : a / b;
  }
}

// Trims floating-point noise (0.1 + 0.2) and keeps the display readable.
function formatValue(value: number): string {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 'Error';
  const rounded = Math.round(value * 1e10) / 1e10;
  const str = rounded.toString();
  return str.length > 12 ? rounded.toExponential(5) : str;
}

// Every handler below reads and writes the whole state object in one
// functional setState call, so rapid input (fast typing/tapping) can never
// act on a stale `display`/`operator` from a previous render.
export const CalculatorPage: React.FC<CalculatorPageProps> = ({ onClose }) => {
  const [state, setState] = useState<CalcState>(INITIAL_STATE);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [pulseEquals, setPulseEquals] = useState(false);

  const press = (key: string) => {
    setFlashKey(key);
    setTimeout(() => setFlashKey((k) => (k === key ? null : k)), 150);
  };

  const inputDigit = (digit: string) => {
    setState((prev) => {
      if (prev.waitingForNewValue) {
        return { ...prev, display: digit, waitingForNewValue: false };
      }
      if (prev.display === '0') return { ...prev, display: digit };
      if (prev.display.replace('-', '').replace('.', '').length >= 12) return prev;
      return { ...prev, display: prev.display + digit };
    });
  };

  const inputDecimal = () => {
    setState((prev) => {
      if (prev.waitingForNewValue) return { ...prev, display: '0.', waitingForNewValue: false };
      if (prev.display.includes('.')) return prev;
      return { ...prev, display: prev.display + '.' };
    });
  };

  const clearAll = () => setState(INITIAL_STATE);

  const backspace = () => {
    setState((prev) => {
      if (prev.waitingForNewValue) return prev;
      if (prev.display.length <= 1 || (prev.display.length === 2 && prev.display.startsWith('-'))) {
        return { ...prev, display: '0' };
      }
      return { ...prev, display: prev.display.slice(0, -1) };
    });
  };

  const toggleSign = () => {
    setState((prev) => ({
      ...prev,
      display: prev.display.startsWith('-')
        ? prev.display.slice(1)
        : prev.display === '0'
          ? prev.display
          : `-${prev.display}`
    }));
  };

  const inputPercent = () => {
    setState((prev) => ({ ...prev, display: formatValue(parseFloat(prev.display) / 100) }));
  };

  const chooseOperator = (nextOp: Operator) => {
    setState((prev) => {
      const inputValue = parseFloat(prev.display);

      if (prev.previousValue !== null && prev.operator && !prev.waitingForNewValue) {
        const result = calculate(prev.previousValue, inputValue, prev.operator);
        return {
          display: formatValue(result),
          expression: `${formatValue(result)} ${nextOp}`,
          previousValue: result,
          operator: nextOp,
          waitingForNewValue: true
        };
      }

      return {
        ...prev,
        previousValue: inputValue,
        expression: `${formatValue(inputValue)} ${nextOp}`,
        operator: nextOp,
        waitingForNewValue: true
      };
    });
  };

  const handleEquals = () => {
    setState((prev) => {
      if (prev.operator === null || prev.previousValue === null) return prev;
      const inputValue = parseFloat(prev.display);
      const result = calculate(prev.previousValue, inputValue, prev.operator);
      setPulseEquals(true);
      setTimeout(() => setPulseEquals(false), 400);
      return {
        display: formatValue(result),
        expression: `${formatValue(prev.previousValue)} ${prev.operator} ${formatValue(inputValue)} =`,
        previousValue: null,
        operator: null,
        waitingForNewValue: true
      };
    });
  };

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key >= '0' && e.key <= '9') {
      press(e.key);
      inputDigit(e.key);
    } else if (e.key === '.') {
      press('.');
      inputDecimal();
    } else if (e.key === '+') {
      press('+');
      chooseOperator('+');
    } else if (e.key === '-') {
      press('−');
      chooseOperator('−');
    } else if (e.key === '*') {
      press('×');
      chooseOperator('×');
    } else if (e.key === '/') {
      e.preventDefault();
      press('÷');
      chooseOperator('÷');
    } else if (e.key === 'Enter' || e.key === '=') {
      press('=');
      handleEquals();
    } else if (e.key === 'Backspace') {
      backspace();
    } else if (e.key === 'Escape') {
      clearAll();
    } else if (e.key === '%') {
      inputPercent();
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const { display, expression, operator, waitingForNewValue } = state;

  const Key: React.FC<{
    label: string;
    onClick: () => void;
    variant?: 'digit' | 'op' | 'op-active' | 'func' | 'equals';
    span?: boolean;
  }> = ({ label, onClick, variant = 'digit', span }) => {
    const isFlashing = flashKey === label;
    const base =
      'relative flex items-center justify-center rounded-2xl text-xl sm:text-2xl font-bold select-none cursor-pointer transition-all duration-150 active:scale-90 h-16 sm:h-18';
    const variants: Record<string, string> = {
      digit: 'bg-white/[0.06] hover:bg-white/[0.1] text-white border border-white/10',
      func: 'bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/25',
      op: 'bg-[#00FF66]/10 hover:bg-[#00FF66]/20 text-[#00FF66] border border-[#00FF66]/25',
      'op-active': 'bg-[#00FF66] text-black border border-[#00FF66] shadow-[0_0_20px_rgba(0,255,102,0.5)]',
      equals:
        'bg-gradient-to-br from-[#00FF66] to-emerald-500 text-black shadow-[0_0_25px_rgba(0,255,102,0.45)] border border-emerald-300/40'
    };
    return (
      <button
        type="button"
        onClick={() => {
          press(label);
          onClick();
        }}
        className={`${base} ${variants[variant]} ${span ? 'col-span-2' : ''} ${
          isFlashing ? 'brightness-125 scale-95' : ''
        } ${variant === 'equals' && pulseEquals ? 'animate-pulse' : ''}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black text-white flex flex-col overflow-hidden">
      {/* Ambient glow blobs for depth — purely decorative */}
      <div className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-[#00FF66]/10 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-24 -right-16 w-80 h-80 rounded-full bg-violet-600/10 blur-[110px]" />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 p-4 sm:p-5 border-b border-white/10 shrink-0">
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="Back"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-black tracking-tight">Calculator</h1>
      </div>

      {/* Body */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm mx-auto space-y-5">
          {/* Display */}
          <div className="rounded-[28px] bg-white/[0.04] border border-white/10 backdrop-blur-xl px-6 py-8 shadow-[0_8px_40px_rgba(0,0,0,0.4)] overflow-hidden">
            <div className="h-5 text-right text-xs font-medium text-zinc-500 truncate tracking-wide">
              {expression || ' '}
            </div>
            <div
              className={`text-right font-black tracking-tight text-[#00FF66] drop-shadow-[0_0_18px_rgba(0,255,102,0.45)] truncate transition-all ${
                display.length > 9 ? 'text-4xl' : 'text-6xl'
              }`}
            >
              {display}
            </div>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
            <Key label="AC" variant="func" onClick={clearAll} />
            <Key label="+/-" variant="func" onClick={toggleSign} />
            <Key label="%" variant="func" onClick={inputPercent} />
            <Key
              label="÷"
              variant={operator === '÷' && waitingForNewValue ? 'op-active' : 'op'}
              onClick={() => chooseOperator('÷')}
            />

            <Key label="7" onClick={() => inputDigit('7')} />
            <Key label="8" onClick={() => inputDigit('8')} />
            <Key label="9" onClick={() => inputDigit('9')} />
            <Key
              label="×"
              variant={operator === '×' && waitingForNewValue ? 'op-active' : 'op'}
              onClick={() => chooseOperator('×')}
            />

            <Key label="4" onClick={() => inputDigit('4')} />
            <Key label="5" onClick={() => inputDigit('5')} />
            <Key label="6" onClick={() => inputDigit('6')} />
            <Key
              label="−"
              variant={operator === '−' && waitingForNewValue ? 'op-active' : 'op'}
              onClick={() => chooseOperator('−')}
            />

            <Key label="1" onClick={() => inputDigit('1')} />
            <Key label="2" onClick={() => inputDigit('2')} />
            <Key label="3" onClick={() => inputDigit('3')} />
            <Key
              label="+"
              variant={operator === '+' && waitingForNewValue ? 'op-active' : 'op'}
              onClick={() => chooseOperator('+')}
            />

            <Key label="0" onClick={() => inputDigit('0')} span />
            <Key label="." onClick={inputDecimal} />
            <Key label="=" variant="equals" onClick={handleEquals} />
          </div>

          {/* Backspace, tucked below the grid so the keypad stays a clean 4-col layout */}
          <button
            type="button"
            onClick={backspace}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-zinc-400 hover:text-white text-xs font-bold transition-colors cursor-pointer"
          >
            <Delete className="w-3.5 h-3.5" /> Backspace
          </button>
        </div>
      </div>
    </div>
  );
};

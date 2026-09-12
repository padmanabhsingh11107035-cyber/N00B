import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface BirthdayWheelPickerProps {
  value: string; // 'YYYY-MM-DD' or ''
  maxDate: Date; // latest selectable date (13+ years old cutoff)
  minDate: Date; // earliest selectable date (82 years old cap)
  onClose: () => void;
  onConfirm: (isoDate: string) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const ITEM_HEIGHT = 44;
const VISIBLE_COUNT = 5; // must be odd so one row sits dead-center
const PAD_ROWS = Math.floor(VISIBLE_COUNT / 2);

function daysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// One iOS-style scroll-snapped wheel column. Scrolling settles on whichever
// row is centered (CSS scroll-snap), and that row is reported back via
// onSettle — no manual drag-tracking math needed.
function WheelColumn<T>({
  items,
  index,
  onSettle,
  renderLabel,
  widthClass
}: {
  items: T[];
  index: number;
  onSettle: (index: number) => void;
  renderLabel: (item: T) => string;
  widthClass: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);
  // Refs so the native scroll listener (attached once) always sees the
  // latest items/onSettle without needing to be torn down and reattached
  // on every render.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;

  // Keep the wheel in sync when `index` changes from outside (e.g. the day
  // count shrinking after switching to February).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const target = index * ITEM_HEIGHT;
    if (Math.abs(el.scrollTop - target) > 1) {
      isProgrammaticScroll.current = true;
      el.scrollTo({ top: target, behavior: 'auto' });
      requestAnimationFrame(() => {
        isProgrammaticScroll.current = false;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length]);

  // React's synthetic onScroll (a non-bubbling native event) proved
  // unreliable for this — a real native listener, attached once and read
  // through refs, is the same pattern already relied on elsewhere in this
  // app for touch/scroll handling.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const handleScroll = () => {
      if (isProgrammaticScroll.current) return;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        const currentItems = itemsRef.current;
        const settledIndex = Math.max(0, Math.min(currentItems.length - 1, Math.round(el.scrollTop / ITEM_HEIGHT)));
        onSettleRef.current(settledIndex);
      }, 90);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`${widthClass} shrink-0 overflow-y-scroll scrollbar-none`}
      style={{
        height: ITEM_HEIGHT * VISIBLE_COUNT,
        scrollSnapType: 'y mandatory',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      <div style={{ height: ITEM_HEIGHT * PAD_ROWS }} />
      {items.map((item, i) => {
        const distance = Math.abs(i - index);
        return (
          <div
            key={i}
            onClick={() => {
              containerRef.current?.scrollTo({ top: i * ITEM_HEIGHT, behavior: 'smooth' });
              onSettle(i);
            }}
            className="flex items-center justify-center cursor-pointer select-none transition-all"
            style={{
              height: ITEM_HEIGHT,
              scrollSnapAlign: 'center',
              opacity: distance === 0 ? 1 : distance === 1 ? 0.45 : 0.2,
              transform: `scale(${distance === 0 ? 1 : 0.88})`
            }}
          >
            <span className={distance === 0 ? 'text-white text-lg font-bold' : 'text-zinc-400 text-base font-medium'}>
              {renderLabel(item)}
            </span>
          </div>
        );
      })}
      <div style={{ height: ITEM_HEIGHT * PAD_ROWS }} />
    </div>
  );
}

export const BirthdayWheelPicker: React.FC<BirthdayWheelPickerProps> = ({ value, maxDate, minDate, onClose, onConfirm }) => {
  const initial = useMemo(() => {
    const parsed = value ? new Date(value) : null;
    if (parsed && !isNaN(parsed.getTime())) {
      return { month: parsed.getMonth(), day: parsed.getDate() - 1, year: parsed.getFullYear() };
    }
    // Sensible default: 20 years before the cutoff, January 1st.
    return { month: 0, day: 0, year: maxDate.getFullYear() - 20 };
  }, [value, maxDate]);

  const [monthIdx, setMonthIdx] = useState(initial.month);
  const [dayIdx, setDayIdx] = useState(initial.day);
  const [yearIdx, setYearIdx] = useState(0);

  const minYear = minDate.getFullYear();
  const maxYear = maxDate.getFullYear();
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = minYear; y <= maxYear; y++) list.push(y);
    return list;
  }, [minYear, maxYear]);

  useEffect(() => {
    setYearIdx(Math.max(0, years.indexOf(initial.year)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedYear = years[yearIdx] ?? maxYear;
  const dayCount = daysInMonth(monthIdx, selectedYear);
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => i + 1), [dayCount]);

  // Clamp the day if switching to a shorter month (e.g. 31st -> February).
  useEffect(() => {
    if (dayIdx > dayCount - 1) setDayIdx(dayCount - 1);
  }, [dayCount, dayIdx]);

  const handleConfirm = () => {
    const y = years[yearIdx] ?? maxYear;
    const m = monthIdx;
    const d = Math.min(dayIdx + 1, daysInMonth(m, y));
    const iso = `${y.toString().padStart(4, '0')}-${(m + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    onConfirm(iso);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-sm bg-[#141418] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-bold text-white">Birthday</h3>
          <div className="w-8" />
        </div>

        <div className="relative px-4 py-3">
          {/* Center highlight band, sitting behind the wheels */}
          <div
            className="absolute left-4 right-4 top-1/2 -translate-y-1/2 rounded-2xl bg-white/5 border-y border-cyan-400/30 pointer-events-none"
            style={{ height: ITEM_HEIGHT }}
          />
          <div className="flex justify-center gap-1">
            <WheelColumn
              items={MONTH_NAMES}
              index={monthIdx}
              onSettle={setMonthIdx}
              renderLabel={(m) => m}
              widthClass="w-[38%]"
            />
            <WheelColumn
              items={days}
              index={dayIdx}
              onSettle={setDayIdx}
              renderLabel={(d) => String(d)}
              widthClass="w-[20%]"
            />
            <WheelColumn
              items={years}
              index={yearIdx}
              onSettle={setYearIdx}
              renderLabel={(y) => String(y)}
              widthClass="w-[30%]"
            />
          </div>
        </div>

        <div className="p-4 pt-1">
          <button
            type="button"
            onClick={handleConfirm}
            className="w-full py-3 bg-gradient-to-r from-cyan-400 to-indigo-500 text-black font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

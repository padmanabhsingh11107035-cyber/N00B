import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Coins, Lock, Receipt, Send, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { receiptStamp, type PaymentReceiptEvent } from '../../utils/paymentReceipt';
import './paymentReceipt.css';

// The payment receipt, the way the owner's example video does it, in the same black, white and grey: a short "successful" opening, the page turns soft grey, a dark slot
// appears at the top, a little paper plane flies up into it, and the receipt is printed out of the slot and slides down until it rests. It stays where it stops (it never goes
// back in), and then a black rounded "Done" button rises at the bottom. There is no download. Tapping anywhere while it plays skips to the finished receipt.

// One timeline, in seconds (the same numbers are in paymentReceipt.css):
const SETTLE_MS = 6900;       // the receipt has stopped and the Done button is up
const SKIP_AFTER_MS = 600;    // a tap can skip once the page has opened

// A barcode made from the receipt number: always the same bars for the same number
function bars(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const out: number[] = [];
  for (let i = 0; i < 52; i++) {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    out.push(1 + (Math.abs(h) % 3));
  }
  return out;
}

const Barcode: React.FC<{ value: string }> = ({ value }) => {
  const list = useMemo(() => bars(value), [value]);
  const total = list.reduce((a, b) => a + b + 1.4, 0);
  let x = 0;
  return (
    <svg className="pr-barcode" viewBox={`0 0 ${total} 40`} preserveAspectRatio="none" aria-hidden="true">
      {list.map((w, i) => { const rect = <rect key={i} x={x} y={0} width={w} height={40} fill="#0b0b0c" />; x += w + 1.4; return rect; })}
    </svg>
  );
};

const SATELLITES = [Wallet, ShieldCheck, Receipt, Coins, Sparkles, Lock];

interface Props {
  receipt: PaymentReceiptEvent;
  onDone: () => void;
}

export const PaymentReceiptPage: React.FC<Props> = ({ receipt, onDone }) => {
  const [settled, setSettled] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const openedAt = useRef(Date.now());

  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setSettled(true); return; }
    const t = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!settled) return;
    try { navigator.vibrate?.([14, 50, 14]); } catch { /* not every phone vibrates */ }
  }, [settled]);

  const skip = () => {
    if (settled || Date.now() - openedAt.current < SKIP_AFTER_MS) return;
    setSkipped(true);
    setSettled(true);
  };

  return (
    <div
      className={`pr-root ${settled ? 'pr-settled' : ''} ${skipped ? 'pr-skip' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Payment receipt"
      data-testid="payment-receipt"
      onClick={skip}
    >
      {/* 1. the opening: a dark square with a tick, and little buttons that fly out around it and back in */}
      <div className="pr-intro" aria-hidden="true">
        <div className="pr-intro-txt">
          <h2>Payment<br />successful</h2>
          <p>Your receipt is being printed.</p>
        </div>
        <div className="pr-orbit">
          {SATELLITES.map((Icon, i) => (
            <i key={i} className="pr-sat" style={{ ['--a' as string]: `${i * 60}deg`, ['--d' as string]: `${0.95 + i * 0.05}s` }}><Icon /></i>
          ))}
          <div className="pr-core"><Check strokeWidth={3} /></div>
        </div>
      </div>

      {/* 2. the receipt page */}
      <header className="pr-bar">
        <button type="button" className="pr-back" onClick={(e) => { e.stopPropagation(); if (settled) onDone(); }} aria-label="Back" tabIndex={settled ? 0 : -1}><ArrowLeft /></button>
        <strong>Receipt</strong>
        <span className="pr-bar-gap" />
      </header>

      <div className="pr-stage">
        <div className="pr-slot" aria-hidden="true"><i className="pr-slit" /></div>

        <div className="pr-plane" aria-hidden="true"><Send /><i className="pr-trail" /></div>

        <div className="pr-scroll">
          <div className="pr-clip">
            <div className="pr-ticket">
              <article className="pr-card" data-testid="payment-receipt-details">
                <div className="pr-ok"><Check strokeWidth={3.5} /></div>
                <h1>{receipt.heading}</h1>
                <p className="pr-sub">{receipt.subheading}</p>
                {receipt.amountText && <p className="pr-amount">{receipt.amountText}</p>}
                {receipt.sections.map((s, i) => (
                  <section key={i} className="pr-sec">
                    {s.title && <h3>{s.title}</h3>}
                    <div className="pr-rows">
                      {s.rows.map((r, j) => (
                        <div key={j} className={`pr-row ${r.strong ? 'strong' : ''}`}><span>{r.label}</span><span>{r.value}</span></div>
                      ))}
                    </div>
                    {s.note && <p className="pr-note">{s.note}</p>}
                  </section>
                ))}
              </article>

              <article className="pr-card pr-pass">
                <p className="pr-pass-t">PAYMENT RECEIPT</p>
                <Barcode value={receipt.receiptNo} />
                <p className="pr-no">{receipt.receiptNo}</p>
                <p className="pr-date">{receiptStamp(receipt.at)}</p>
              </article>

              <div className="pr-lead" aria-hidden="true"><Send /></div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. the black rounded Done button (it rises once the receipt has stopped) */}
      <div className="pr-foot">
        <button type="button" className="pr-done" onClick={(e) => { e.stopPropagation(); if (settled) onDone(); }} aria-disabled={!settled} tabIndex={settled ? 0 : -1} data-testid="payment-receipt-done">Done</button>
      </div>
    </div>
  );
};

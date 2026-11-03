import React from 'react';
import { Check } from 'lucide-react';

export interface ProReceiptData {
  planName: string;
  billing: 'monthly' | 'yearly';
  base: number;        // the plan's price for this billing, in noobs, before any coupon
  total: number;       // what was paid, in noobs
  couponCode?: string;
  couponPercent?: number;
  autoRenew: boolean;
  at: Date;
}

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export const receiptNumber = (d: Date) => `NOOB-${d.getTime().toString(36).toUpperCase()}`;

// "Order Successful!": shown the moment a NOOB Pro plan has been bought (paid with noobs, the app's own points; no money changes hands).
export const ProReceipt: React.FC<{ receipt: ProReceiptData; onDone: () => void }> = ({ receipt, onDone }) => {
  const discount = receipt.base - receipt.total;
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? 'text-[15px] font-black text-zinc-900' : 'text-[13px] text-zinc-700'}`}>
      <span>{label}</span><span className="tabular-nums text-right">{value}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Order successful" data-testid="pro-receipt" onClick={(e) => e.stopPropagation()}>
      <div className="w-full max-w-sm rounded-[28px] bg-gradient-to-b from-[#f4f4fb] to-[#e4e4f6] text-zinc-900 shadow-2xl px-6 pt-8 pb-6 animate-fadeIn">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
          <Check className="w-8 h-8 text-white" strokeWidth={3.5} />
        </div>
        <h2 className="mt-4 text-center text-2xl font-black tracking-tight">Order Successful!</h2>
        <p className="mt-1 text-center text-[13px] text-zinc-500">Thank you for your purchase</p>
        <div className="my-5 h-px bg-zinc-300/80" />
        <h3 className="text-sm font-black mb-2.5">Order Details</h3>
        <div className="space-y-2">
          {row(`NOOB Pro ${receipt.planName} (${receipt.billing === 'yearly' ? 'yearly' : 'monthly'})`, `${receipt.base.toLocaleString()} noobs`)}
          {receipt.autoRenew && <p className="text-[11px] text-zinc-500">Renews by itself when it ends. You can switch that off in NOOB Pro.</p>}
        </div>
        <div className="my-4 h-px bg-zinc-300/80" />
        <div className="space-y-2">
          {row('Subtotal', `${receipt.base.toLocaleString()} noobs`)}
          {discount > 0 && row(`Coupon${receipt.couponCode ? ` ${receipt.couponCode}` : ''}${receipt.couponPercent ? ` (${receipt.couponPercent}%)` : ''}`, `-${discount.toLocaleString()} noobs`)}
        </div>
        <div className="my-4 h-px bg-zinc-300/80" />
        {row('Total', `${receipt.total.toLocaleString()} noobs`, true)}
        <p className="mt-5 text-center text-[11px] text-zinc-500 tabular-nums">Date: {stamp(receipt.at)}<br />Receipt {receiptNumber(receipt.at)}</p>
        <button onClick={onDone} autoFocus className="mt-5 w-full h-12 rounded-2xl bg-black text-white font-black text-sm cursor-pointer active:scale-[.98] transition-transform">Done</button>
      </div>
    </div>
  );
};

import { formatPaymentId } from './formatPoints';

// The payment receipt (components/Payments/PaymentReceiptPage.tsx) opens by itself when the person has PAID for something with noobs:
// a NOOB Pro plan, points sent to someone, a payment they approved for a friend, the Live Lounge, a chat shop item, a live gift.
// It is never shown for points that were received or paid back. Any place that has just taken a payment calls showPaymentReceipt(); the one host
// (components/Payments/PaymentReceiptHost.tsx, mounted once in the app) draws it, one after the other if there are several.

export interface ReceiptRow { label: string; value: string; strong?: boolean }
export interface ReceiptSection { title?: string; rows: ReceiptRow[]; note?: string }

export interface PaymentReceiptEvent {
  heading: string;
  subheading: string;
  /** the big amount under the heading, for example "1,000 noobs" */
  amountText?: string;
  sections: ReceiptSection[];
  receiptNo: string;
  at: Date;
}

export const PAYMENT_RECEIPT_EVENT = 'noob-payment-receipt';

const pad = (n: number) => String(n).padStart(2, '0');
export const receiptStamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export const makeReceiptNumber = (d: Date) => `NOOB-${d.getTime().toString(36).toUpperCase()}`;
export const noobsText = (n: number) => `${n.toLocaleString()} noobs`;

export function showPaymentReceipt(receipt: PaymentReceiptEvent): void {
  try { window.dispatchEvent(new CustomEvent<PaymentReceiptEvent>(PAYMENT_RECEIPT_EVENT, { detail: receipt })); } catch { /* no window: nothing to show */ }
}

interface BuildOptions {
  paidFor: string;
  paidTo?: string;
  amount: number;
  /** the Payment ID the server gave (a transfer id); the receipt number is made from it */
  transferId?: string;
  note?: string;
  at?: Date;
}

// The receipt of an ordinary payment: what it was for, who it went to, how much, and when.
export function buildPaymentReceipt(o: BuildOptions): PaymentReceiptEvent {
  const at = o.at ?? new Date();
  const receiptNo = o.transferId ? formatPaymentId(o.transferId) : makeReceiptNumber(at);
  const details: ReceiptRow[] = [{ label: 'Paid for', value: o.paidFor }];
  if (o.paidTo) details.push({ label: 'Paid to', value: o.paidTo });
  details.push({ label: 'Paid with', value: 'NOOB Points' });
  if (o.note) details.push({ label: 'Note', value: o.note });
  details.push({ label: 'Status', value: 'Successful' });
  return {
    heading: 'Payment Successful!',
    subheading: 'Your payment has gone through',
    amountText: noobsText(o.amount),
    sections: [
      { title: 'Payment Details', rows: details },
      { rows: [{ label: 'Total paid', value: noobsText(o.amount), strong: true }] }
    ],
    receiptNo,
    at
  };
}

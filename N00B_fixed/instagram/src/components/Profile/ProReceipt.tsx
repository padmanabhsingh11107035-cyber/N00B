import React from 'react';
import { PaymentReceiptPage } from '../Payments/PaymentReceiptPage';
import { noobsText, type PaymentReceiptEvent } from '../../utils/paymentReceipt';

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

export const receiptNumber = (d: Date) => `NOOB-${d.getTime().toString(36).toUpperCase()}`;

// "Order Successful!": shown the moment a NOOB Pro plan has been bought (paid with noobs, the app's own points; no money changes hands). It is the animated receipt
// of components/Payments/PaymentReceiptPage.tsx (printed out of a slot, then a black Done button) with the plan, the coupon and the total.
export const ProReceipt: React.FC<{ receipt: ProReceiptData; onDone: () => void }> = ({ receipt, onDone }) => {
  const discount = receipt.base - receipt.total;
  const event: PaymentReceiptEvent = {
    heading: 'Order Successful!',
    subheading: 'Thank you for your purchase',
    amountText: noobsText(receipt.total),
    sections: [
      {
        title: 'Order Details',
        rows: [{ label: `NOOB Pro ${receipt.planName} (${receipt.billing === 'yearly' ? 'yearly' : 'monthly'})`, value: noobsText(receipt.base) }],
        note: receipt.autoRenew ? 'Renews by itself when it ends. You can switch that off in NOOB Pro.' : undefined
      },
      {
        rows: [
          { label: 'Subtotal', value: noobsText(receipt.base) },
          ...(discount > 0 ? [{ label: `Coupon${receipt.couponCode ? ` ${receipt.couponCode}` : ''}${receipt.couponPercent ? ` (${receipt.couponPercent}%)` : ''}`, value: `-${noobsText(discount)}` }] : [])
        ]
      },
      { rows: [{ label: 'Total', value: noobsText(receipt.total), strong: true }] }
    ],
    receiptNo: receiptNumber(receipt.at),
    at: receipt.at
  };
  return <PaymentReceiptPage receipt={event} onDone={onDone} />;
};

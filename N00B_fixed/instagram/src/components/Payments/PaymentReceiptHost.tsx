import React, { useEffect, useState } from 'react';
import { PAYMENT_RECEIPT_EVENT, type PaymentReceiptEvent } from '../../utils/paymentReceipt';

// Mounted once in the app: whenever a payment has just been made (showPaymentReceipt, utils/paymentReceipt.ts) it draws the animated receipt, one after the other if there are several.
const PaymentReceiptPage = React.lazy(() => import('./PaymentReceiptPage').then((m) => ({ default: m.PaymentReceiptPage })));

export const PaymentReceiptHost: React.FC = () => {
  const [queue, setQueue] = useState<PaymentReceiptEvent[]>([]);

  useEffect(() => {
    const onReceipt = (e: Event) => {
      const detail = (e as CustomEvent<PaymentReceiptEvent>).detail;
      if (detail) setQueue((q) => [...q, detail]);
    };
    window.addEventListener(PAYMENT_RECEIPT_EVENT, onReceipt);
    return () => window.removeEventListener(PAYMENT_RECEIPT_EVENT, onReceipt);
  }, []);

  if (queue.length === 0) return null;
  const current = queue[0];
  return (
    <React.Suspense fallback={null}>
      <PaymentReceiptPage key={current.receiptNo + current.at.getTime()} receipt={current} onDone={() => setQueue((q) => q.slice(1))} />
    </React.Suspense>
  );
};

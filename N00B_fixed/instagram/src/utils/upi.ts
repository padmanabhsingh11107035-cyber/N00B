// A standard NPCI UPI "intent" link — every UPI app (GPay, PhonePe, Paytm, Amazon Pay, BHIM...)
// understands this same URL shape, so there's no need to special-case any one of them. Tapping it
// on a phone opens whichever UPI apps are installed to choose from; scanning the matching QR code
// (built from this same string, see FoodStallView) works identically on any device.
export function buildUpiUri(vpa: string, payeeName: string, amount: number, note: string): string {
  const params = new URLSearchParams({
    pa: vpa,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: 'INR',
    tn: note
  });
  return `upi://pay?${params.toString()}`;
}

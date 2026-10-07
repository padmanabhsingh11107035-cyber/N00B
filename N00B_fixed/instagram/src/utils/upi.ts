// A standard NPCI UPI "intent" link — every UPI app (GPay, PhonePe, Paytm, Amazon Pay, BHIM...)
// understands this same URL shape, so there's no need to special-case any one of them. Tapping it
// on a phone opens whichever UPI apps are installed to choose from; scanning the matching QR code
// (built from this same string, see FoodStallView) works identically on any device.
//
// Built by hand with encodeURIComponent rather than URLSearchParams: URLSearchParams encodes a
// space as "+", which several UPI apps' QR/intent parsers don't accept as a space in pa/pn/tn —
// a value they can't parse makes some of them fall back to treating the whole string as a generic
// link or piece of text (which is how this used to end up opening in WhatsApp/a browser instead of
// a UPI app's own payment screen, and the amount showing up editable instead of locked — a UPI app
// only locks the amount field when it has actually recognized "am" as a real UPI pay request).
// encodeURIComponent always produces the standard "%20", which every UPI app parses correctly.
export function buildUpiUri(vpa: string, payeeName: string, amount: number, note: string): string {
  const params: [string, string][] = [
    ['pa', vpa],
    ['pn', payeeName],
    ['am', amount.toFixed(2)],
    ['cu', 'INR'],
    ['tn', note]
  ];
  const query = params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `upi://pay?${query}`;
}

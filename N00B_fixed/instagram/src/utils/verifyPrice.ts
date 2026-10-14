// The price of the verified badge, in NOOB Points. ONE place for the whole app (the sentence on the plan card, the summary on the payment page and the amount
// that is checked against the wallet all come from here). The database charges the same two numbers: supabase/migrations/20261014000012_verified_price_linked_accounts.sql.
export const VERIFY_PRICE = { permanent: 500_000_000, monthly: 50_000_000 } as const;

// 500000000 -> "500M"
export const shortPoints = (n: number): string => (n >= 1_000_000 && n % 1_000_000 === 0 ? `${n / 1_000_000}M` : n.toLocaleString('en-US'));

// Real-world currency (not NOOB Points) — Indian Rupees, matching the
// shop's physical Ahmedabad address.
export function formatPrice(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

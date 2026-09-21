// Helpers for the shop's address book. Pure functions, so they can be tested without a browser.
// The database is the authority (it checks everything again and refuses bad input); these keep the screens quick and clear.
import type { ShopAddress, ShopDetails } from '../../types';

export const MAX_ADDRESSES = 10;
export const MAX_LABEL = 30;

export type AddressForm = Omit<ShopAddress, 'id' | 'isDefault' | 'updatedAt'>;

export const emptyAddressForm = (): AddressForm => ({
  label: '',
  fullName: '',
  phone: '',
  altPhone: '',
  addressLine1: '',
  addressLine2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  deliveryNotes: '',
  lat: null,
  lng: null
});

// A phone number with everything but its last four digits hidden: "+91 98765 43210" -> "•••••• 3210".
export function maskPhone(phone?: string | null): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 0) return '';
  if (digits.length <= 4) return digits;
  return `•••••• ${digits.slice(-4)}`;
}

// The short version of an address shown on a card: who, the street line(s), the place, and a hidden-away phone number.
// (Landmark, delivery notes and the second phone number are only shown when editing.)
export function addressSummary(a: Partial<ShopAddress>): { name: string; street: string; place: string; phone: string } {
  const street = [a.addressLine1, a.addressLine2].map((x) => (x || '').trim()).filter(Boolean).join(', ');
  const cityState = [a.city, a.state].map((x) => (x || '').trim()).filter(Boolean).join(', ');
  const pin = (a.pincode || '').trim();
  return { name: (a.fullName || '').trim(), street, place: [cityState, pin].filter(Boolean).join(' - '), phone: maskPhone(a.phone) };
}

// The address as the "contact" an order carries (what the database's place-an-order function expects).
export function addressToContact(a: ShopAddress, email = ''): Partial<ShopDetails> {
  return {
    fullName: a.fullName, phone: a.phone, altPhone: a.altPhone, email,
    addressLine1: a.addressLine1, addressLine2: a.addressLine2, landmark: a.landmark,
    city: a.city, state: a.state, pincode: a.pincode, deliveryNotes: a.deliveryNotes,
    lat: a.lat ?? null, lng: a.lng ?? null
  };
}

const digitsOf = (v: string) => v.replace(/\D/g, '').length;

// The first thing wrong with an address form, in plain words (null = fine). Mirrors the database's rules.
export function validateAddress(a: AddressForm): string | null {
  if (a.label.trim().length > MAX_LABEL) return `The address name can be at most ${MAX_LABEL} characters.`;
  if (a.fullName.trim().length < 2) return 'Enter the full name of the person receiving the order.';
  if (a.phone.trim() === '') return 'Enter a phone number the delivery person can reach.';
  if (digitsOf(a.phone) < 7 || digitsOf(a.phone) > 15) return 'Enter a valid phone number.';
  if (a.altPhone.trim() !== '' && (digitsOf(a.altPhone) < 7 || digitsOf(a.altPhone) > 15)) return 'Enter a valid alternate phone number.';
  if (a.addressLine1.trim().length < 3) return 'Enter the house / flat number and street.';
  if (a.city.trim() === '') return 'Enter the city.';
  if (a.state.trim() === '') return 'Enter the state.';
  if (a.pincode.trim() === '') return 'Enter the pincode.';
  if (!/^[A-Za-z0-9 -]{4,10}$/.test(a.pincode.trim())) return 'Enter a valid pincode.';
  // the map pin is optional; when there is one it must be a real place (both numbers)
  const hasLat = a.lat !== null && a.lat !== undefined;
  const hasLng = a.lng !== null && a.lng !== undefined;
  if (hasLat !== hasLng || (hasLat && (!Number.isFinite(a.lat) || !Number.isFinite(a.lng) || Math.abs(a.lat as number) > 90 || Math.abs(a.lng as number) > 180))) return 'The map pin is not a valid location.';
  return null;
}

// A pin position as it is stored: six decimals (about a tenth of a metre).
export const roundPin = (n: number): number => Math.round(n * 1e6) / 1e6;

// The default address first, then the rest in the order they were saved (the database already sends them this way; this
// keeps the screen right after a local change too).
export function sortAddresses(list: ShopAddress[]): ShopAddress[] {
  return [...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

// Which address is preselected at checkout: the one already chosen if it still exists, else the default, else the first.
export function pickCheckoutAddress(list: ShopAddress[], currentId?: string | null): string | null {
  if (currentId && list.some((a) => a.id === currentId)) return currentId;
  return (list.find((a) => a.isDefault) || list[0])?.id ?? null;
}

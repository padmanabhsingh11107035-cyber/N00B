import React from 'react';
import { ShopDetails, User } from '../../types';

export const EMPTY_DETAILS: ShopDetails = {
  fullName: '',
  phone: '',
  altPhone: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  deliveryNotes: ''
};

// Saved details from the database, with every field present.
export const withDefaults = (d?: Partial<ShopDetails> | null): ShopDetails => ({ ...EMPTY_DETAILS, ...(d || {}) });

// Nothing saved yet? Start from what the NOOB profile already knows (name, phone, email) so people type less.
export function prefillFromProfile(user: User, saved: Partial<ShopDetails>): ShopDetails {
  const d = withDefaults(saved);
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.displayName || '';
  const phone = user.mobileNumber ? `${user.countryCode || ''} ${user.mobileNumber}`.trim() : '';
  return {
    ...d,
    fullName: d.fullName || name,
    phone: d.phone || phone,
    email: d.email || user.email || ''
  };
}

export const inputClass =
  'w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50 placeholder:text-zinc-600';

const Field: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <label className="block space-y-1">
    <span className="text-[11px] font-bold text-zinc-400">{label}</span>
    {children}
    {hint && <span className="text-[10px] text-zinc-600 block">{hint}</span>}
  </label>
);

interface ContactFieldsProps {
  value: ShopDetails;
  onChange: (next: ShopDetails) => void;
  // which blocks to show
  contact?: boolean;
  address?: boolean;
  notes?: boolean;
  email?: boolean; // the email box (not wanted in an address: the email belongs to the contact details)
}

// The contact-details and address form used on the Account screen and at checkout.
export const ContactFields: React.FC<ContactFieldsProps> = ({ value, onChange, contact = true, address = true, notes = true, email = true }) => {
  const set = (key: keyof ShopDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...value, [key]: e.target.value });

  return (
    <div className="space-y-5">
      {contact && (
        <div className="space-y-2.5">
          <span className="text-xs font-bold text-white block">Contact details</span>
          <Field label="Full name">
            <input value={value.fullName} onChange={set('fullName')} maxLength={80} autoComplete="name" placeholder="Full name" className={inputClass} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Field label="Phone number">
              <input value={value.phone} onChange={set('phone')} maxLength={20} inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" className={inputClass} />
            </Field>
            <Field label="Alternate phone (optional)">
              <input value={value.altPhone} onChange={set('altPhone')} maxLength={20} inputMode="tel" placeholder="Another number" className={inputClass} />
            </Field>
          </div>
          {email && (
            <Field label="Email (optional)">
              <input value={value.email} onChange={set('email')} maxLength={120} inputMode="email" autoComplete="email" placeholder="you@example.com" className={inputClass} />
            </Field>
          )}
        </div>
      )}

      {address && (
        <div className="space-y-2.5">
          <span className="text-xs font-bold text-white block">Address</span>
          <Field label="Address line 1">
            <input value={value.addressLine1} onChange={set('addressLine1')} maxLength={150} autoComplete="address-line1" placeholder="House / flat no., street" className={inputClass} />
          </Field>
          <Field label="Address line 2 (optional)">
            <input value={value.addressLine2} onChange={set('addressLine2')} maxLength={150} autoComplete="address-line2" placeholder="Area, colony" className={inputClass} />
          </Field>
          <Field label="Landmark (optional)">
            <input value={value.landmark} onChange={set('landmark')} maxLength={100} placeholder="e.g. Near the temple" className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="City">
              <input value={value.city} onChange={set('city')} maxLength={80} autoComplete="address-level2" placeholder="City" className={inputClass} />
            </Field>
            <Field label="State">
              <input value={value.state} onChange={set('state')} maxLength={80} autoComplete="address-level1" placeholder="State" className={inputClass} />
            </Field>
          </div>
          <Field label="Pincode">
            <input value={value.pincode} onChange={set('pincode')} maxLength={10} inputMode="numeric" autoComplete="postal-code" placeholder="Pincode" className={inputClass} />
          </Field>
        </div>
      )}

      {notes && (
        <Field label="Delivery notes (optional)" hint="Anything the delivery person should know — gate code, best time to call…">
          <textarea value={value.deliveryNotes} onChange={set('deliveryNotes')} maxLength={300} rows={3} placeholder="e.g. Ring the bell twice" className={`${inputClass} resize-none`} />
        </Field>
      )}
    </div>
  );
};

// One printable line-block of an address (used in order cards).
export function formatAddress(d: Partial<ShopDetails>): string {
  const cityLine = [d.city, d.state].filter(Boolean).join(', ');
  return [d.addressLine1, d.addressLine2, d.landmark, [cityLine, d.pincode].filter(Boolean).join(' - ')]
    .map((x) => (x || '').trim())
    .filter(Boolean)
    .join(', ');
}

// Tests the address helpers the shop screens use: the short version of an address for cards (with the phone number mostly
// hidden), the checks that mirror the database's rules, which address is preselected at checkout, and what an order carries.
// Pure logic (src/components/Store/addressBook.ts): no database or browser needed.
//
// Usage: node scripts/supabase/test-address-format.mjs
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let passed = 0, failed = 0;
const check = (cond, label, detail = '') => { if (cond) { passed++; console.log(`  ok   ${label}`); } else { failed++; console.log(`  FAIL ${label} ${detail}`); } };
const section = (t) => console.log(`\n${t}`);
const A = await import(pathToFileURL(path.resolve('src/components/Store/addressBook.ts')).href);
const { maskPhone, addressSummary, addressToContact, validateAddress, emptyAddressForm, pickCheckoutAddress, sortAddresses, MAX_ADDRESSES } = A;

const full = { id: 'a1', label: 'Home', isDefault: true, fullName: 'Asha Verma', phone: '+91 98765 43210', altPhone: '99999 11111', addressLine1: '12 MG Road', addressLine2: 'Shivaji Nagar', landmark: 'Near the temple', city: 'Pune', state: 'Maharashtra', pincode: '411001', deliveryNotes: 'Ring twice' };
const form = (o = {}) => ({ ...emptyAddressForm(), fullName: 'Asha Verma', phone: '98765 43210', addressLine1: '12 MG Road', city: 'Pune', state: 'Maharashtra', pincode: '411001', ...o });

section('1. The phone number is mostly hidden on cards');
check(maskPhone('+91 98765 43210') === '•••••• 3210' && maskPhone('9876543210') === '•••••• 3210', 'only the last four digits show, however the number was typed');
check(maskPhone('') === '' && maskPhone(null) === '' && maskPhone(undefined) === '', 'no number: nothing');
check(maskPhone('1234') === '1234' && maskPhone('12') === '12', 'a very short number is shown as it is (there is nothing to hide)');
check(!maskPhone('+91 98765 43210').includes('98765'), 'the hidden part never leaks');

section('2. The short version of an address');
let s = addressSummary(full);
check(s.name === 'Asha Verma' && s.street === '12 MG Road, Shivaji Nagar' && s.place === 'Pune, Maharashtra - 411001' && s.phone === '•••••• 3210', 'name, street lines, "city, state - pincode" and the hidden phone');
check(!JSON.stringify(s).includes('temple') && !JSON.stringify(s).includes('Ring twice') && !JSON.stringify(s).includes('99999'), 'landmark, delivery notes and the second phone number are not on the card (only when editing)');
s = addressSummary({ fullName: ' Asha ', addressLine1: '5 Lane', city: '', state: 'Gujarat', pincode: '' });
check(s.street === '5 Lane' && s.place === 'Gujarat', 'missing pieces are left out cleanly, with no stray commas or dashes');
s = addressSummary({});
check(s.name === '' && s.street === '' && s.place === '' && s.phone === '', 'an empty address does not crash');

section('3. What an order carries');
const c = addressToContact(full, 'asha@example.com');
check(c.fullName === 'Asha Verma' && c.phone === '+91 98765 43210' && c.addressLine1 === '12 MG Road' && c.city === 'Pune' && c.pincode === '411001' && c.email === 'asha@example.com' && c.deliveryNotes === 'Ring twice' && c.landmark === 'Near the temple', 'the chosen address becomes the order\'s contact and address, with the email from the contact details');
check(!('id' in c) && !('label' in c) && !('isDefault' in c), 'the address\'s own id, name and default flag are not sent as contact details');
check(addressToContact(full).email === '', 'no email: an empty one');

section('4. The checks before saving (the database checks again)');
check(validateAddress(form()) === null, 'a complete address passes');
check(/full name/i.test(validateAddress(form({ fullName: '' }))) && /full name/i.test(validateAddress(form({ fullName: 'A' }))), 'no name, or a one-letter name: refused');
check(/phone/i.test(validateAddress(form({ phone: '' }))) && /valid phone/i.test(validateAddress(form({ phone: '12' }))) && /valid phone/i.test(validateAddress(form({ phone: '1'.repeat(16) }))), 'no phone, too short, too long: refused');
check(validateAddress(form({ altPhone: '' })) === null && /alternate/i.test(validateAddress(form({ altPhone: 'abc' }))), 'the second phone is optional, but must be valid if given');
check(/house|street/i.test(validateAddress(form({ addressLine1: '' }))) && /house|street/i.test(validateAddress(form({ addressLine1: 'ab' }))), 'no street: refused');
check(/city/i.test(validateAddress(form({ city: '  ' }))) && /state/i.test(validateAddress(form({ state: '' }))) && /pincode/i.test(validateAddress(form({ pincode: '' }))), 'no city, state or pincode: refused');
check(/valid pincode/i.test(validateAddress(form({ pincode: '!!' }))) && /valid pincode/i.test(validateAddress(form({ pincode: '12' }))) && validateAddress(form({ pincode: 'SW1A 1AA' })) === null && validateAddress(form({ pincode: '411 001' })) === null, 'a bad pincode is refused; letters and spaces (other countries) are fine');
check(/at most 30/.test(validateAddress(form({ label: 'x'.repeat(31) }))) && validateAddress(form({ label: 'x'.repeat(30) })) === null, 'an address name can be up to 30 characters');
check(validateAddress(form({ label: '' })) === null, 'the address name is optional');
check(MAX_ADDRESSES === 10, 'ten addresses at most');

section('5. Which address is preselected at checkout');
const list = [{ ...full, id: 'x', isDefault: false }, { ...full, id: 'y', isDefault: true }, { ...full, id: 'z', isDefault: false }];
check(pickCheckoutAddress(list) === 'y', 'the default one');
check(pickCheckoutAddress(list, 'z') === 'z', 'the one already chosen stays chosen');
check(pickCheckoutAddress(list, 'gone') === 'y', 'a chosen address that was removed falls back to the default');
check(pickCheckoutAddress([{ ...full, id: 'p', isDefault: false }, { ...full, id: 'q', isDefault: false }]) === 'p', 'with no default, the first');
check(pickCheckoutAddress([]) === null && pickCheckoutAddress([], 'x') === null, 'no addresses: nothing chosen');
check(sortAddresses(list).map((a) => a.id).join() === 'y,x,z', 'the default is listed first, the rest keep their order');
check(list.map((a) => a.id).join() === 'x,y,z', 'sorting does not change the list it was given');

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;

import { Capacitor } from '@capacitor/core';
import { matchContacts } from './api';
import { User } from '../types';

// Contacts access only exists on the native Android build (there is no
// meaningful web equivalent) — this resolves to an empty match list
// everywhere else, so it's safe to call unconditionally from app startup.
export async function findFriendsFromContacts(): Promise<User[]> {
  if (!Capacitor.isNativePlatform()) return [];

  try {
    const { Contacts } = await import('@capacitor-community/contacts');

    let permission = await Contacts.checkPermissions();
    if (permission.contacts === 'prompt' || permission.contacts === 'prompt-with-rationale') {
      permission = await Contacts.requestPermissions();
    }
    if (permission.contacts !== 'granted') return [];

    const { contacts } = await Contacts.getContacts({
      projection: { name: true, phones: true }
    });

    const phoneNumbers = contacts
      .flatMap((c) => c.phones?.map((p) => p.number) || [])
      .filter((n): n is string => !!n);

    if (phoneNumbers.length === 0) return [];

    return await matchContacts(phoneNumbers);
  } catch (err) {
    console.error('Contact sync failed:', err);
    return [];
  }
}

import { Capacitor } from '@capacitor/core';
import { matchContacts } from './api';
import { User } from '../types';

export type ContactsPermissionState = 'granted' | 'prompt' | 'denied' | 'unsupported';

// Reads the OS permission WITHOUT asking for it — lets a screen decide whether to show its own
// "find friends from your contacts?" prompt at all, instead of the OS dialog just appearing out of
// nowhere. 'unsupported' covers the web entirely (there is no real contacts API for a website to
// call, on any browser) and any native platform where the plugin itself isn't available.
export async function getContactsPermissionState(): Promise<ContactsPermissionState> {
  if (!Capacitor.isNativePlatform()) return 'unsupported';
  try {
    const { Contacts } = await import('@capacitor-community/contacts');
    const permission = await Contacts.checkPermissions();
    if (permission.contacts === 'granted') return 'granted';
    if (permission.contacts === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unsupported';
  }
}

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

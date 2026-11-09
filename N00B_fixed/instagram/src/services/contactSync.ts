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

export type ContactScan = { status: 'ok' | 'empty' | 'denied' | 'unsupported' | 'error'; users: User[]; detail?: string };

/** The "Find friends" button: asks for the permission (only now, never before) and then looks for the people in the phone's contacts who are on NOOB. Says WHY when there is nobody to show. */
export async function scanContacts(): Promise<ContactScan> {
  if (!Capacitor.isNativePlatform()) return { status: 'unsupported', users: [] };
  let step = 'starting';
  try {
    step = 'loading the contacts tool';
    const { Contacts } = await import('@capacitor-community/contacts');
    step = 'checking the permission';
    let permission = await Contacts.checkPermissions();
    if (permission.contacts !== 'granted') { step = 'asking for the permission'; permission = await Contacts.requestPermissions(); }
    if (permission.contacts !== 'granted') return { status: 'denied', users: [] };
    step = 'reading the contacts';
    const { contacts } = await Contacts.getContacts({ projection: { name: true, phones: true } });
    const phoneNumbers = contacts.flatMap((c) => c.phones?.map((p) => p.number) || []).filter((n): n is string => !!n);
    if (phoneNumbers.length === 0) return { status: 'empty', users: [] };
    const users = await matchContacts(phoneNumbers);
    return users.length ? { status: 'ok', users } : { status: 'empty', users: [] };
  } catch (err) {
    console.error('Contact sync failed:', err);
    return { status: 'error', users: [], detail: `${step}: ${String((err as { message?: string })?.message || err)}`.slice(0, 200) };
  }
}

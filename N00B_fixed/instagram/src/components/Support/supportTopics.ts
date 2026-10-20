import type React from 'react';
import { CircleHelp, CreditCard, FileText, Gamepad2, LockKeyhole, MessageCircle, ShieldAlert, ShoppingBag, UserRound } from 'lucide-react';

// The topics of the support help desk (the list on the left, the chips on a phone, the "quick fix" cards), kept apart from the screen so they can be tested.
export interface Topic { id: string; title: string; detail: string; icon: React.ComponentType<{ className?: string }>; prompt?: string; action?: 'payment' | 'report' }

export const SUPPORT_TOPICS: Topic[] = [
  { id: 'login', title: 'Account & login', detail: 'Get back into your account', icon: LockKeyhole, prompt: "I can't log in to my account" },
  { id: 'profile', title: 'Profile & settings', detail: 'Make your profile yours', icon: UserRound, prompt: 'How do I change my username?' },
  { id: 'posts', title: 'Posts & community', detail: 'Find your way around NOOB', icon: MessageCircle, prompt: 'How do I report a post?' },
  { id: 'games', title: 'Mini-games & points', detail: 'How scoring works', icon: Gamepad2, prompt: 'How does mini-games point scoring work?' },
  { id: 'shop', title: 'Shop NOOB', detail: 'Ordering real products', icon: ShoppingBag, prompt: 'How do I order from Shop NOOB?' },
  { id: 'rules', title: 'Terms & privacy', detail: 'The rules, in plain words', icon: FileText, prompt: 'Explain NOOB Privacy Policy and data security' },
  { id: 'payment', title: 'Payment issue', detail: 'Look at a payment of yours', icon: CreditCard, action: 'payment' },
  { id: 'report', title: 'Report cyber bullying', detail: 'Tell the safety team', icon: ShieldAlert, action: 'report' },
  { id: 'else', title: 'Something else', detail: "Tell us what's going on", icon: CircleHelp, prompt: 'I need help with something else' }
];

export const STARTER_PROMPTS = ["I can't log in", 'Change my username', 'Report a post'];

/** Topics that match what was typed in the search box (title or detail, any letter case). */
export function filterTopics(topics: Topic[], query: string): Topic[] {
  const q = query.trim().toLowerCase();
  return q ? topics.filter((t) => `${t.title} ${t.detail}`.toLowerCase().includes(q)) : topics;
}


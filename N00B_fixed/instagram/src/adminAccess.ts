// What the NOOB administrator can allow another person to do. The keys match the database (admin_permission_keys()); the
// database is what actually enforces them — this list only decides which buttons and screens to show.
import type { User } from './types';

export type AdminPermission =
  | 'view_accounts' | 'suspend_accounts' | 'delete_accounts' | 'adjust_points' | 'handle_reports'
  | 'send_notifications' | 'manage_coupons' | 'manage_store' | 'moderate_content' | 'moderate_chats';

export const ADMIN_PERMISSIONS: { key: AdminPermission; label: string; description: string }[] = [
  { key: 'view_accounts', label: 'See all accounts', description: 'Open the list of every account, including email, phone number and birthday.' },
  { key: 'suspend_accounts', label: 'Suspend & restore accounts', description: 'Block someone from using NOOB, and let them back in later.' },
  { key: 'delete_accounts', label: 'Delete accounts', description: 'Permanently remove an account and everything on it.' },
  { key: 'adjust_points', label: 'Change NOOB points', description: 'Add, remove or set a person\'s NOOB point balance.' },
  { key: 'handle_reports', label: 'Handle reports', description: 'Read reports from members and resolve, dismiss or ban.' },
  { key: 'send_notifications', label: 'Send notifications', description: 'Send a notification to one person or to everyone.' },
  { key: 'manage_coupons', label: 'Manage coupons', description: 'Create, switch off and delete coupons.' },
  { key: 'manage_store', label: 'Manage the shop', description: 'Add, edit and remove shop products, and set their stock.' },
  { key: 'moderate_content', label: 'Remove posts, reels & stories', description: 'Delete anyone\'s post, reel, story or comment.' },
  { key: 'moderate_chats', label: 'Delete chat messages', description: 'Delete any message in any chat.' }
];

export const permissionLabel = (key: string): string => ADMIN_PERMISSIONS.find((p) => p.key === key)?.label || key.replace(/_/g, ' ');

type Who = Pick<User, 'id' | 'username'> & Partial<Pick<User, 'isAdmin' | 'adminPermissions'>>;

// The NOOB account (or any account marked admin): everything, and the only one who can hand out access to others.
export const isMainAdmin = (u?: Who | null): boolean =>
  !!u && (!!u.isAdmin || u.username?.toLowerCase() === 'noob' || u.id === 'u_noob_admin');

// May this person use this power? The main admin always; anyone else only what was ticked for them.
export const can = (u: Who | null | undefined, permission: AdminPermission): boolean =>
  !!u && (isMainAdmin(u) || !!u.adminPermissions?.includes(permission));

// Does this person have ANY admin power (so the Admin Control Panel should be shown to them)?
export const isStaff = (u?: Who | null): boolean => !!u && (isMainAdmin(u) || (u.adminPermissions?.length ?? 0) > 0);

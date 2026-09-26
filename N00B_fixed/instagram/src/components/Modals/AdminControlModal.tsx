import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Send,
  UserX,
  UserCheck,
  Search,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Users,
  X,
  Loader2,
  RefreshCw,
  Trash2,
  Coins,
  Info,
  Mail,
  Phone,
  Cake,
  MapPin,
  Briefcase,
  Globe2,
  Fingerprint,
  ShieldCheck,
  History,
  MessageSquareLock,
  ChevronDown,
  ChevronUp,
  LogOut,
  Image,
  Film,
  Camera,
  Settings,
  ToggleLeft,
  ToggleRight,
  ShoppingBag,
  Share2,
  Copy,
  Check,
  Link as LinkIcon,
  Smartphone,
  Rocket
} from 'lucide-react';
import { User } from '../../types';
import {
  fetchAdminUsersList, suspendUserAccount, deleteUserAccount, sendAdminNotification, fetchAdminReports, takeAdminReportAction, adjustUserPoints,
  fetchAdminStaff, setAdminPermissions, fetchAdminAudit,
  fetchAdminTeamApplications, adminReviewTeamApplication, fetchAdminSparkXApplications, adminReviewSparkXApplication, notifySparkxReview, sendSparkxMeetingInvite, fetchAdminContentFeed, deletePost, deleteReel, deleteStory,
  fetchPublicPlatformSettings, adminSetPlatformSettings, fetchSettings, updateSettings
} from '../../services/api';
import type { AdminStaffMember, AdminAuditEntry, TeamApplication, SparkXApplication } from '../../services/api';
import { ADMIN_PERMISSIONS, can, isMainAdmin, permissionLabel } from '../../adminAccess';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { formatExactDateTime } from '../../utils/formatTime';

interface AdminControlModalProps {
  currentUser: User;
  onClose: () => void;
  // Rendered as the admin's entire home screen instead of a dialog over the app — see App.tsx,
  // which routes the main admin account here directly on login rather than into the normal tabs.
  fullPage?: boolean;
  onLogout?: () => void;
}

type AdminTab = 'users' | 'reports' | 'notify' | 'staff' | 'activity' | 'content' | 'joinRequests' | 'sparkxRequests' | 'settings';

// One line of the activity log, in plain words.
function describeAudit(e: AdminAuditEntry): string {
  const who = e.actor ? `@${e.actor}` : 'An admin';
  const target = e.target ? `@${e.target}` : '';
  const d = e.details || {};
  switch (e.action) {
    case 'admin_access_set': return `${who} set admin access for ${target}: ${(d.permissions || []).map(permissionLabel).join(', ') || 'nothing'}.`;
    case 'admin_access_removed': return `${who} removed all admin access from ${target}.`;
    case 'account_suspended': return `${who} suspended ${target}${d.reason ? ` (${d.reason})` : ''}.`;
    case 'account_restored': return `${who} restored ${target}.`;
    case 'account_deleted': return `${who} permanently deleted the account @${d.username || e.target || 'unknown'}.`;
    case 'points_adjusted': return `${who} changed ${target}'s NOOB points from ${Number(d.from ?? 0).toLocaleString()} to ${Number(d.to ?? 0).toLocaleString()}${d.reason ? ` (${d.reason})` : ''}.`;
    case 'notification_sent': return `${who} sent a notification ${target ? `to ${target}` : 'to everyone'}.`;
    case 'report_resolved': return `${who} resolved a report about ${target}${d.suspended ? ' and suspended them' : ''}.`;
    case 'report_dismissed': return `${who} dismissed a report about ${target}.`;
    case 'report_banned': return `${who} banned ${target} over a report.`;
    case 'coupon_created': return `${who} created the coupon ${d.code || ''}.`;
    case 'coupon_removed': return `${who} removed a coupon.`;
    case 'shop_settings_changed': return `${who} changed the shop settings${d.ordersOn === true ? ': orders ON' : d.ordersOn === false ? ': orders OFF' : ''}${d.deliveryCharge != null ? `${d.ordersOn == null ? ':' : ','} delivery charge ${d.deliveryCharge}` : ''}.`;
    case 'product_added': return `${who} added a shop product.`;
    case 'product_updated': return `${who} edited a shop product.`;
    case 'product_removed': return `${who} removed a shop product.`;
    case 'message_deleted': return `${who} deleted a chat message.`;
    case 'platform_settings_changed': return `${who} changed platform settings${d.signupsEnabled != null ? `: sign-ups ${d.signupsEnabled ? 'ON' : 'OFF'}` : ''}${d.maintenanceEnabled != null ? `${d.signupsEnabled == null ? ':' : ','} maintenance ${d.maintenanceEnabled ? 'ON' : 'OFF'}` : ''}.`;
    default: return `${who}: ${e.action.replace(/_/g, ' ')}${target ? ` — ${target}` : ''}.`;
  }
}

export const AdminControlModal: React.FC<AdminControlModalProps> = ({ currentUser, onClose, fullPage = false, onLogout }) => {
  // What this person may do. The database enforces every one of these again — this only decides which buttons appear.
  const main = isMainAdmin(currentUser);
  const canViewAccounts = can(currentUser, 'view_accounts');
  const canSuspend = can(currentUser, 'suspend_accounts');
  const canDelete = can(currentUser, 'delete_accounts');
  const canAdjustPoints = can(currentUser, 'adjust_points');
  const canHandleReports = can(currentUser, 'handle_reports');
  const canNotify = can(currentUser, 'send_notifications');
  const canOpenAccounts = canViewAccounts || canSuspend || canDelete || canAdjustPoints || canHandleReports;

  const [activeTab, setActiveTab] = useState<AdminTab>(canOpenAccounts ? 'users' : canHandleReports ? 'reports' : canNotify ? 'notify' : 'users');
  const [usersList, setUsersList] = useState<User[]>([]);

  // Admin team (main admin only): who has which powers, and the editor for ticking them
  const [staffList, setStaffList] = useState<AdminStaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const [staffEditor, setStaffEditor] = useState<{ userId: string; username: string; displayName?: string; avatar?: string; existing: boolean } | null>(null);
  const [editorPerms, setEditorPerms] = useState<string[]>([]);
  const [savingStaff, setSavingStaff] = useState(false);
  const [auditEntries, setAuditEntries] = useState<AdminAuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [reportsList, setReportsList] = useState<any[]>([]);
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingReports, setLoadingReports] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Notification form states
  const [notifTargetType, setNotifTargetType] = useState<'all' | 'specific'>('all');
  const [notifTargetUsername, setNotifTargetUsername] = useState('');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [isSendingNotif, setIsSendingNotif] = useState(false);

  // Suspension modal prompt states
  const [selectedUserForSuspend, setSelectedUserForSuspend] = useState<User | null>(null);
  const [suspendReason, setSuspendReason] = useState('Violation of NOOB Community Guidelines');

  // Delete-account confirmation state
  const [selectedUserForDelete, setSelectedUserForDelete] = useState<User | null>(null);

  // Full account-details view (email, phone, DOB/age, etc.) — never shows
  // the password, which the server already strips before this data ever
  // reaches the client (GET /api/admin/users returns sanitizeUser(), not
  // the raw record).
  const [selectedUserForDetails, setSelectedUserForDetails] = useState<User | null>(null);

  // Points-adjustment modal state
  const [selectedUserForPoints, setSelectedUserForPoints] = useState<User | null>(null);
  const [pointsInput, setPointsInput] = useState('');
  const [pointsReason, setPointsReason] = useState('');

  // Content browser (posts / reels / stories, admin-wide — not scoped to who the admin follows)
  const [contentType, setContentType] = useState<'posts' | 'reels' | 'stories'>('posts');
  const [contentItems, setContentItems] = useState<any[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [deletingContentId, setDeletingContentId] = useState<string | null>(null);

  // "Apply to join us" submissions
  const [joinRequests, setJoinRequests] = useState<TeamApplication[]>([]);
  const [loadingJoinRequests, setLoadingJoinRequests] = useState(false);

  // SparkX (IIT Bombay Techfest) team registrations
  const [sparkxRequests, setSparkxRequests] = useState<SparkXApplication[]>([]);
  const [loadingSparkxRequests, setLoadingSparkxRequests] = useState(false);
  const [selectedSparkxIds, setSelectedSparkxIds] = useState<Set<string>>(new Set());
  // Defaults to the standing SparkX interview Zoom room so the admin doesn't have
  // to re-type the same meeting details for every batch — still fully editable
  // per-invite (e.g. to change just the date/time) before sending.
  const [meetingForm, setMeetingForm] = useState({
    topic: 'NOOB',
    time: 'Sep 28, 2026 02:30 PM Mumbai, Kolkata, New Delhi',
    zoomLink: 'https://us05web.zoom.us/j/89253144144?pwd=ODdC9BWC4pjusv0qDFEmwDhbGzA4ug.1',
    meetingId: '892 5314 4144',
    passcode: 'tV4GCx'
  });
  const [sendingMeetingInvite, setSendingMeetingInvite] = useState(false);
  const meetingFormRef = useRef<HTMLDivElement | null>(null);

  // Platform-wide toggles: pause sign-ups, whole-app maintenance lock, shop orders
  const [signupsEnabled, setSignupsEnabled] = useState(true);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [storeOrdersEnabled, setStoreOrdersEnabled] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);

  // Shareable links: the app itself, the "apply to join us" form, and any one profile.
  const [shareProfileInput, setShareProfileInput] = useState('');
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';
  const appLink = typeof window !== 'undefined' ? window.location.origin : '';
  const joinTeamLink = `${baseUrl}?join=team`;
  const profileLink = shareProfileInput.trim() ? `${baseUrl}?profile=${encodeURIComponent(shareProfileInput.trim())}` : '';

  const copyLink = async (key: string, url: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinkKey(key);
      setTimeout(() => setCopiedLinkKey((k) => (k === key ? null : k)), 2000);
    } catch {
      // clipboard blocked — nothing more to do
    }
  };

  const shareLink = async (key: string, title: string, url: string) => {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // cancelled — not an error
        return;
      }
    }
    copyLink(key, url);
  };

  useEffect(() => {
    if (canOpenAccounts) loadUsers(); else setLoading(false);
    if (canHandleReports) loadReports();
    if (main) {
      loadStaff();
      loadJoinRequests();
      loadSparkxRequests();
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'activity' && main) loadAudit();
    if (activeTab === 'content' && main) loadContent(contentType);
    if (activeTab === 'joinRequests' && main) loadJoinRequests();
    if (activeTab === 'sparkxRequests' && main) loadSparkxRequests();
    if (activeTab === 'settings' && main) loadSettings();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'content' && main) loadContent(contentType);
  }, [contentType]);

  const loadContent = async (type: 'posts' | 'reels' | 'stories') => {
    setLoadingContent(true);
    const res = await fetchAdminContentFeed(type);
    if (res.success) setContentItems(res.items);
    else setStatusMessage({ text: res.error || 'Could not load content.', type: 'error' });
    setLoadingContent(false);
  };

  const loadJoinRequests = async () => {
    setLoadingJoinRequests(true);
    const res = await fetchAdminTeamApplications();
    if (res.success) setJoinRequests(res.applications);
    else setStatusMessage({ text: res.error || 'Could not load applications.', type: 'error' });
    setLoadingJoinRequests(false);
  };

  const loadSparkxRequests = async () => {
    setLoadingSparkxRequests(true);
    const res = await fetchAdminSparkXApplications();
    if (res.success) setSparkxRequests(res.applications);
    else setStatusMessage({ text: res.error || 'Could not load applications.', type: 'error' });
    setLoadingSparkxRequests(false);
  };

  const loadSettings = async () => {
    setLoadingSettings(true);
    const [s, shop] = await Promise.all([fetchPublicPlatformSettings(), fetchSettings()]);
    setSignupsEnabled(s.signupsEnabled);
    setMaintenanceEnabled(s.maintenanceEnabled);
    setMaintenanceMessage(s.maintenanceMessage);
    setStoreOrdersEnabled(shop.storeEnabled);
    setLoadingSettings(false);
  };

  const handleToggleStoreOrders = async () => {
    setSavingSettings(true);
    try {
      const next = !storeOrdersEnabled;
      await updateSettings({ storeEnabled: next });
      setStoreOrdersEnabled(next);
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'Could not save.', type: 'error' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleReviewJoinRequest = async (id: string, status: 'accepted' | 'declined') => {
    const res = await adminReviewTeamApplication(id, status);
    if (res.success) {
      setStatusMessage({ text: `Application ${status}.`, type: 'success' });
      loadJoinRequests();
    } else {
      setStatusMessage({ text: res.error || 'Could not update this application.', type: 'error' });
    }
  };

  const handleReviewSparkxRequest = async (id: string, status: 'accepted' | 'declined') => {
    const res = await adminReviewSparkXApplication(id, status);
    if (res.success) {
      setStatusMessage({ text: `Application ${status}. An email is on its way to the applicant.`, type: 'success' });
      loadSparkxRequests();
      void notifySparkxReview(id, status);
    } else {
      setStatusMessage({ text: res.error || 'Could not update this application.', type: 'error' });
    }
  };

  const toggleSparkxSelection = (id: string) => {
    setSelectedSparkxIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Per-candidate "Invite" button: selects just this one applicant and jumps
  // to the (already default-filled) meeting form, instead of making the
  // admin hunt for the checkbox and scroll up themselves.
  const handleInviteOne = (id: string) => {
    setSelectedSparkxIds(new Set([id]));
    setTimeout(() => meetingFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const handleSendMeetingInvite = async () => {
    if (selectedSparkxIds.size === 0 || !meetingForm.time.trim() || !meetingForm.zoomLink.trim()) return;
    setSendingMeetingInvite(true);
    const res = await sendSparkxMeetingInvite({
      applicationIds: Array.from(selectedSparkxIds),
      topic: meetingForm.topic.trim() || 'NOOB',
      time: meetingForm.time.trim(),
      zoomLink: meetingForm.zoomLink.trim(),
      meetingId: meetingForm.meetingId.trim(),
      passcode: meetingForm.passcode.trim()
    });
    setSendingMeetingInvite(false);
    if (res.success) {
      setStatusMessage({
        text: `Meeting invite sent to ${res.sent} applicant${res.sent === 1 ? '' : 's'}.${res.failed ? ` ${res.failed} could not be emailed (no address on file).` : ''}`,
        type: 'success'
      });
      setSelectedSparkxIds(new Set());
      loadSparkxRequests();
    } else {
      setStatusMessage({ text: res.error || 'Could not send the meeting invite.', type: 'error' });
    }
  };

  const handleDeleteContent = async (item: any) => {
    if (!confirm('Permanently remove this?')) return;
    setDeletingContentId(item.id);
    const ok =
      contentType === 'posts' ? await deletePost(item.id) : contentType === 'reels' ? await deleteReel(item.id) : await deleteStory(item.id);
    if (ok) setContentItems((prev) => prev.filter((x) => x.id !== item.id));
    else setStatusMessage({ text: 'Could not remove this.', type: 'error' });
    setDeletingContentId(null);
  };

  const handleToggleSignups = async () => {
    setSavingSettings(true);
    const res = await adminSetPlatformSettings({ signupsEnabled: !signupsEnabled });
    if (res.success && res.settings) setSignupsEnabled(res.settings.signupsEnabled);
    else setStatusMessage({ text: res.error || 'Could not save.', type: 'error' });
    setSavingSettings(false);
  };

  const handleToggleMaintenance = async () => {
    setSavingSettings(true);
    const res = await adminSetPlatformSettings({ maintenanceEnabled: !maintenanceEnabled });
    if (res.success && res.settings) setMaintenanceEnabled(res.settings.maintenanceEnabled);
    else setStatusMessage({ text: res.error || 'Could not save.', type: 'error' });
    setSavingSettings(false);
  };

  const handleSaveMaintenanceMessage = async () => {
    setSavingSettings(true);
    const res = await adminSetPlatformSettings({ maintenanceMessage });
    if (res.success) setStatusMessage({ text: 'Maintenance message saved.', type: 'success' });
    else setStatusMessage({ text: res.error || 'Could not save.', type: 'error' });
    setSavingSettings(false);
  };

  const loadStaff = async () => {
    setLoadingStaff(true);
    const res = await fetchAdminStaff();
    if (res.success) setStaffList(res.staff);
    else setStatusMessage({ text: res.error || 'Could not load the admin team.', type: 'error' });
    setLoadingStaff(false);
  };

  const loadAudit = async () => {
    setLoadingAudit(true);
    const res = await fetchAdminAudit(200);
    if (res.success) setAuditEntries(res.entries);
    else setStatusMessage({ text: res.error || 'Could not load the activity log.', type: 'error' });
    setLoadingAudit(false);
  };

  const openStaffEditor = (who: { userId: string; username: string; displayName?: string; avatar?: string }, current: string[] = []) => {
    setStaffEditor({ ...who, existing: current.length > 0 });
    setEditorPerms(current);
  };

  const togglePerm = (key: string) =>
    setEditorPerms((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const saveStaff = async (permissions: string[] = editorPerms) => {
    if (!staffEditor) return;
    if (permissions.length === 0 && !staffEditor.existing) {
      setStatusMessage({ text: 'Tick at least one thing this person is allowed to do.', type: 'error' });
      return;
    }
    try {
      setSavingStaff(true);
      const res = await setAdminPermissions(staffEditor.userId, permissions);
      if (res.success) {
        setStatusMessage({ text: res.message || 'Admin access updated.', type: 'success' });
        setStaffEditor(null);
        setStaffSearch('');
        await Promise.all([loadStaff(), canOpenAccounts ? loadUsers() : Promise.resolve()]);
      } else {
        setStatusMessage({ text: res.error || 'Could not change admin access.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'Error communicating with server.', type: 'error' });
    } finally {
      setSavingStaff(false);
    }
  };

  const removeStaffAccess = async (member: AdminStaffMember) => {
    if (!confirm(`Remove ALL admin access from @${member.username}? They will no longer see the Admin Control Panel.`)) return;
    try {
      setSavingStaff(true);
      const res = await setAdminPermissions(member.userId, []);
      if (res.success) {
        setStatusMessage({ text: res.message || `@${member.username} no longer has admin access.`, type: 'success' });
        await Promise.all([loadStaff(), canOpenAccounts ? loadUsers() : Promise.resolve()]);
      } else {
        setStatusMessage({ text: res.error || 'Could not remove admin access.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'Error communicating with server.', type: 'error' });
    } finally {
      setSavingStaff(false);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await fetchAdminUsersList();
      if (res.success && res.users) {
        setUsersList(res.users);
      } else if (!res.success) {
        setStatusMessage({ text: res.error || 'Failed to load user accounts', type: 'error' });
      }
    } catch (e: any) {
      console.error('Error loading admin users:', e);
      setStatusMessage({ text: 'Failed to load user accounts', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const loadReports = async () => {
    try {
      setLoadingReports(true);
      const res = await fetchAdminReports();
      if (res.success && res.reports) {
        setReportsList(res.reports);
      }
    } catch (e: any) {
      console.error('Error loading reports:', e);
    } finally {
      setLoadingReports(false);
    }
  };

  const handleReportAction = async (reportId: string, action: 'resolved' | 'dismissed', suspend: boolean = false) => {
    try {
      setActionLoading(reportId);
      const res = await takeAdminReportAction(reportId, action, suspend);
      if (res.success) {
        setStatusMessage({
          text: suspend ? 'Offender account suspended and report resolved.' : `Report marked as ${action}.`,
          type: 'success'
        });
        await Promise.all([loadReports(), loadUsers()]);
      } else {
        setStatusMessage({ text: res.error || 'Failed to update report status', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'Error updating report', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleSuspend = async (targetUser: User, shouldSuspend: boolean, reason?: string) => {
    try {
      setActionLoading(targetUser.id);
      const res = await suspendUserAccount({
        targetUserId: targetUser.id,
        reason: shouldSuspend ? reason || suspendReason : undefined,
        suspend: shouldSuspend
      });

      if (res.success) {
        setStatusMessage({
          text: res.message || `Account @${targetUser.username} has been ${shouldSuspend ? 'suspended' : 'unsuspended'}.`,
          type: 'success'
        });
        setSelectedUserForSuspend(null);
        await loadUsers();
      } else {
        setStatusMessage({ text: res.error || 'Failed to update account status.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'Error communicating with server.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (targetUser: User) => {
    try {
      setActionLoading(targetUser.id);
      const res = await deleteUserAccount(targetUser.id);
      if (res.success) {
        setStatusMessage({
          text: res.message || `Account @${targetUser.username} has been permanently deleted.`,
          type: 'success'
        });
        setSelectedUserForDelete(null);
        await loadUsers();
      } else {
        setStatusMessage({ text: res.error || 'Failed to delete account.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'Error communicating with server.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAdjustPoints = async (targetUser: User, setTo: number) => {
    try {
      setActionLoading(targetUser.id);
      const res = await adjustUserPoints(targetUser.id, { setTo, reason: pointsReason.trim() || undefined });
      if (res.success) {
        setStatusMessage({ text: res.message || `@${targetUser.username}'s balance updated.`, type: 'success' });
        setSelectedUserForPoints(null);
        setPointsInput('');
        setPointsReason('');
        await loadUsers();
      } else {
        setStatusMessage({ text: res.error || 'Failed to adjust balance.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'Error communicating with server.', type: 'error' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) {
      setStatusMessage({ text: 'Please enter both a title and message.', type: 'error' });
      return;
    }

    if (notifTargetType === 'specific' && !notifTargetUsername.trim()) {
      setStatusMessage({ text: 'Please specify the target username.', type: 'error' });
      return;
    }

    try {
      setIsSendingNotif(true);
      const target = notifTargetType === 'all' ? 'all' : notifTargetUsername.trim();
      const res = await sendAdminNotification({
        target,
        title: notifTitle.trim(),
        message: notifMessage.trim()
      });

      if (res.success) {
        setStatusMessage({
          text: res.message || 'Notification dispatched successfully!',
          type: 'success'
        });
        setNotifTitle('');
        setNotifMessage('');
        setNotifTargetUsername('');
      } else {
        setStatusMessage({ text: res.error || 'Failed to dispatch notification.', type: 'error' });
      }
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'Network error while dispatching notification.', type: 'error' });
    } finally {
      setIsSendingNotif(false);
    }
  };

  const calculateAge = (dob?: string): string => {
    if (!dob) return 'Not provided';
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return 'Not provided';
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
    return `${age} years old`;
  };

  const filteredUsers = usersList.filter(
    (u) =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const suspendedCount = usersList.filter((u) => u.isSuspended).length;

  return (
    <div
      id="admin-control-modal-backdrop"
      className={
        fullPage
          ? 'fixed inset-0 z-50 bg-black flex items-center justify-center'
          : 'fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200'
      }
    >
      <div
        className={
          fullPage
            ? 'w-full h-full bg-zinc-950 flex flex-col'
            : 'w-full max-w-2xl bg-zinc-950 border border-[#00FF66]/40 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,255,102,0.15)] flex flex-col max-h-[90vh]'
        }
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-zinc-900 via-zinc-950 to-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#00FF66] shadow-[0_0_12px_rgba(0,255,102,0.4)] bg-black p-0.5">
              <img src="/noob-logo.svg.jpeg" alt="NOOB Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">NOOB Admin Control Panel</h2>
                <VerifiedBadge size="sm" />
              </div>
              <p className="text-xs text-zinc-400">{main ? 'Master Platform Overseer' : 'Admin Team Member'} • Logged in as @{currentUser.username}</p>
            </div>
          </div>

          {fullPage ? (
            <button
              onClick={onLogout}
              className="px-3 py-2 rounded-xl bg-zinc-900 hover:bg-red-950 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer flex items-center gap-2 text-xs font-bold"
            >
              <LogOut className="w-4 h-4" /> Log Out
            </button>
          ) : (
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Status Toast */}
        {statusMessage && (
          <div
            className={`px-4 py-2.5 text-xs font-bold flex items-center justify-between ${
              statusMessage.type === 'success'
                ? 'bg-[#00FF66]/15 text-[#00FF66] border-b border-[#00FF66]/30'
                : 'bg-red-500/15 text-red-400 border-b border-red-500/30'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-zinc-400 hover:text-white text-xs underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-4 divide-x divide-zinc-800/80 bg-zinc-900/50 border-b border-zinc-800 text-center py-2.5 px-3">
          <div>
            <span className="text-[11px] text-zinc-400 block font-medium">Accounts</span>
            <span className="text-sm font-black text-white">{usersList.length}</span>
          </div>
          <div>
            <span className="text-[11px] text-zinc-400 block font-medium">Suspended</span>
            <span className="text-sm font-black text-red-400">{suspendedCount}</span>
          </div>
          <div>
            <span className="text-[11px] text-zinc-400 block font-medium">Reports</span>
            <span className="text-sm font-black text-amber-400">{reportsList.length}</span>
          </div>
          <div>
            <span className="text-[11px] text-zinc-400 block font-medium">Admin Role</span>
            <span className="text-sm font-black text-[#00FF66]">{main ? 'Authorized' : 'Delegate'}</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 px-4 pt-3 border-b border-zinc-800 bg-zinc-950 overflow-x-auto scrollbar-none">
          {canOpenAccounts && (
            <button
              onClick={() => setActiveTab('users')}
              className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'users'
                  ? 'border-[#00FF66] text-[#00FF66]'
                  : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" /> Account Moderation ({usersList.length})
            </button>
          )}

          {canHandleReports && (
            <button
              onClick={() => setActiveTab('reports')}
              className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'reports'
                  ? 'border-amber-400 text-amber-400'
                  : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              <ShieldAlert className="w-4 h-4" /> Safety Reports ({reportsList.length})
            </button>
          )}

          {canNotify && (
            <button
              onClick={() => setActiveTab('notify')}
              className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'notify'
                  ? 'border-[#00FF66] text-[#00FF66]'
                  : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              <Bell className="w-4 h-4" /> Custom Notification
            </button>
          )}

          {main && (
            <button
              onClick={() => setActiveTab('staff')}
              className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'staff'
                  ? 'border-sky-400 text-sky-400'
                  : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4" /> Admin Team ({staffList.length})
            </button>
          )}

          {main && (
            <button
              onClick={() => setActiveTab('activity')}
              className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'activity'
                  ? 'border-sky-400 text-sky-400'
                  : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              <History className="w-4 h-4" /> Activity Log
            </button>
          )}

          {main && (
            <button
              onClick={() => setActiveTab('content')}
              className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'content'
                  ? 'border-[#00FF66] text-[#00FF66]'
                  : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              <Image className="w-4 h-4" /> Content
            </button>
          )}

          {main && (
            <button
              onClick={() => setActiveTab('joinRequests')}
              className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'joinRequests'
                  ? 'border-violet-400 text-violet-300'
                  : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              <Briefcase className="w-4 h-4" /> Join Requests ({joinRequests.filter((a) => a.status === 'pending').length})
            </button>
          )}

          {main && (
            <button
              onClick={() => setActiveTab('sparkxRequests')}
              className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'sparkxRequests'
                  ? 'border-orange-400 text-orange-300'
                  : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              <Rocket className="w-4 h-4" /> SparkX ({sparkxRequests.filter((a) => a.status === 'pending').length})
            </button>
          )}

          {main && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`pb-2.5 px-3 text-xs font-bold flex items-center gap-2 border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'border-amber-400 text-amber-300'
                  : 'border-transparent text-zinc-400 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" /> Platform
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {!(main || canOpenAccounts || canHandleReports || canNotify) ? (
            <div className="py-12 px-4 text-center space-y-2">
              <ShieldCheck className="w-8 h-8 text-sky-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Your admin access is active</h4>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                {currentUser.adminPermissions && currentUser.adminPermissions.length > 0
                  ? `You can: ${currentUser.adminPermissions.map(permissionLabel).join(', ')}. These work directly where they happen (in the Shop, Coupons, posts, reels, stories and chats) — there is nothing more to manage in this panel.`
                  : 'You do not have any admin powers right now.'}
              </p>
            </div>
          ) : activeTab === 'users' ? (
            <div className="space-y-3">
              {/* Search bar & Refresh */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={canViewAccounts ? 'Search accounts by @username, name, or email...' : 'Search accounts by @username or name...'}
                    className="w-full bg-zinc-900 text-xs text-white pl-9 pr-3 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]"
                  />
                </div>
                <button
                  onClick={loadUsers}
                  className="p-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl border border-zinc-800 cursor-pointer"
                  title="Refresh User List"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Users List */}
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
                  <Loader2 className="w-6 h-6 animate-spin text-[#00FF66]" />
                  <span className="text-xs">Loading accounts database...</span>
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="py-10 text-center text-zinc-500 text-xs">
                  No accounts found matching "{searchQuery}".
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredUsers.map((user) => {
                    const isMainRow = user.username.toLowerCase() === 'noob';
                    // nobody acts on their own account, on the main admin, or (for delegates) on any other admin
                    const isSelf = user.id === currentUser.id || isMainRow || (!main && !!user.isStaff);
                    const isSuspended = Boolean(user.isSuspended);

                    return (
                      <div
                        key={user.id}
                        className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                          isSuspended
                            ? 'bg-red-950/20 border-red-500/30'
                            : 'bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={user.avatar || '/noob-logo.svg.jpeg'}
                            alt={user.username}
                            className="w-10 h-10 rounded-full object-cover border border-zinc-700 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-white truncate">@{user.username}</span>
                              {user.isVerified && <VerifiedBadge size="sm" />}
                              {isSuspended && (
                                <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold border border-red-500/30">
                                  Suspended
                                </span>
                              )}
                              {isMainRow ? (
                                <span className="text-[10px] bg-[#00FF66]/20 text-[#00FF66] px-2 py-0.5 rounded-full font-bold border border-[#00FF66]/30">
                                  Primary Admin
                                </span>
                              ) : user.isStaff ? (
                                <span className="text-[10px] bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full font-bold border border-sky-500/30">
                                  Admin Team
                                </span>
                              ) : null}
                            </div>
                            <span className="text-[11px] text-zinc-400 block truncate">
                              {user.displayName || user.email || 'NOOB Member'} • {user.followersCount || 0} followers • {(user.noobPoints || 0).toLocaleString()} noobs
                            </span>
                            {isSuspended && user.suspendedReason && (
                              <span className="text-[10px] text-red-400/80 block truncate">
                                Reason: {user.suspendedReason}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="shrink-0 flex items-center gap-1.5">
                          {canViewAccounts && (
                            <button
                              onClick={() => setSelectedUserForDetails(user)}
                              title="View full account details (email, phone, age, etc.)"
                              className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                            >
                              <Info className="w-3.5 h-3.5" />
                              Details
                            </button>
                          )}
                          {canAdjustPoints && (
                            <button
                              onClick={() => {
                                setSelectedUserForPoints(user);
                                setPointsInput(String(user.noobPoints || 0));
                                setPointsReason('');
                              }}
                              disabled={actionLoading === user.id || (!main && isSelf)}
                              title="Set this account's NOOB Points balance"
                              className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Coins className="w-3.5 h-3.5" />
                              Points
                            </button>
                          )}
                          {isSelf ? (
                            <span className="text-[11px] text-zinc-500 font-bold px-3 py-1.5">Immune</span>
                          ) : (
                            <>
                              {canSuspend && (isSuspended ? (
                                <button
                                  onClick={() => handleToggleSuspend(user, false)}
                                  disabled={actionLoading === user.id}
                                  className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  {actionLoading === user.id ? 'Unsuspending...' : 'Unsuspend'}
                                </button>
                              ) : (
                                <button
                                  onClick={() => setSelectedUserForSuspend(user)}
                                  disabled={actionLoading === user.id}
                                  className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                  Suspend
                                </button>
                              ))}
                              {canDelete && (
                                <button
                                  onClick={() => setSelectedUserForDelete(user)}
                                  disabled={actionLoading === user.id}
                                  title="Permanently delete this account and their content"
                                  className="p-1.5 bg-zinc-900 hover:bg-red-600 text-zinc-400 hover:text-white border border-zinc-800 hover:border-red-600 rounded-xl transition-all cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!canSuspend && !canDelete && !canAdjustPoints && !canViewAccounts && (
                                <span className="text-[11px] text-zinc-600 px-3 py-1.5">View only</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'reports' ? (
            /* Safety Reports Moderation Tab */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-white">Trust &amp; Safety Incident Reports</span>
                </div>
                <button
                  onClick={loadReports}
                  className="text-xs text-[#00FF66] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingReports ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>

              {loadingReports ? (
                <div className="py-12 text-center">
                  <Loader2 className="w-7 h-7 animate-spin text-[#00FF66] mx-auto mb-2" />
                  <p className="text-xs text-zinc-400">Loading safety reports...</p>
                </div>
              ) : reportsList.length === 0 ? (
                <div className="py-12 text-center bg-zinc-900/40 rounded-2xl border border-zinc-800 p-6 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-[#00FF66] mx-auto" />
                  <h4 className="text-sm font-bold text-white">Zero Pending Incidents</h4>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    All submitted reports have been reviewed, or no safety violations have been flagged by members.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reportsList.map((rep) => (
                    <div
                      key={rep.id}
                      className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-3 hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={rep.targetAvatar || '/noob-logo.svg.jpeg'}
                            alt={rep.targetUsername}
                            className="w-9 h-9 rounded-full object-cover border border-zinc-700 shrink-0"
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white">@{rep.targetUsername}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                                Reported Account
                              </span>
                            </div>
                            <span className="text-[11px] text-zinc-400 block">
                              Reported by <span className="text-zinc-300 font-medium">@{rep.reporterUsername || 'Anonymous'}</span> • {new Date(rep.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                        </div>

                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                            rep.status === 'resolved'
                              ? 'bg-emerald-500/20 text-[#00FF66] border-emerald-500/30'
                              : rep.status === 'dismissed'
                              ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          }`}
                        >
                          {rep.status === 'pending_review' ? 'Pending Review' : rep.status}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-zinc-400">Violation:</span>
                        <span className="px-2 py-0.5 rounded-lg bg-rose-950/60 text-rose-300 border border-rose-800/40 text-[11px] font-bold">
                          {rep.reason}
                        </span>
                      </div>

                      {rep.details && (
                        <div className="p-2.5 bg-zinc-950/80 rounded-xl border border-zinc-800/80 text-xs text-zinc-300 leading-relaxed">
                          <span className="text-[10px] font-bold text-zinc-500 block uppercase mb-0.5">Details</span>
                          {rep.details}
                        </div>
                      )}

                      {Array.isArray(rep.evidence) && rep.evidence.length > 0 && (
                        <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 overflow-hidden">
                          <button
                            onClick={() =>
                              setExpandedEvidence((prev) => {
                                const next = new Set(prev);
                                next.has(rep.id) ? next.delete(rep.id) : next.add(rep.id);
                                return next;
                              })
                            }
                            className="w-full flex items-center justify-between gap-2 px-2.5 py-2 text-left cursor-pointer"
                          >
                            <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                              <MessageSquareLock className="w-3.5 h-3.5" />
                              Reported chat ({rep.evidence.length} message{rep.evidence.length === 1 ? '' : 's'} the reporter shared)
                            </span>
                            {expandedEvidence.has(rep.id) ? <ChevronUp className="w-3.5 h-3.5 text-amber-400" /> : <ChevronDown className="w-3.5 h-3.5 text-amber-400" />}
                          </button>
                          {expandedEvidence.has(rep.id) && (
                            <div className="px-2.5 pb-2.5 space-y-1.5 max-h-56 overflow-y-auto">
                              <p className="text-[10px] text-amber-200/70 leading-snug pb-1">
                                Only this one reported conversation — attached by the reporter's own device when they filed
                                this report. This chat is end-to-end encrypted; NOOB never has any other way to read it.
                              </p>
                              {rep.evidence.map((m: any, i: number) => (
                                <div key={i} className="text-[11px] bg-zinc-950/60 rounded-lg px-2 py-1.5">
                                  <span className="font-bold text-zinc-300">@{m.senderUsername}: </span>
                                  <span className="text-zinc-400">{m.text || (m.mediaType ? `[${m.mediaType}]` : '')}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {rep.status !== 'resolved' && rep.status !== 'dismissed' && (
                        <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/60">
                          <button
                            onClick={() => handleReportAction(rep.id, 'resolved', true)}
                            disabled={actionLoading === rep.id}
                            className="flex-1 py-2 px-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <UserX className="w-3.5 h-3.5" /> Suspend &amp; Resolve
                          </button>
                          <button
                            onClick={() => handleReportAction(rep.id, 'resolved', false)}
                            disabled={actionLoading === rep.id}
                            className="flex-1 py-2 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-[#00FF66] disabled:opacity-50 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Resolve Report
                          </button>
                          <button
                            onClick={() => handleReportAction(rep.id, 'dismissed', false)}
                            disabled={actionLoading === rep.id}
                            className="py-2 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-50 rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'notify' ? (
            /* Custom Notification Dispatch Form */
            <form onSubmit={handleSendNotification} className="space-y-4">
              <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-3">
                <span className="text-xs font-bold text-white block">1. Select Target Recipient</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNotifTargetType('all')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      notifTargetType === 'all'
                        ? 'bg-[#00FF66] text-black border-[#00FF66] shadow-[0_0_12px_rgba(0,255,102,0.3)]'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    <Users className="w-4 h-4" /> Broadcast to All Users
                  </button>

                  <button
                    type="button"
                    onClick={() => setNotifTargetType('specific')}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      notifTargetType === 'specific'
                        ? 'bg-[#00FF66] text-black border-[#00FF66] shadow-[0_0_12px_rgba(0,255,102,0.3)]'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    <Send className="w-4 h-4" /> Direct to Specific Account
                  </button>
                </div>

                {notifTargetType === 'specific' && (
                  <div className="pt-2">
                    <label className="text-xs text-zinc-400 block mb-1">Target Account Username</label>
                    <input
                      type="text"
                      value={notifTargetUsername}
                      onChange={(e) => setNotifTargetUsername(e.target.value)}
                      placeholder="e.g. gamer_pro (without @)"
                      className="w-full bg-zinc-950 text-xs text-white p-2.5 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]"
                    />
                  </div>
                )}
              </div>

              <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-3">
                <span className="text-xs font-bold text-white block">2. Compose Notification</span>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Notification Title</label>
                  <input
                    type="text"
                    value={notifTitle}
                    onChange={(e) => setNotifTitle(e.target.value)}
                    placeholder="e.g. ⚡ Official Community Announcement"
                    className="w-full bg-zinc-950 text-xs text-white p-2.5 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]"
                  />
                </div>

                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Notification Message</label>
                  <textarea
                    rows={4}
                    value={notifMessage}
                    onChange={(e) => setNotifMessage(e.target.value)}
                    placeholder="Write your official message to members here..."
                    className="w-full bg-zinc-950 text-xs text-white p-2.5 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66] resize-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSendingNotif}
                className="w-full py-3 bg-[#00FF66] hover:bg-[#00FF66]/90 text-black font-black text-xs rounded-2xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,255,102,0.3)] transition-all cursor-pointer disabled:opacity-50"
              >
                {isSendingNotif ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Dispatching Notification...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Dispatch Official Notification
                  </>
                )}
              </button>
            </form>
          ) : activeTab === 'staff' && main ? (
            /* Admin Team: give other people admin powers — only the ones ticked */
            <div className="space-y-4">
              <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-3">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-sky-400" /> Give someone admin access
                  </span>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Pick a member, then tick exactly what they may do. They can only use what you tick, everything they do is written to the
                    Activity Log, and you can change or remove their access at any time.
                  </p>
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={staffSearch}
                    onChange={(e) => setStaffSearch(e.target.value)}
                    placeholder="Search a member by @username or name..."
                    className="w-full bg-zinc-950 text-xs text-white pl-9 pr-3 py-2.5 rounded-xl border border-zinc-800 outline-none focus:border-sky-400"
                  />
                </div>
                {staffSearch.trim() && (
                  <div className="space-y-1.5">
                    {usersList
                      .filter((u) => !u.isStaff && u.username.toLowerCase() !== 'noob' && !u.isAi &&
                        (u.username.toLowerCase().includes(staffSearch.trim().toLowerCase().replace(/^@/, '')) ||
                          u.displayName?.toLowerCase().includes(staffSearch.trim().toLowerCase())))
                      .slice(0, 6)
                      .map((u) => (
                        <div key={u.id} className="flex items-center justify-between gap-3 p-2 rounded-xl bg-zinc-950/70 border border-zinc-800">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img src={u.avatar || '/noob-logo.svg.jpeg'} alt="" className="w-8 h-8 rounded-full object-cover border border-zinc-700 shrink-0" referrerPolicy="no-referrer" />
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-white block truncate">@{u.username}</span>
                              <span className="text-[10px] text-zinc-500 block truncate">{u.displayName || 'NOOB Member'}</span>
                            </div>
                          </div>
                          <button
                            onClick={() => openStaffEditor({ userId: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar })}
                            className="px-3 py-1.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded-xl text-xs font-bold cursor-pointer shrink-0"
                          >
                            Choose
                          </button>
                        </div>
                      ))}
                    {usersList.filter((u) => !u.isStaff && u.username.toLowerCase().includes(staffSearch.trim().toLowerCase().replace(/^@/, ''))).length === 0 && (
                      <p className="text-[11px] text-zinc-500 text-center py-2">No matching member without admin access.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Current admin team ({staffList.length})</span>
                  <button onClick={loadStaff} className="text-xs text-sky-300 hover:underline flex items-center gap-1 cursor-pointer font-medium">
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingStaff ? 'animate-spin' : ''}`} /> Refresh
                  </button>
                </div>
                {staffList.length === 0 ? (
                  <div className="py-8 text-center bg-zinc-900/40 rounded-2xl border border-zinc-800 text-xs text-zinc-500">
                    Nobody else has admin access yet. Only you can use this panel.
                  </div>
                ) : (
                  staffList.map((m) => (
                    <div key={m.userId} className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img src={m.avatar || '/noob-logo.svg.jpeg'} alt="" className="w-9 h-9 rounded-full object-cover border border-zinc-700 shrink-0" referrerPolicy="no-referrer" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-white truncate">@{m.username}</span>
                              {m.isVerified && <VerifiedBadge size="sm" />}
                            </div>
                            <span className="text-[10px] text-zinc-500 block truncate">
                              {m.permissions.length} of {ADMIN_PERMISSIONS.length} powers{m.grantedAt ? ` • since ${formatExactDateTime(m.grantedAt)}` : ''}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => openStaffEditor(m, m.permissions)}
                            disabled={savingStaff}
                            className="px-3 py-1.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                          >
                            Edit access
                          </button>
                          <button
                            onClick={() => removeStaffAccess(m)}
                            disabled={savingStaff}
                            className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {m.permissions.map((p) => (
                          <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 font-semibold">
                            {permissionLabel(p)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : activeTab === 'activity' && main ? (
            /* Activity Log: what every admin did */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-sky-400" /> What the admin team has done
                </span>
                <button onClick={loadAudit} className="text-xs text-sky-300 hover:underline flex items-center gap-1 cursor-pointer font-medium">
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingAudit ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>
              {loadingAudit && auditEntries.length === 0 ? (
                <div className="py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-sky-400 mx-auto mb-2" />
                  <p className="text-xs text-zinc-400">Loading the activity log...</p>
                </div>
              ) : auditEntries.length === 0 ? (
                <div className="py-10 text-center bg-zinc-900/40 rounded-2xl border border-zinc-800 text-xs text-zinc-500">
                  Nothing yet. Every admin action from now on is recorded here.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {auditEntries.map((e) => (
                    <div key={e.id} className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
                      <p className="text-xs text-zinc-200 leading-relaxed">{describeAudit(e)}</p>
                      <span className="text-[10px] text-zinc-500">{formatExactDateTime(e.at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'content' && main ? (
            /* Content browser: every post/reel/story on the platform, not just who the admin follows */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 p-1 bg-zinc-900 rounded-xl border border-zinc-800">
                  {(['posts', 'reels', 'stories'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setContentType(t)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                        contentType === t ? 'bg-[#00FF66] text-black' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button onClick={() => loadContent(contentType)} className="text-xs text-[#00FF66] hover:underline flex items-center gap-1 cursor-pointer font-medium">
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingContent ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>

              {loadingContent ? (
                <div className="py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-[#00FF66] mx-auto mb-2" />
                  <p className="text-xs text-zinc-400">Loading {contentType}...</p>
                </div>
              ) : contentItems.length === 0 ? (
                <div className="py-10 text-center bg-zinc-900/40 rounded-2xl border border-zinc-800 text-xs text-zinc-500">
                  No {contentType} yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {contentItems.map((item) => (
                    <div key={item.id} className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 flex items-center gap-3">
                      {item.mediaUrl || item.imageUrl ? (
                        <img
                          src={item.mediaUrl || item.imageUrl}
                          alt=""
                          className="w-12 h-12 rounded-xl object-cover border border-zinc-800 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                          {contentType === 'reels' ? <Film className="w-5 h-5 text-zinc-500" /> : contentType === 'stories' ? <Camera className="w-5 h-5 text-zinc-500" /> : <Image className="w-5 h-5 text-zinc-500" />}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-bold text-white block truncate">@{item.username}</span>
                        <span className="text-[11px] text-zinc-400 block truncate">
                          {(item.caption || item.text || 'No caption').slice(0, 80)}
                        </span>
                        <span className="text-[10px] text-zinc-500">{formatExactDateTime(item.createdAt)}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteContent(item)}
                        disabled={deletingContentId === item.id}
                        className="p-2 bg-zinc-900 hover:bg-red-600 text-zinc-400 hover:text-white border border-zinc-800 hover:border-red-600 rounded-xl transition-all cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'joinRequests' && main ? (
            /* "Apply to join us" submissions */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-violet-300" /> Team Applications
                </span>
                <button onClick={loadJoinRequests} className="text-xs text-violet-300 hover:underline flex items-center gap-1 cursor-pointer font-medium">
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingJoinRequests ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>

              {loadingJoinRequests ? (
                <div className="py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-violet-300 mx-auto mb-2" />
                  <p className="text-xs text-zinc-400">Loading applications...</p>
                </div>
              ) : joinRequests.length === 0 ? (
                <div className="py-10 text-center bg-zinc-900/40 rounded-2xl border border-zinc-800 text-xs text-zinc-500">
                  No applications yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {joinRequests.map((app) => (
                    <div key={app.id} className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <img src={app.avatar || '/noob-logo.svg.jpeg'} alt={app.username} className="w-9 h-9 rounded-full object-cover border border-zinc-700 shrink-0" />
                          <div>
                            <span className="text-xs font-bold text-white block">{app.fullName} <span className="text-zinc-500 font-normal">@{app.username}</span></span>
                            <span className="text-[11px] text-violet-300 font-semibold">{app.roleInterested}</span>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                            app.status === 'accepted'
                              ? 'bg-emerald-500/20 text-[#00FF66] border-emerald-500/30'
                              : app.status === 'declined'
                              ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          }`}
                        >
                          {app.status}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">{app.whyJoin}</p>
                      {app.experience && <p className="text-[11px] text-zinc-400"><span className="text-zinc-500 font-bold">Experience: </span>{app.experience}</p>}
                      {app.availability && <p className="text-[11px] text-zinc-400"><span className="text-zinc-500 font-bold">Availability: </span>{app.availability}</p>}
                      {app.contact && <p className="text-[11px] text-zinc-400"><span className="text-zinc-500 font-bold">Contact: </span>{app.contact}</p>}
                      <span className="text-[10px] text-zinc-500 block">{formatExactDateTime(app.createdAt)}</span>
                      {app.status === 'pending' && (
                        <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/60">
                          <button
                            onClick={() => handleReviewJoinRequest(app.id, 'accepted')}
                            className="flex-1 py-2 px-2.5 bg-[#00FF66] hover:opacity-90 text-black rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                          </button>
                          <button
                            onClick={() => handleReviewJoinRequest(app.id, 'declined')}
                            className="flex-1 py-2 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'sparkxRequests' && main ? (
            /* SparkX (IIT Bombay Techfest) team registrations */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <Rocket className="w-4 h-4 text-orange-300" /> SparkX Applications
                </span>
                <button onClick={loadSparkxRequests} className="text-xs text-orange-300 hover:underline flex items-center gap-1 cursor-pointer font-medium">
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingSparkxRequests ? 'animate-spin' : ''}`} /> Refresh
                </button>
              </div>

              {selectedSparkxIds.size > 0 && (
                <div ref={meetingFormRef} className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-orange-200 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5" /> Schedule meeting — {selectedSparkxIds.size} selected
                    </span>
                    <button onClick={() => setSelectedSparkxIds(new Set())} className="text-[11px] text-zinc-400 hover:text-white cursor-pointer">Clear</button>
                  </div>
                  <input
                    type="text"
                    value={meetingForm.topic}
                    onChange={(e) => setMeetingForm((f) => ({ ...f, topic: e.target.value }))}
                    placeholder="Topic (e.g. NOOB)"
                    className="w-full bg-zinc-900 text-xs text-white px-3 py-2 rounded-xl border border-zinc-800 outline-none focus:border-orange-400"
                  />
                  <input
                    type="text"
                    value={meetingForm.time}
                    onChange={(e) => setMeetingForm((f) => ({ ...f, time: e.target.value }))}
                    placeholder="Time (e.g. Sep 28, 2026 02:30 PM Mumbai, Kolkata, New Delhi) *"
                    className="w-full bg-zinc-900 text-xs text-white px-3 py-2 rounded-xl border border-zinc-800 outline-none focus:border-orange-400"
                  />
                  <input
                    type="text"
                    value={meetingForm.zoomLink}
                    onChange={(e) => setMeetingForm((f) => ({ ...f, zoomLink: e.target.value }))}
                    placeholder="Zoom meeting link *"
                    className="w-full bg-zinc-900 text-xs text-white px-3 py-2 rounded-xl border border-zinc-800 outline-none focus:border-orange-400"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={meetingForm.meetingId}
                      onChange={(e) => setMeetingForm((f) => ({ ...f, meetingId: e.target.value }))}
                      placeholder="Meeting ID (optional)"
                      className="flex-1 bg-zinc-900 text-xs text-white px-3 py-2 rounded-xl border border-zinc-800 outline-none focus:border-orange-400"
                    />
                    <input
                      type="text"
                      value={meetingForm.passcode}
                      onChange={(e) => setMeetingForm((f) => ({ ...f, passcode: e.target.value }))}
                      placeholder="Passcode (optional)"
                      className="flex-1 bg-zinc-900 text-xs text-white px-3 py-2 rounded-xl border border-zinc-800 outline-none focus:border-orange-400"
                    />
                  </div>
                  <button
                    onClick={handleSendMeetingInvite}
                    disabled={sendingMeetingInvite || !meetingForm.time.trim() || !meetingForm.zoomLink.trim()}
                    className="w-full py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    {sendingMeetingInvite && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {sendingMeetingInvite ? 'Sending…' : `Send invite to ${selectedSparkxIds.size} applicant${selectedSparkxIds.size === 1 ? '' : 's'}`}
                  </button>
                </div>
              )}

              {loadingSparkxRequests ? (
                <div className="py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-orange-300 mx-auto mb-2" />
                  <p className="text-xs text-zinc-400">Loading applications...</p>
                </div>
              ) : sparkxRequests.length === 0 ? (
                <div className="py-10 text-center bg-zinc-900/40 rounded-2xl border border-zinc-800 text-xs text-zinc-500">
                  No applications yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {sparkxRequests.map((app) => {
                    const selected = selectedSparkxIds.has(app.id);
                    return (
                    <div key={app.id} className={`p-4 rounded-2xl border space-y-2.5 ${selected ? 'bg-orange-500/10 border-orange-400/40' : 'bg-zinc-900/60 border-zinc-800'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => toggleSparkxSelection(app.id)}
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${selected ? 'bg-orange-500 border-orange-400' : 'border-zinc-600 hover:border-orange-400'}`}
                            title="Select for a meeting invite"
                            aria-label="Select for a meeting invite"
                          >
                            {selected && <Check className="w-3.5 h-3.5 text-black" />}
                          </button>
                          <img src={app.avatar || '/noob-logo.svg.jpeg'} alt={app.username} className="w-9 h-9 rounded-full object-cover border border-zinc-700 shrink-0" />
                          <div>
                            <span className="text-xs font-bold text-white block">{app.fullName} <span className="text-zinc-500 font-normal">@{app.username}</span></span>
                            <span className="text-[11px] text-orange-300 font-semibold">{app.grade} · {app.schoolName}</span>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                            app.status === 'accepted'
                              ? 'bg-emerald-500/20 text-[#00FF66] border-emerald-500/30'
                              : app.status === 'declined'
                              ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          }`}
                        >
                          {app.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400"><span className="text-zinc-500 font-bold">Can contribute: </span>{app.contribution}</p>
                      <p className="text-[11px] text-zinc-400"><span className="text-zinc-500 font-bold">AI knowledge: </span>{app.aiKnowledge}</p>
                      {app.experience && <p className="text-[11px] text-zinc-400"><span className="text-zinc-500 font-bold">Experience: </span>{app.experience}</p>}
                      {app.availability && <p className="text-[11px] text-zinc-400"><span className="text-zinc-500 font-bold">Availability: </span>{app.availability}</p>}
                      {app.contact && <p className="text-[11px] text-zinc-400"><span className="text-zinc-500 font-bold">Contact: </span>{app.contact}</p>}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-zinc-500">{formatExactDateTime(app.createdAt)}</span>
                        {app.meetingInvitedAt && (
                          <span className="text-[10px] text-orange-300 font-semibold flex items-center gap-1">
                            <Send className="w-3 h-3" /> Meeting invite sent {formatExactDateTime(app.meetingInvitedAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/60">
                        {app.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleReviewSparkxRequest(app.id, 'accepted')}
                              className="flex-1 py-2 px-2.5 bg-[#00FF66] hover:opacity-90 text-black rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Accept
                            </button>
                            <button
                              onClick={() => handleReviewSparkxRequest(app.id, 'declined')}
                              className="flex-1 py-2 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-[11px] font-bold transition-colors cursor-pointer"
                            >
                              Decline
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleInviteOne(app.id)}
                          className="flex-1 py-2 px-2.5 bg-orange-500 hover:bg-orange-400 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" /> Invite
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeTab === 'settings' && main ? (
            /* Platform-wide toggles */
            <div className="space-y-3">
              {loadingSettings ? (
                <div className="py-12 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-[#00FF66] mx-auto mb-2" />
                </div>
              ) : (
                <>
                  <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold text-white block">New sign-ups</span>
                      <span className="text-[11px] text-zinc-400">
                        {signupsEnabled ? 'Anyone can create a NOOB account.' : 'New accounts are paused — the sign-up screen shows a notice instead.'}
                      </span>
                    </div>
                    <button onClick={handleToggleSignups} disabled={savingSettings} className="shrink-0 cursor-pointer disabled:opacity-50">
                      {signupsEnabled ? <ToggleRight className="w-9 h-9 text-[#00FF66]" /> : <ToggleLeft className="w-9 h-9 text-zinc-600" />}
                    </button>
                  </div>

                  <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-white block">Whole-app maintenance lock</span>
                        <span className="text-[11px] text-zinc-400">
                          {maintenanceEnabled ? 'Everyone but you sees the message below instead of the app.' : 'The app is open to everyone.'}
                        </span>
                      </div>
                      <button onClick={handleToggleMaintenance} disabled={savingSettings} className="shrink-0 cursor-pointer disabled:opacity-50">
                        {maintenanceEnabled ? <ToggleRight className="w-9 h-9 text-amber-400" /> : <ToggleLeft className="w-9 h-9 text-zinc-600" />}
                      </button>
                    </div>
                    <div>
                      <label className="text-[11px] text-zinc-400 block mb-1.5">Message shown while locked</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={maintenanceMessage}
                          onChange={(e) => setMaintenanceMessage(e.target.value)}
                          className="flex-1 bg-zinc-950 text-xs text-white px-3 py-2 rounded-xl border border-zinc-800 outline-none focus:border-amber-400"
                        />
                        <button
                          onClick={handleSaveMaintenanceMessage}
                          disabled={savingSettings}
                          className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold text-white flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4 text-orange-400" /> Shop NOOB orders
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        {storeOrdersEnabled ? 'Customers can place new orders.' : 'New orders are paused — the delivery charge stays as set in the Shop.'}
                      </span>
                    </div>
                    <button onClick={handleToggleStoreOrders} disabled={savingSettings} className="shrink-0 cursor-pointer disabled:opacity-50">
                      {storeOrdersEnabled ? <ToggleRight className="w-9 h-9 text-orange-400" /> : <ToggleLeft className="w-9 h-9 text-zinc-600" />}
                    </button>
                  </div>

                  {/* Shareable links */}
                  <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800 space-y-4">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <LinkIcon className="w-4 h-4 text-cyan-400" /> Share Links
                    </span>

                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-white block">NOOB App</span>
                        <span className="text-[10px] text-zinc-500 truncate block">{appLink}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => copyLink('app', appLink)}
                          className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg cursor-pointer"
                          title="Copy link"
                        >
                          {copiedLinkKey === 'app' ? <Check className="w-3.5 h-3.5 text-[#00FF66]" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => shareLink('app', 'NOOB', appLink)}
                          className="p-2 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 rounded-lg cursor-pointer"
                          title="Share"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-zinc-800/60">
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-white block">Apply to Join Us</span>
                        <span className="text-[10px] text-zinc-500 truncate block">{joinTeamLink}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => copyLink('join', joinTeamLink)}
                          className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg cursor-pointer"
                          title="Copy link"
                        >
                          {copiedLinkKey === 'join' ? <Check className="w-3.5 h-3.5 text-[#00FF66]" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => shareLink('join', 'Join the NOOB team', joinTeamLink)}
                          className="p-2 bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 rounded-lg cursor-pointer"
                          title="Share"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-zinc-800/60 space-y-2">
                      <span className="text-xs font-bold text-white block">Share a Profile</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={shareProfileInput}
                          onChange={(e) => setShareProfileInput(e.target.value)}
                          placeholder="@username"
                          className="flex-1 bg-zinc-950 text-xs text-white px-3 py-2 rounded-xl border border-zinc-800 outline-none focus:border-cyan-400"
                        />
                        <button
                          onClick={() => copyLink('profile', profileLink)}
                          disabled={!profileLink}
                          className="p-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-300 rounded-lg cursor-pointer"
                          title="Copy link"
                        >
                          {copiedLinkKey === 'profile' ? <Check className="w-3.5 h-3.5 text-[#00FF66]" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => shareLink('profile', `@${shareProfileInput.trim()} on NOOB`, profileLink)}
                          disabled={!profileLink}
                          className="p-2 bg-cyan-500/15 hover:bg-cyan-500/25 disabled:opacity-40 text-cyan-300 rounded-lg cursor-pointer"
                          title="Share"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {profileLink && <span className="text-[10px] text-zinc-500 truncate block">{profileLink}</span>}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-zinc-500">You do not have access to this section.</div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-zinc-900/80 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
          <span>NOOB Admin Engine v2.0 • Real-time Account Oversight</span>
          {!fullPage && (
            <button onClick={onClose} className="text-white hover:underline cursor-pointer font-bold">
              Close Panel
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Sub-Modal for Suspending */}
      {selectedUserForSuspend && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-red-500/50 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <ShieldAlert className="w-6 h-6" />
              <h3 className="text-base font-black text-white">Suspend @{selectedUserForSuspend.username}?</h3>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Suspending this account will block their login access and flag their profile. You can reverse this anytime from the admin panel.
            </p>

            <div>
              <label className="text-xs text-zinc-300 font-bold block mb-1">Reason for Suspension</label>
              <input
                type="text"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="e.g. Violation of community safety guidelines"
                className="w-full bg-zinc-900 text-xs text-white p-2.5 rounded-xl border border-zinc-800 outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setSelectedUserForSuspend(null)}
                className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleToggleSuspend(selectedUserForSuspend, true, suspendReason)}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black shadow-lg cursor-pointer"
              >
                Confirm Suspension
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Points-adjustment sub-modal */}
      {selectedUserForPoints && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-amber-500/50 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <Coins className="w-6 h-6" />
              <h3 className="text-base font-black text-white">Adjust @{selectedUserForPoints.username}'s Points</h3>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Current balance: <span className="text-white font-bold">{(selectedUserForPoints.noobPoints || 0).toLocaleString()} noobs</span>.
              Set a new balance below — use this to correct a duped/exploited amount.
            </p>

            <div>
              <label className="text-xs text-zinc-300 font-bold block mb-1">New Balance</label>
              <input
                type="number"
                min={0}
                value={pointsInput}
                onChange={(e) => setPointsInput(e.target.value)}
                className="w-full bg-zinc-900 text-xs text-white p-2.5 rounded-xl border border-zinc-800 outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="text-xs text-zinc-300 font-bold block mb-1">Reason (optional)</label>
              <input
                type="text"
                value={pointsReason}
                onChange={(e) => setPointsReason(e.target.value)}
                placeholder="e.g. Corrected an exploited game-payout bug"
                className="w-full bg-zinc-900 text-xs text-white p-2.5 rounded-xl border border-zinc-800 outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setSelectedUserForPoints(null)}
                className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const parsed = Number(pointsInput);
                  if (!Number.isFinite(parsed) || parsed < 0) {
                    setStatusMessage({ text: 'Enter a valid, non-negative number.', type: 'error' });
                    return;
                  }
                  handleAdjustPoints(selectedUserForPoints, parsed);
                }}
                disabled={actionLoading === selectedUserForPoints.id}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black rounded-xl text-xs font-black shadow-lg cursor-pointer"
              >
                {actionLoading === selectedUserForPoints.id ? 'Updating...' : 'Update Balance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Account Details Sub-Modal — everything GET /api/admin/users
          returns except the password, which the server never sends here in
          the first place (sanitizeUser strips it before this data leaves
          the server). */}
      {selectedUserForDetails && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-950 border border-sky-500/40 rounded-3xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={selectedUserForDetails.avatar || '/noob-logo.svg.jpeg'}
                  alt={selectedUserForDetails.username}
                  className="w-11 h-11 rounded-full object-cover border border-zinc-700 shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-black text-white truncate">
                      {selectedUserForDetails.displayName || selectedUserForDetails.username}
                    </h3>
                    {selectedUserForDetails.isVerified && <VerifiedBadge size="sm" />}
                  </div>
                  <span className="text-xs text-zinc-400">@{selectedUserForDetails.username}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserForDetails(null)}
                className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Contact Information */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> Contact Information
                </span>
                <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-zinc-500">Email</span>
                    <span className="text-xs text-white font-medium text-right break-all">
                      {selectedUserForDetails.email || 'Not provided'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-zinc-500 flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</span>
                    <span className="text-xs text-white font-medium">
                      {selectedUserForDetails.mobileNumber
                        ? `${selectedUserForDetails.countryCode || ''} ${selectedUserForDetails.mobileNumber}`.trim()
                        : 'Not provided'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Personal Details */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Cake className="w-3.5 h-3.5" /> Personal Details
                </span>
                <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-zinc-500">Date of Birth</span>
                    <span className="text-xs text-white font-medium">
                      {selectedUserForDetails.dateOfBirth || 'Not provided'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-zinc-500">Age</span>
                    <span className="text-xs text-white font-medium">
                      {calculateAge(selectedUserForDetails.dateOfBirth)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-zinc-500">Gender</span>
                    <span className="text-xs text-white font-medium">{selectedUserForDetails.gender || 'Not provided'}</span>
                  </div>
                  {selectedUserForDetails.pronouns && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-zinc-500">Pronouns</span>
                      <span className="text-xs text-white font-medium">{selectedUserForDetails.pronouns}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-zinc-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> City</span>
                    <span className="text-xs text-white font-medium">{selectedUserForDetails.city || 'Not provided'}</span>
                  </div>
                  {selectedUserForDetails.website && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-zinc-500 flex items-center gap-1"><Globe2 className="w-3 h-3" /> Website</span>
                      <span className="text-xs text-white font-medium truncate max-w-[60%]">{selectedUserForDetails.website}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Business Details (only if this is a business account) */}
              {selectedUserForDetails.isBusiness && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5" /> Business Details
                  </span>
                  <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-zinc-500">Category</span>
                      <span className="text-xs text-white font-medium">{selectedUserForDetails.businessCategory || 'Not provided'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-zinc-500">Business Email</span>
                      <span className="text-xs text-white font-medium break-all text-right">{selectedUserForDetails.businessEmail || 'Not provided'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-zinc-500">Business Phone</span>
                      <span className="text-xs text-white font-medium">{selectedUserForDetails.businessPhone || 'Not provided'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-zinc-500">Address</span>
                      <span className="text-xs text-white font-medium text-right">{selectedUserForDetails.businessAddress || 'Not provided'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Account Info */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Fingerprint className="w-3.5 h-3.5" /> Account Info
                </span>
                <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-zinc-500">Account ID</span>
                    <span className="text-[11px] text-zinc-300 font-mono break-all text-right">{selectedUserForDetails.id}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-zinc-500">Account Type</span>
                    <span className="text-xs text-white font-medium capitalize">{selectedUserForDetails.accountType}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-zinc-500">Verification</span>
                    <span className="text-xs text-white font-medium capitalize">
                      {selectedUserForDetails.isVerified ? selectedUserForDetails.verificationTier || 'Verified' : 'Not Verified'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-zinc-500">NOOB Pro</span>
                    <span className="text-xs text-white font-medium capitalize">
                      {selectedUserForDetails.proTier ? `${selectedUserForDetails.proTier} (${selectedUserForDetails.proBilling || 'monthly'})` : 'Free plan'}
                    </span>
                  </div>
                  {selectedUserForDetails.isSuspended && (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-zinc-500">Suspension Reason</span>
                      <span className="text-xs text-red-400 font-medium text-right">{selectedUserForDetails.suspendedReason || 'Not specified'}</span>
                    </div>
                  )}
                  {/* Exact join time and last known IP — kept together at the
                      bottom of the card since these two are the pieces an
                      admin actually pulls this panel up to check. */}
                  <div className="pt-2 mt-1 border-t border-zinc-800 space-y-2">
                    {(selectedUserForDetails as any).createdAt && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] text-zinc-500 shrink-0">Joined</span>
                        <span className="text-xs text-white font-medium text-right break-all">
                          {formatExactDateTime((selectedUserForDetails as any).createdAt)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-zinc-500 shrink-0 flex items-center gap-1">
                        <Fingerprint className="w-3 h-3" /> IP Address
                      </span>
                      <span className="text-[11px] text-zinc-300 font-mono text-right break-all">
                        {(selectedUserForDetails as any).ipAddress || 'Not recorded'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] text-zinc-500 shrink-0 flex items-center gap-1">
                        <Smartphone className="w-3 h-3" /> Sign-up Platform
                      </span>
                      <span className="text-[11px] text-zinc-300 text-right">
                        {(selectedUserForDetails as any).signupPlatform || 'Not recorded'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Platform Activity Stats */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Platform Stats
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
                    <span className="text-sm font-black text-white block">{selectedUserForDetails.followersCount || 0}</span>
                    <span className="text-[10px] text-zinc-500">Followers</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
                    <span className="text-sm font-black text-white block">{selectedUserForDetails.followingCount || 0}</span>
                    <span className="text-[10px] text-zinc-500">Following</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
                    <span className="text-sm font-black text-white block">{selectedUserForDetails.postsCount || 0}</span>
                    <span className="text-[10px] text-zinc-500">Posts</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
                    <span className="text-sm font-black text-amber-400 block">{(selectedUserForDetails.noobPoints || 0).toLocaleString()}</span>
                    <span className="text-[10px] text-zinc-500">NOOB Points</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
                    <span className="text-sm font-black text-white block">{selectedUserForDetails.gamesPlayedCount || 0}</span>
                    <span className="text-[10px] text-zinc-500">Games Played</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center">
                    <span className="text-sm font-black text-white block">{selectedUserForDetails.gamesWonCount || 0}</span>
                    <span className="text-[10px] text-zinc-500">Games Won</span>
                  </div>
                </div>
              </div>

              {selectedUserForDetails.bio && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">Bio</span>
                  <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-300 leading-relaxed">
                    {selectedUserForDetails.bio}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-zinc-800 shrink-0">
              <button
                onClick={() => setSelectedUserForDetails(null)}
                className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Sub-Modal for Permanent Deletion */}
      {selectedUserForDelete && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-red-500/50 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-base font-black text-white">Delete @{selectedUserForDelete.username}?</h3>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              This permanently deletes the account along with every post, reel, and comment it authored. This
              cannot be undone — suspend the account instead if you just want to block their access.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setSelectedUserForDelete(null)}
                className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteUser(selectedUserForDelete)}
                disabled={actionLoading === selectedUserForDelete.id}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg cursor-pointer"
              >
                {actionLoading === selectedUserForDelete.id ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin access editor: tick exactly what this person may do */}
      {staffEditor && (
        <div className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-zinc-950 border border-sky-500/40 rounded-3xl shadow-2xl flex flex-col max-h-[88vh]">
            <div className="p-5 border-b border-zinc-800 flex items-center gap-3 shrink-0">
              <img src={staffEditor.avatar || '/noob-logo.svg.jpeg'} alt="" className="w-10 h-10 rounded-full object-cover border border-zinc-700 shrink-0" referrerPolicy="no-referrer" />
              <div className="min-w-0">
                <h3 className="text-sm font-black text-white truncate">
                  {staffEditor.existing ? 'Change' : 'Give'} admin access — @{staffEditor.username}
                </h3>
                <p className="text-[11px] text-zinc-400">Tick everything this person is allowed to do. Anything left unticked stays blocked.</p>
              </div>
            </div>

            <div className="p-4 overflow-y-auto space-y-2">
              <div className="flex items-center justify-end gap-3 text-[11px] font-bold">
                <button type="button" onClick={() => setEditorPerms(ADMIN_PERMISSIONS.map((p) => p.key))} className="text-sky-300 hover:underline cursor-pointer">Tick all</button>
                <button type="button" onClick={() => setEditorPerms([])} className="text-zinc-400 hover:underline cursor-pointer">Untick all</button>
              </div>
              {ADMIN_PERMISSIONS.map((p) => {
                const checked = editorPerms.includes(p.key);
                return (
                  <label
                    key={p.key}
                    className={`flex items-start gap-3 p-3 rounded-2xl border cursor-pointer transition-colors ${
                      checked ? 'bg-sky-500/10 border-sky-500/40' : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePerm(p.key)}
                      className="mt-0.5 w-4 h-4 accent-sky-400 cursor-pointer shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="text-xs font-bold text-white block">{p.label}</span>
                      <span className="text-[11px] text-zinc-400 block leading-snug">{p.description}</span>
                    </span>
                  </label>
                );
              })}
              {editorPerms.includes('delete_accounts') && (
                <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 leading-snug">
                  Deleting an account can not be undone. Only give this to someone you fully trust.
                </p>
              )}
            </div>

            <div className="p-4 border-t border-zinc-800 shrink-0 space-y-2">
              <p className="text-[10px] text-zinc-500 text-center">@{staffEditor.username} gets a notification when their access changes.</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStaffEditor(null)}
                  disabled={savingStaff}
                  className="flex-1 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveStaff()}
                  disabled={savingStaff || (editorPerms.length === 0 && !staffEditor.existing)}
                  className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-black rounded-xl text-xs font-black shadow-lg cursor-pointer"
                >
                  {savingStaff ? 'Saving...' : editorPerms.length === 0 ? 'Remove all access' : `Save (${editorPerms.length} allowed)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

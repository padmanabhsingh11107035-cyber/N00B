import React, { useState, useEffect } from 'react';
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
  Trash2
} from 'lucide-react';
import { User } from '../../types';
import { fetchAdminUsersList, suspendUserAccount, deleteUserAccount, sendAdminNotification, fetchAdminReports, takeAdminReportAction } from '../../services/api';
import { VerifiedBadge } from '../Common/VerifiedBadge';

interface AdminControlModalProps {
  currentUser: User;
  onClose: () => void;
}

export const AdminControlModal: React.FC<AdminControlModalProps> = ({ currentUser, onClose }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'reports' | 'notify'>('users');
  const [usersList, setUsersList] = useState<User[]>([]);
  const [reportsList, setReportsList] = useState<any[]>([]);
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

  useEffect(() => {
    loadUsers();
    loadReports();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await fetchAdminUsersList();
      if (res.success && res.users) {
        setUsersList(res.users);
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
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="w-full max-w-2xl bg-zinc-950 border border-[#00FF66]/40 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,255,102,0.15)] flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-zinc-900 via-zinc-950 to-zinc-900 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl overflow-hidden border-2 border-[#00FF66] shadow-[0_0_12px_rgba(0,255,102,0.4)] bg-black p-0.5">
              <img src="/noob-logo.svg.jpeg" alt="NOOB Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">NOOB Admin Control Panel</h2>
                <VerifiedBadge size="sm" />
              </div>
              <p className="text-xs text-zinc-400">Master Platform Overseer • Logged in as @{currentUser.username}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
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
            <span className="text-sm font-black text-[#00FF66]">Authorized</span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 px-4 pt-3 border-b border-zinc-800 bg-zinc-950 overflow-x-auto scrollbar-none">
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
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'users' ? (
            <div className="space-y-3">
              {/* Search bar & Refresh */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search accounts by @username, name, or email..."
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
                    const isSelf = user.id === currentUser.id || user.username.toLowerCase() === 'noob';
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
                              {isSelf && (
                                <span className="text-[10px] bg-[#00FF66]/20 text-[#00FF66] px-2 py-0.5 rounded-full font-bold border border-[#00FF66]/30">
                                  Primary Admin
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-zinc-400 block truncate">
                              {user.displayName || user.email || 'NOOB Member'} • {user.followersCount || 0} followers
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
                          {isSelf ? (
                            <span className="text-[11px] text-zinc-500 font-bold px-3 py-1.5">Immune</span>
                          ) : (
                            <>
                              {isSuspended ? (
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
                              )}
                              <button
                                onClick={() => setSelectedUserForDelete(user)}
                                disabled={actionLoading === user.id}
                                title="Permanently delete this account and their content"
                                className="p-1.5 bg-zinc-900 hover:bg-red-600 text-zinc-400 hover:text-white border border-zinc-800 hover:border-red-600 rounded-xl transition-all cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
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
          ) : (
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
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-zinc-900/80 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
          <span>NOOB Admin Engine v2.0 • Real-time Account Oversight</span>
          <button onClick={onClose} className="text-white hover:underline cursor-pointer font-bold">
            Close Panel
          </button>
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
    </div>
  );
};

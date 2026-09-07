import React, { useState } from 'react';
import {
  X,
  Heart,
  MessageCircle,
  UserPlus,
  UserCheck,
  Bell,
  Sparkles,
  Check,
  Shield,
  Sliders,
  Settings,
  Flame,
  Music,
  Gamepad2,
  CheckCircle2,
  Trash2,
  Volume2,
  BellOff,
  BellRing
} from 'lucide-react';
import { AppNotification, NotificationType, User } from '../../types';

export interface NotificationSettingsState {
  masterEnabled: boolean;
  followRequests: boolean;
  newFollowers: boolean;
  likesComments: boolean;
  gamesLeaderboard: boolean;
  musicHub: boolean;
  soundAlerts: boolean;
}

interface NotificationsModalProps {
  currentUser: User;
  notifications: AppNotification[];
  notificationSettings: NotificationSettingsState;
  onUpdateSettings: (settings: NotificationSettingsState) => void;
  onClose: () => void;
  onAcceptFollowRequest: (notifId: string, actorUsername: string) => void;
  onDeclineFollowRequest: (notifId: string, actorUsername: string) => void;
  onClearAll: () => void;
  onSimulateNotification: (type?: NotificationType) => void;
  onNavigateToUser?: (username: string) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  currentUser,
  notifications,
  notificationSettings,
  onUpdateSettings,
  onClose,
  onAcceptFollowRequest,
  onDeclineFollowRequest,
  onClearAll,
  onSimulateNotification,
  onNavigateToUser
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'requests' | 'settings'>('all');
  const [filterType, setFilterType] = useState<string>('all');

  const filteredNotifications = notifications.filter((n) => {
    if (!notificationSettings.masterEnabled) return false;
    
    // Check specific setting filters
    if (n.type === 'follow_request_received' || n.type === 'follow_request_accepted') {
      if (!notificationSettings.followRequests) return false;
    } else if (n.type === 'new_follower') {
      if (!notificationSettings.newFollowers) return false;
    } else if (n.type === 'post_like' || n.type === 'post_comment') {
      if (!notificationSettings.likesComments) return false;
    } else if (n.type === 'game_challenge') {
      if (!notificationSettings.gamesLeaderboard) return false;
    } else if (n.type === 'music_share') {
      if (!notificationSettings.musicHub) return false;
    }

    if (activeTab === 'requests') {
      return n.type === 'follow_request_received' || n.type === 'follow_request_accepted';
    }

    if (filterType === 'all') return true;
    if (filterType === 'follows') return n.type === 'new_follower' || n.type === 'follow_request_accepted' || n.type === 'follow_request_received';
    if (filterType === 'likes') return n.type === 'post_like' || n.type === 'post_comment';
    if (filterType === 'games_music') return n.type === 'game_challenge' || n.type === 'music_share';
    return true;
  });

  const followRequestsCount = notifications.filter((n) => n.type === 'follow_request_received' && n.actionStatus === 'pending').length;

  const renderIcon = (type: NotificationType) => {
    switch (type) {
      case 'admin_broadcast':
      case 'admin_direct':
        return <Shield className="w-3.5 h-3.5 text-[#00FF66]" />;
      case 'follow_request_accepted':
        return <UserCheck className="w-3.5 h-3.5 text-[#00FF66]" />;
      case 'follow_request_received':
        return <UserPlus className="w-3.5 h-3.5 text-purple-400" />;
      case 'new_follower':
        return <UserPlus className="w-3.5 h-3.5 text-cyan-400" />;
      case 'post_like':
        return <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500" />;
      case 'post_comment':
        return <MessageCircle className="w-3.5 h-3.5 text-blue-400" />;
      case 'game_challenge':
        return <Gamepad2 className="w-3.5 h-3.5 text-yellow-400" />;
      case 'music_share':
        return <Music className="w-3.5 h-3.5 text-pink-400" />;
      default:
        return <Sparkles className="w-3.5 h-3.5 text-[#00FF66]" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[88vh]">
        {/* Header */}
        <header className="p-4 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#00FF66] to-cyan-400 p-[1.5px] flex items-center justify-center">
              <div className="w-full h-full bg-black rounded-[14px] flex items-center justify-center">
                <BellRing className="w-4 h-4 text-[#00FF66]" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-white">
                  Notifications &amp; Activity
                </h3>
                {notificationSettings.masterEnabled ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00FF66]/20 text-[#00FF66] font-bold border border-[#00FF66]/30">
                    Live ON
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold border border-rose-500/30">
                    Paused
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">Followers, requests, likes &amp; game updates</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Tab switcher */}
        <div className="grid grid-cols-3 text-center text-xs font-bold border-b border-zinc-800 bg-zinc-900/40 px-2 pt-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`pb-2.5 transition-all border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'all'
                ? 'border-[#00FF66] text-[#00FF66]'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Bell className="w-3.5 h-3.5" /> All Activity
          </button>

          <button
            onClick={() => setActiveTab('requests')}
            className={`pb-2.5 transition-all border-b-2 flex items-center justify-center gap-1.5 cursor-pointer relative ${
              activeTab === 'requests'
                ? 'border-purple-400 text-purple-400'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" /> Follow Requests
            {followRequestsCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-purple-500 text-black text-[10px] font-black flex items-center justify-center">
                {followRequestsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-2.5 transition-all border-b-2 flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'settings'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5" /> Toggle Alerts
          </button>
        </div>

        {/* Filters chips (in all tab) */}
        {activeTab === 'all' && (
          <div className="px-4 py-2 border-b border-zinc-800/80 bg-zinc-950 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
            {[
              { id: 'all', label: 'All' },
              { id: 'follows', label: '👥 Followers & Requests' },
              { id: 'likes', label: '❤️ Likes & Comments' },
              { id: 'games_music', label: '🎮 Games & Music' }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  filterType === f.id
                    ? 'bg-[#00FF66] text-black font-bold'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5">
          {/* TAB 1: ALL NOTIFICATIONS / TAB 2: REQUESTS */}
          {(activeTab === 'all' || activeTab === 'requests') && (
            <>
              {!notificationSettings.masterEnabled && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BellOff className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Notifications are currently paused in your settings.</span>
                  </div>
                  <button
                    onClick={() => onUpdateSettings({ ...notificationSettings, masterEnabled: true })}
                    className="px-2.5 py-1 bg-amber-400 text-black font-bold rounded-lg text-[10px] cursor-pointer shrink-0"
                  >
                    Resume
                  </button>
                </div>
              )}

              {filteredNotifications.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-600">
                    <Bell className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-zinc-300">No notifications here</h4>
                  <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                    When someone follows you, accepts your request, or likes your post, you'll see it here instantly.
                  </p>
                  <button
                    onClick={() => onSimulateNotification('new_follower')}
                    className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-xl text-xs font-semibold cursor-pointer transition-colors inline-flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#00FF66]" /> Send Test Follower Notification
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredNotifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-3 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                        !notif.isRead
                          ? 'bg-zinc-900/90 border-[#00FF66]/30 shadow-sm'
                          : 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {/* Avatar with type badge */}
                        <div className="relative shrink-0">
                          <img
                            src={notif.senderAvatar || notif.actorAvatar || '/noob-logo.svg'}
                            alt={notif.senderUsername || notif.actorUsername || 'User'}
                            className="w-10 h-10 rounded-2xl object-cover ring-1 ring-zinc-700"
                            referrerPolicy="no-referrer"
                          />
                          <span className="absolute -bottom-1 -right-1 p-1 rounded-full bg-zinc-950 border border-zinc-800 shadow-sm">
                            {renderIcon(notif.type)}
                          </span>
                        </div>

                        {/* Notification text & time */}
                        <div className="flex-1 min-w-0">
                          {notif.title && (
                            <div className="text-xs font-black text-[#00FF66] mb-0.5 flex items-center gap-1">
                              <span>{notif.title}</span>
                              {notif.senderUsername?.toLowerCase() === 'noob' && (
                                <span className="text-[10px] bg-[#00FF66]/20 text-[#00FF66] px-1.5 py-0.2 rounded font-bold">
                                  Official Admin
                                </span>
                              )}
                            </div>
                          )}

                          <div className="text-xs text-zinc-300 leading-relaxed">
                            <span className="font-bold text-white hover:text-[#00FF66] transition-colors cursor-pointer mr-1">
                              @{notif.senderUsername || notif.actorUsername}
                            </span>
                            <span>{notif.message || notif.text}</span>
                          </div>

                          {notif.detail && (
                            <div className="mt-1 p-2 rounded-xl bg-black/60 border border-zinc-800/80 text-[11px] text-zinc-400 italic">
                              "{notif.detail}"
                            </div>
                          )}

                          <span className="text-[10px] text-zinc-500 font-medium block mt-1">
                            {notif.time}
                          </span>

                          {/* Action Buttons for Follow Request Received */}
                          {notif.type === 'follow_request_received' && notif.actionStatus === 'pending' && (
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                onClick={() => onAcceptFollowRequest(notif.id, notif.actorUsername)}
                                className="px-3 py-1 bg-[#00FF66] hover:bg-emerald-400 text-black text-xs font-black rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
                              >
                                <Check className="w-3.5 h-3.5" /> Accept
                              </button>
                              <button
                                onClick={() => onDeclineFollowRequest(notif.id, notif.actorUsername)}
                                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                          )}

                          {notif.type === 'follow_request_received' && notif.actionStatus === 'accepted' && (
                            <div className="mt-1.5 flex items-center gap-1 text-[11px] text-[#00FF66] font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Follow request approved
                            </div>
                          )}

                          {notif.type === 'follow_request_received' && notif.actionStatus === 'declined' && (
                            <div className="mt-1.5 text-[11px] text-zinc-500 font-medium">
                              Request dismissed
                            </div>
                          )}
                        </div>
                      </div>

                      {!notif.isRead && (
                        <span className="w-2 h-2 rounded-full bg-[#00FF66] shrink-0 mt-2 shadow-[0_0_8px_rgba(0,255,102,0.8)]" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* TAB 3: NOTIFICATION SETTINGS & TOGGLES */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              {/* Master Push Alert Toggle */}
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${notificationSettings.masterEnabled ? 'bg-[#00FF66]/20 text-[#00FF66]' : 'bg-zinc-800 text-zinc-500'}`}>
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs sm:text-sm font-bold text-white">Master Notification Bar</h4>
                    <p className="text-xs text-zinc-400">Receive live alerts and unread count badges</p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notificationSettings.masterEnabled}
                    onChange={(e) => onUpdateSettings({ ...notificationSettings, masterEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00FF66]" />
                </label>
              </div>

              {/* Granular Toggles */}
              <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-3.5">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Category Preferences
                </h4>

                {/* 1. Follow Requests & Approvals */}
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <span className="text-xs font-bold text-white block">Follow Requests &amp; Approvals</span>
                    <span className="text-[11px] text-zinc-500">When someone requests to follow your private account</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notificationSettings.followRequests}
                    onChange={(e) => onUpdateSettings({ ...notificationSettings, followRequests: e.target.checked })}
                    className="w-4 h-4 accent-[#00FF66] rounded cursor-pointer"
                  />
                </div>

                {/* 2. New Followers */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                  <div>
                    <span className="text-xs font-bold text-white block">New Followers</span>
                    <span className="text-[11px] text-zinc-500">When someone starts following your profile</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notificationSettings.newFollowers}
                    onChange={(e) => onUpdateSettings({ ...notificationSettings, newFollowers: e.target.checked })}
                    className="w-4 h-4 accent-[#00FF66] rounded cursor-pointer"
                  />
                </div>

                {/* 3. Likes & Comments */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                  <div>
                    <span className="text-xs font-bold text-white block">Likes, Reactions &amp; Comments</span>
                    <span className="text-[11px] text-zinc-500">Activity on your Feed posts and Reels</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notificationSettings.likesComments}
                    onChange={(e) => onUpdateSettings({ ...notificationSettings, likesComments: e.target.checked })}
                    className="w-4 h-4 accent-[#00FF66] rounded cursor-pointer"
                  />
                </div>

                {/* 4. Games & Leaderboard */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                  <div>
                    <span className="text-xs font-bold text-white block">50 Mini-Games &amp; Leaderboards</span>
                    <span className="text-[11px] text-zinc-500">Rank promotions and arcade challenge invites</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notificationSettings.gamesLeaderboard}
                    onChange={(e) => onUpdateSettings({ ...notificationSettings, gamesLeaderboard: e.target.checked })}
                    className="w-4 h-4 accent-[#00FF66] rounded cursor-pointer"
                  />
                </div>

                {/* 5. Music Hub */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                  <div>
                    <span className="text-xs font-bold text-white block">Music Hub Tracks &amp; Playlists</span>
                    <span className="text-[11px] text-zinc-500">Track uploads and playlist adds</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={notificationSettings.musicHub}
                    onChange={(e) => onUpdateSettings({ ...notificationSettings, musicHub: e.target.checked })}
                    className="w-4 h-4 accent-[#00FF66] rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* Live Test Trigger Section */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-zinc-900 to-zinc-900 border border-purple-500/30 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <h4 className="text-xs font-bold text-white">Simulate Live Incoming Alerts</h4>
                </div>
                <p className="text-[11px] text-zinc-400">
                  Test the real-time notification count badges and alerts by triggering mock events:
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => onSimulateNotification('follow_request_received')}
                    className="p-2 rounded-xl bg-purple-900/40 hover:bg-purple-900/60 border border-purple-500/40 text-[11px] text-purple-200 font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-3 h-3 text-purple-400" /> Follow Request
                  </button>
                  <button
                    onClick={() => onSimulateNotification('follow_request_accepted')}
                    className="p-2 rounded-xl bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-500/40 text-[11px] text-emerald-200 font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <UserCheck className="w-3 h-3 text-[#00FF66]" /> Request Accepted
                  </button>
                  <button
                    onClick={() => onSimulateNotification('new_follower')}
                    className="p-2 rounded-xl bg-cyan-900/40 hover:bg-cyan-900/60 border border-cyan-500/40 text-[11px] text-cyan-200 font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-3 h-3 text-cyan-400" /> New Follower
                  </button>
                  <button
                    onClick={() => onSimulateNotification('post_like')}
                    className="p-2 rounded-xl bg-rose-900/40 hover:bg-rose-900/60 border border-rose-500/40 text-[11px] text-rose-200 font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <Heart className="w-3 h-3 text-rose-400" /> Post Liked
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="p-3 bg-zinc-900/80 border-t border-zinc-800 flex items-center justify-between text-xs px-4">
          <button
            onClick={onClearAll}
            className="text-zinc-500 hover:text-rose-400 flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear All Activity
          </button>
          <span className="text-[11px] text-zinc-500 font-medium">
            {notifications.length} Total Alerts
          </span>
        </footer>
      </div>
    </div>
  );
};

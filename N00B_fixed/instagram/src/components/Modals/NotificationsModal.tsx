import React, { useRef, useState } from 'react';
import {
  ChevronLeft,
  MoreVertical,
  Heart,
  MessageCircle,
  UserPlus,
  UserCheck,
  Bell,
  Sparkles,
  Check,
  Shield,
  Gamepad2,
  Music,
  CheckCircle2,
  Trash2,
  Volume2,
  VolumeX,
  BellOff,
  Coins,
  Gift,
  Camera,
  Radio,
  Bot,
  SlidersHorizontal
} from 'lucide-react';
import { ShoppingBag, Phone, Lightbulb } from 'lucide-react';
import { AppNotification, NotificationType, User } from '../../types';
import { openNoobDraw } from '../Draw/drawStore';
import { isNotificationSoundOn, setNotificationSoundOn } from '../../utils/notificationSound';
import { NOTIFICATION_FILTERS, matchesFilter } from '../../utils/notificationFilters';

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
  onAcceptFollowRequest: (notifId: string, actorId: string) => void;
  onDeclineFollowRequest: (notifId: string, actorId: string) => void;
  onFollowBack?: (userId: string) => void;
  onRespondSuggestedUser?: (notifId: string, actorId: string, accept: boolean) => void;
  onClearAll: () => void;
  // remove ONE notification from this person's list (the red bin that a swipe to the left shows)
  onDeleteOne?: (notifId: string) => void;
  onNavigateToUser?: (username: string) => void;
  onOpenScratchCard?: (scratchCardId: string) => void;
  onOpenChat?: (chatId: string) => void;
  onOpenLiveLoungeInvite?: (roomId: string) => void;
  // a planned meeting (invitation, reminder, cancellation, a registration to approve): opens that meeting's page
  onOpenLiveLoungeMeeting?: (meetingId: string) => void;
}

// The date of a notification, read the safe way (a phone browser only reads 3 digits of the fraction of a second).
const toDate = (iso?: string | null): Date | null => {
  if (!iso) return null;
  const d = new Date(String(iso).replace(/(\.\d{3})\d+/, '$1'));
  return isNaN(d.getTime()) ? null : d;
};
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** "Today, 5 Nov" / "Yesterday, 4 Nov" / "Mon, 2 Nov" (the year too when it is not this year): the heading above each day's notifications. */
export const dateGroupLabel = (iso: string, now: Date = new Date()): string => {
  const d = toDate(iso);
  if (!d) return '';
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  const dm = d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}) });
  if (diffDays <= 0) return `Today, ${dm}`;
  if (diffDays === 1) return `Yesterday, ${dm}`;
  return `${d.toLocaleDateString([], { weekday: 'short' })}, ${dm}`;
};
/** "8:26 am": the time of day, in the viewer's own time. */
export const clockLabel = (iso: string): string => {
  const d = toDate(iso);
  return d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?(AM|PM)/, (m) => m.toLowerCase()) : '';
};

const REVEAL = 76;   // how far a card slides to show the red bin

// One notification card. Dragged to the left it slides over and shows a red bin; a tap on the bin removes it. (A tap on the card itself opens what it is about.)
const SwipeRow: React.FC<{ canDelete: boolean; onDelete: () => void; children: React.ReactNode }> = ({ canDelete, onDelete, children }) => {
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const start = useRef<{ x: number; base: number } | null>(null);
  const dragged = useRef(false);
  const shift = canDelete ? (start.current ? dx : open ? -REVEAL : 0) : 0;
  return (
    <div className="nt-swipe group" data-testid="notif-row">
      {canDelete && (
        <button type="button" className="nt-bin" aria-label="Delete this notification" data-testid="notif-delete" onClick={onDelete} tabIndex={open ? 0 : -1}>
          <Trash2 className="w-[18px] h-[18px]" />
        </button>
      )}
      <div
        className="nt-card-slide"
        style={{ transform: `translateX(${shift}px)`, transition: start.current ? 'none' : 'transform 0.2s ease', touchAction: 'pan-y' }}
        onPointerDown={(e) => { if (!canDelete) return; start.current = { x: e.clientX, base: open ? -REVEAL : 0 }; dragged.current = false; }}
        onPointerMove={(e) => {
          const s = start.current; if (!s) return;
          const mx = e.clientX - s.x;
          if (!dragged.current && Math.abs(mx) < 8) return;
          dragged.current = true;
          try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* not needed */ }
          setDx(Math.max(-REVEAL, Math.min(0, s.base + mx)));
        }}
        onPointerUp={() => { const s = start.current; if (!s) return; start.current = null; if (dragged.current) setOpen(dx < -REVEAL / 2); setDx(0); }}
        onPointerCancel={() => { start.current = null; setDx(0); }}
        onClickCapture={(e) => { if (dragged.current) { e.stopPropagation(); e.preventDefault(); dragged.current = false; } else if (open) { e.stopPropagation(); e.preventDefault(); setOpen(false); } }}
      >
        {children}
        {canDelete && (
          <button type="button" className="nt-hover-del" aria-label="Delete this notification" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  currentUser,
  notifications,
  notificationSettings,
  onUpdateSettings,
  onClose,
  onAcceptFollowRequest,
  onDeclineFollowRequest,
  onFollowBack,
  onRespondSuggestedUser,
  onClearAll,
  onDeleteOne,
  onNavigateToUser,
  onOpenScratchCard,
  onOpenChat,
  onOpenLiveLoungeInvite,
  onOpenLiveLoungeMeeting
}) => {
  const [soundOn, setSoundOn] = useState(isNotificationSoundOn());
  const [activeTab, setActiveTab] = useState<'all' | 'requests' | 'settings'>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [menuOpen, setMenuOpen] = useState(false);

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

    return matchesFilter(n.type, filterType);   // each of the six buttons shows its own kind of notification (see utils/notificationFilters.ts)
  });

  const followRequestsCount = notifications.filter((n) => n.type === 'follow_request_received' && n.actionStatus === 'pending').length;

  // Notifications already arrive newest-first, so grouping consecutive items that share a day keeps every day in order without a separate sort.
  const groupedNotifications: { label: string; items: AppNotification[] }[] = [];
  for (const notif of filteredNotifications) {
    const label = dateGroupLabel(notif.createdAt);
    const lastGroup = groupedNotifications[groupedNotifications.length - 1];
    if (lastGroup && lastGroup.label === label) lastGroup.items.push(notif);
    else groupedNotifications.push({ label, items: [notif] });
  }

  const renderIcon = (type: NotificationType) => {
    switch (type) {
      case 'noob_draw_ready':
        return <Gift className="w-3.5 h-3.5 text-pink-400" />;
      case 'admin_broadcast':
      case 'admin_direct':
        return <Shield className="w-3.5 h-3.5 text-noob" />;
      case 'follow_request_accepted':
        return <UserCheck className="w-3.5 h-3.5 text-noob" />;
      case 'follow_request_received':
        return <UserPlus className="w-3.5 h-3.5 text-purple-400" />;
      case 'new_follower':
        return <UserPlus className="w-3.5 h-3.5 text-cyan-400" />;
      case 'suggested_user':
        return <UserPlus className="w-3.5 h-3.5 text-amber-400" />;
      case 'post_like':
        return <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500" />;
      case 'post_comment':
        return <MessageCircle className="w-3.5 h-3.5 text-blue-400" />;
      case 'game_challenge':
        return <Gamepad2 className="w-3.5 h-3.5 text-yellow-400" />;
      case 'music_share':
        return <Music className="w-3.5 h-3.5 text-pink-400" />;
      case 'points_transfer':
        return <Coins className="w-3.5 h-3.5 text-amber-400" />;
      case 'points_earned':
        return <Coins className="w-3.5 h-3.5 text-noob" />;
      case 'points_removed':
        return <Coins className="w-3.5 h-3.5 text-rose-400" />;
      case 'new_message':
        return <MessageCircle className="w-3.5 h-3.5 text-[#00E5FF]" />;
      case 'call_started':
        return <Phone className="w-3.5 h-3.5 text-noob" />;
      case 'birthday_wish':
      case 'birthday_follower_alert':
        return <Gift className="w-3.5 h-3.5 text-pink-400" />;
      case 'screenshot_alert':
        return <Camera className="w-3.5 h-3.5 text-orange-400" />;
      case 'store_order':
        return <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />;
      case 'live_lounge_invite':
        return <Radio className="w-3.5 h-3.5 text-purple-400" />;
      case 'live_lounge_meeting':
        return <Radio className="w-3.5 h-3.5 text-purple-300" />;
      case 'ai_feedback_reply':
        return <Bot className="w-3.5 h-3.5 text-violet-400" />;
      case 'suggestion_reply':
        return <Lightbulb className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Sparkles className="w-3.5 h-3.5 text-noob" />;
    }
  };

  const inSettings = activeTab === 'settings';
  const toggleRows: Array<[keyof NotificationSettingsState, string, string]> = [
    ['followRequests', 'Noob Requests & Approvals', 'When someone requests to noob your private account'],
    ['newFollowers', 'New Followers', 'When someone noobs your profile'],
    ['likesComments', 'Likes, Reactions & Comments', 'Activity on your Feed posts and Reels'],
    ['gamesLeaderboard', 'Mini-Games & Leaderboards', 'Rank promotions and arcade challenge invites'],
    ['musicHub', 'Music Hub Tracks & Playlists', 'Track uploads and playlist adds']
  ];

  return (
    // a page of its own that fills the whole screen (data-noob-keep: the app's page-frame rules leave it exactly as it is); dark and light colours are in index.css (.nt)
    <div className="nt fixed inset-0 z-50 flex flex-col" data-noob-keep="1" data-testid="notifications-page" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* Header: back, the title in the middle, the three dots (sound, alert settings, clear all) */}
      <header className="nt-head">
        <button type="button" className="nt-iconbtn" aria-label="Back" data-testid="notif-back" onClick={() => (inSettings ? setActiveTab('all') : onClose())}>
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="nt-title">{inSettings ? 'Alert settings' : 'Notifications'}</h1>
        <div className="relative">
          <button type="button" className="nt-iconbtn" aria-label="More options" aria-haspopup="menu" aria-expanded={menuOpen} data-testid="notif-more" onClick={() => setMenuOpen((v) => !v)}>
            <MoreVertical className="w-5 h-5" />
          </button>
          {menuOpen && (
            <>
              <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Close the menu" onClick={() => setMenuOpen(false)} />
              <div className="nt-menu" role="menu" data-testid="notif-menu">
                <button type="button" role="menuitem" onClick={() => { const next = !soundOn; setSoundOn(next); setNotificationSoundOn(next); setMenuOpen(false); }}>
                  {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />} Sound: {soundOn ? 'on' : 'off'}
                </button>
                <button type="button" role="menuitem" onClick={() => { setActiveTab('settings'); setMenuOpen(false); }}>
                  <SlidersHorizontal className="w-4 h-4" /> Alert settings
                </button>
                <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuOpen(false); onClearAll(); }}>
                  <Trash2 className="w-4 h-4" /> Clear all notifications
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Filter chips (the six kinds, and the follow requests) */}
      {!inSettings && (
        <div className="nt-chips no-scrollbar" data-testid="notif-chips">
          {NOTIFICATION_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              data-testid={`notif-filter-${f.id}`}
              onClick={() => { setActiveTab('all'); setFilterType(f.id); }}
              className={`nt-chip ${activeTab === 'all' && filterType === f.id ? 'is-on' : ''}`}
            >
              {f.label}
            </button>
          ))}
          <button type="button" data-testid="notif-requests" onClick={() => setActiveTab(activeTab === 'requests' ? 'all' : 'requests')} className={`nt-chip ${activeTab === 'requests' ? 'is-on' : ''}`}>
            Noob Requests{followRequestsCount > 0 && <span className="nt-count">{followRequestsCount}</span>}
          </button>
        </div>
      )}

      <div className="nt-body" data-testid="notif-body">
        {/* THE LIST (all, or only the requests) */}
        {!inSettings && (
          <>
            {!notificationSettings.masterEnabled && (
              <div className="nt-card nt-paused">
                <BellOff className="w-4 h-4 shrink-0" />
                <span className="flex-1">Notifications are currently paused in your settings.</span>
                <button type="button" className="nt-btn nt-btn-primary" onClick={() => onUpdateSettings({ ...notificationSettings, masterEnabled: true })}>Resume</button>
              </div>
            )}

            {filteredNotifications.length === 0 ? (
              <div className="nt-empty">
                <div className="nt-empty-ico"><Bell className="w-6 h-6" /></div>
                <h4>No notifications here</h4>
                <p>When someone follows you, accepts your request, or likes your post, you'll see it here instantly.</p>
              </div>
            ) : (
              groupedNotifications.map((group) => (
                <section key={group.label + group.items[0].id} className="nt-group" data-testid="notif-group">
                  <h2 className="nt-date" data-testid="notif-date">{group.label}</h2>
                  {group.items.map((notif) => {
                    const opens = notif.type === 'noob_draw_ready' || ((notif.type === 'new_message' || notif.type === 'call_started') && notif.chatId) || (notif.type === 'live_lounge_invite' && notif.message) || (notif.type === 'live_lounge_meeting' && notif.message) || notif.senderUsername || notif.actorUsername;
                    return (
                      <SwipeRow key={notif.id} canDelete={!!onDeleteOne} onDelete={() => onDeleteOne?.(notif.id)}>
                        <div
                          onClick={() => {
                            if (notif.type === 'noob_draw_ready') {
                              onClose();
                              openNoobDraw();
                            } else if ((notif.type === 'new_message' || notif.type === 'call_started') && notif.chatId) {
                              onOpenChat?.(notif.chatId);
                            } else if (notif.type === 'live_lounge_invite' && notif.message) {
                              onOpenLiveLoungeInvite?.(notif.message);
                            } else if (notif.type === 'live_lounge_meeting' && notif.message) {
                              onOpenLiveLoungeMeeting?.(notif.message);
                            } else {
                              const username = notif.senderUsername || notif.actorUsername;
                              if (username) onNavigateToUser?.(username);
                            }
                          }}
                          className={`nt-card ${opens ? 'is-tappable' : ''} ${!notif.isRead ? 'is-unread' : ''}`}
                        >
                          {/* Avatar with the kind's own small icon */}
                          <div className="relative shrink-0">
                            <img
                              src={notif.senderAvatar || notif.actorAvatar || '/noob-logo.svg.jpeg'}
                              alt={notif.senderUsername || notif.actorUsername || 'User'}
                              className="nt-ava"
                              referrerPolicy="no-referrer"
                            />
                            <span className="nt-kind">{renderIcon(notif.type)}</span>
                          </div>

                          <div className="flex-1 min-w-0">
                            {notif.title && (
                              <div className="nt-card-title">
                                <span>{notif.title}</span>
                                {notif.senderUsername?.toLowerCase() === 'noob' && <span className="nt-official">Official Admin</span>}
                              </div>
                            )}
                            <div className="nt-text">
                              <span className="nt-name">{notif.senderDisplayName || notif.actorDisplayName || notif.senderUsername || notif.actorUsername}</span>{' '}
                              <span>{notif.message || notif.text}</span>
                            </div>

                            {notif.detail && <div className="nt-detail">"{notif.detail}"</div>}

                            {/* Action Buttons for Follow Request Received */}
                            {notif.type === 'follow_request_received' && notif.actionStatus === 'pending' && (
                              <div className="nt-actions">
                                <button type="button" className="nt-btn nt-btn-primary" onClick={(e) => { e.stopPropagation(); notif.actorId && onAcceptFollowRequest(notif.id, notif.actorId); }}>
                                  <Check className="w-3.5 h-3.5" /> Accept
                                </button>
                                {/* Separate from Accept: this only follows them back (raises their follower count), it does not approve their request to follow you. */}
                                {onFollowBack && notif.actorId && (
                                  <button type="button" className="nt-btn nt-btn-ghost" disabled={currentUser.followingIds?.includes(notif.actorId)} onClick={(e) => { e.stopPropagation(); onFollowBack(notif.actorId!); }}>
                                    <UserPlus className="w-3.5 h-3.5" />
                                    {currentUser.followingIds?.includes(notif.actorId) ? 'Noobed' : 'Noob Back'}
                                  </button>
                                )}
                                <button type="button" className="nt-btn nt-btn-ghost" onClick={(e) => { e.stopPropagation(); notif.actorId && onDeclineFollowRequest(notif.id, notif.actorId); }}>
                                  Delete
                                </button>
                              </div>
                            )}
                            {notif.type === 'follow_request_received' && notif.actionStatus === 'accepted' && (
                              <div className="nt-status is-ok"><CheckCircle2 className="w-3.5 h-3.5" /> Noob request approved</div>
                            )}
                            {notif.type === 'follow_request_received' && notif.actionStatus === 'declined' && <div className="nt-status">Request dismissed</div>}

                            {/* Suggested for you: a random account they don't yet follow, shown with their @handle (the bold name above is just their display name). */}
                            {notif.type === 'suggested_user' && (notif.actorUsername || notif.senderUsername) && (
                              <div className="nt-handle" translate="no">@{notif.actorUsername || notif.senderUsername}</div>
                            )}
                            {notif.type === 'suggested_user' && notif.actionStatus === 'pending' && (
                              <div className="nt-actions">
                                <button type="button" className="nt-btn nt-btn-primary" onClick={(e) => { e.stopPropagation(); notif.actorId && onRespondSuggestedUser?.(notif.id, notif.actorId, true); }}>
                                  <UserPlus className="w-3.5 h-3.5" /> Noob
                                </button>
                                <button type="button" className="nt-btn nt-btn-ghost" onClick={(e) => { e.stopPropagation(); notif.actorId && onRespondSuggestedUser?.(notif.id, notif.actorId, false); }}>
                                  Reject
                                </button>
                              </div>
                            )}
                            {notif.type === 'suggested_user' && notif.actionStatus === 'accepted' && <div className="nt-status is-ok"><CheckCircle2 className="w-3.5 h-3.5" /> Followed</div>}
                            {notif.type === 'suggested_user' && notif.actionStatus === 'declined' && <div className="nt-status">Suggestion dismissed</div>}

                            {notif.type === 'birthday_wish' && notif.scratchCardId && (
                              <button type="button" className="nt-btn nt-btn-primary nt-scratch" onClick={(e) => { e.stopPropagation(); onOpenScratchCard?.(notif.scratchCardId!); }}>
                                <Gift className="w-3.5 h-3.5" /> Scratch to Reveal 🎁
                              </button>
                            )}

                            <div className="nt-time" data-testid="notif-time">{clockLabel(notif.createdAt)}</div>
                          </div>
                          {!notif.isRead && <span className="nt-dot" aria-label="New" />}
                        </div>
                      </SwipeRow>
                    );
                  })}
                </section>
              ))
            )}
          </>
        )}

        {/* ALERT SETTINGS (opened from the three dots) */}
        {inSettings && (
          <div className="nt-group" data-testid="notif-settings">
            <div className="nt-card nt-row">
              <div className="flex-1 min-w-0">
                <h4 className="nt-row-title">Master Notification Bar</h4>
                <p className="nt-row-sub">Receive live alerts and unread count badges</p>
              </div>
              <input type="checkbox" className="nt-check" aria-label="Master Notification Bar" checked={notificationSettings.masterEnabled} onChange={(e) => onUpdateSettings({ ...notificationSettings, masterEnabled: e.target.checked })} />
            </div>
            <h2 className="nt-date">Category preferences</h2>
            {toggleRows.map(([key, title, sub]) => (
              <div key={key} className="nt-card nt-row">
                <div className="flex-1 min-w-0">
                  <h4 className="nt-row-title">{title}</h4>
                  <p className="nt-row-sub">{sub}</p>
                </div>
                <input type="checkbox" className="nt-check" aria-label={title} checked={!!notificationSettings[key]} onChange={(e) => onUpdateSettings({ ...notificationSettings, [key]: e.target.checked })} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

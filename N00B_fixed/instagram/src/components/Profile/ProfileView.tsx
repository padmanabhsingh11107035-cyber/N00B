import React, { useState, useEffect, useRef } from 'react';
import {
  Grid,
  Film,
  Bookmark,
  Heart,
  Archive,
  Settings,
  Shield,
  BarChart3,
  Lock,
  Download,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Layers,
  FolderPlus,
  Plus,
  Volume2,
  Mail,
  Phone,
  MapPin,
  Globe,
  Briefcase,
  Check,
  Twitter,
  Instagram,
  Youtube,
  Github,
  LogOut,
  MoreVertical,
  Headphones,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  HelpCircle,
  MessageCircle,
  UserX,
  Flag,
  Sun,
  Moon,
  ArrowLeft,
  Trash2,
  Trophy,
  Share2,
  UserPlus,
  UserCheck,
  MessageSquare,
  X
} from 'lucide-react';
import { Post, Reel, SavedCollection, User, AccountType } from '../../types';
import {
  fetchCollections,
  fetchLikedPosts,
  fetchArchivedPosts,
  fetchSavedPosts,
  updateCurrentUser,
  acceptFollowRequest,
  declineFollowRequest,
  blockUser,
  unblockUser,
  toggleFollowUser
} from '../../services/api';
import confetti from 'canvas-confetti';
import { EditProfileModal } from './EditProfileModal';
import { TermsAndConditions } from '../Legal/TermsAndConditions';
import { PrivacyPolicy } from '../Legal/PrivacyPolicy';
import { CustomerSupportModal } from '../Support/CustomerSupportModal';
import { HighlightManagerModal, HighlightItem } from './HighlightManagerModal';
import { HighlightViewerModal } from './HighlightViewerModal';
import { safeJsonStringify } from '../../utils/safeJson';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { FullscreenAvatarModal } from '../Common/FullscreenAvatarModal';
import { GetVerifiedModal } from './GetVerifiedModal';
import { AdminControlModal } from '../Modals/AdminControlModal';
import { AccountsStatisticsModal } from './AccountsStatisticsModal';
import { ProFeaturesModal } from './ProFeaturesModal';
import { BlockedAccountsModal } from './BlockedAccountsModal';

interface ProfileViewProps {
  currentUser: User;
  viewingUser?: User | null;
  allUsers?: User[];
  posts: Post[];
  reels: Reel[];
  onSelectPost: (post: Post) => void;
  onUpdateBio: (newBio: string) => void;
  onOpenProfessionalDashboard: () => void;
  onLogout?: () => void;
  onDeleteAllUsers?: () => void;
  onUserUpdated?: (user: User) => void;
  onToggleFollowUser?: (userId: string) => void;
  onBlockUser?: (userId: string) => void;
  onReportUser?: (userId: string, reason: string, details?: string) => void;
  onDeletePost?: (postId: string) => void;
  onDeleteReel?: (reelId: string) => void;
  onBackToMyProfile?: () => void;
  onNavigateToChatWithUser?: (user: User) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentUser,
  viewingUser,
  allUsers = [],
  posts,
  reels,
  onSelectPost,
  onUpdateBio,
  onOpenProfessionalDashboard,
  onLogout,
  onDeleteAllUsers,
  onUserUpdated,
  onToggleFollowUser,
  onBlockUser,
  onReportUser,
  onDeletePost,
  onDeleteReel,
  onBackToMyProfile,
  onNavigateToChatWithUser
}) => {
  const [activeTab, setActiveTab] = useState<'posts' | 'reels' | 'saved' | 'liked' | 'archive'>('posts');
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [likedPosts, setLikedPosts] = useState<Post[]>([]);
  const [archivedPosts, setArchivedPosts] = useState<Post[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showGetVerifiedModal, setShowGetVerifiedModal] = useState(false);
  const [showFullscreenAvatar, setShowFullscreenAvatar] = useState(false);
  const [showThreeDotsMenu, setShowThreeDotsMenu] = useState(false);
  const [showAdminControlModal, setShowAdminControlModal] = useState(false);

  // Settings Modal States
  const [accountTypeSetting, setAccountTypeSetting] = useState<AccountType>(currentUser.accountType || 'public');
  const [businessCategorySetting, setBusinessCategorySetting] = useState(currentUser.businessCategory || 'Creator & Brand');
  const [followRequests, setFollowRequests] = useState<any[]>(currentUser.followRequests || []);
  const [hideTaggedPhotos, setHideTaggedPhotos] = useState(currentUser.privacySettings?.hideTaggedPhotos ?? false);
  const [blockedWords, setBlockedWords] = useState(currentUser.privacySettings?.blockedWords?.join(', ') || '');
  const [pushFavoritesEnabled, setPushFavoritesEnabled] = useState(true);

  // Persistent Theme State (Tailwind class toggling on body element)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('noob_theme');
      if (saved === 'light' || saved === 'dark') return saved;
      if (typeof document !== 'undefined' && document.body.classList.contains('light')) return 'light';
    } catch (e) {}
    return 'dark';
  });

  const handleToggleTheme = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    try {
      localStorage.setItem('noob_theme', newTheme);
      if (newTheme === 'light') {
        document.body.classList.add('light');
      } else {
        document.body.classList.remove('light');
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem('noob_theme');
      if (saved === 'light') {
        document.body.classList.add('light');
        setTheme('light');
      } else if (saved === 'dark') {
        document.body.classList.remove('light');
        setTheme('dark');
      }
    } catch (e) {}
  }, []);

  // Modals for Accounts & Statistics, Blocked Accounts, and Report
  const [showAccountsStatisticsModal, setShowAccountsStatisticsModal] = useState(false);
  const [showProFeaturesModal, setShowProFeaturesModal] = useState(false);
  const [showBlockedAccountsModal, setShowBlockedAccountsModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [reportReason, setReportReason] = useState('Cyber Bullying & Harassment');
  const [reportDetails, setReportDetails] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [reportSuccessNotice, setReportSuccessNotice] = useState(false);

  // Target User (Either currentUser or viewingUser)
  const targetUser: User = viewingUser || currentUser;
  const isOwnProfile = !viewingUser || viewingUser.id === currentUser.id;
  const isTargetBlocked = (currentUser.blockedUserIds || []).includes(targetUser.id);
  const [isTargetFollowing, setIsTargetFollowing] = useState<boolean>(() => {
    if (targetUser.isFollowing !== undefined) return !!targetUser.isFollowing;
    return !!currentUser.followingIds?.includes(targetUser.id);
  });

  useEffect(() => {
    setIsTargetFollowing(
      targetUser.isFollowing !== undefined
        ? !!targetUser.isFollowing
        : !!currentUser.followingIds?.includes(targetUser.id)
    );
  }, [targetUser.id, targetUser.isFollowing, currentUser.followingIds]);

  // Private chat is only available between users where at least one follows the other
  const targetFollowsMe = !!targetUser.followingIds?.includes(currentUser.id);
  const canMessageTarget = isTargetFollowing || targetFollowsMe;

  // Highlights state: Start with empty / custom highlights (NO default fake icons)
  const [highlights, setHighlights] = useState<HighlightItem[]>(() => {
    try {
      const saved = localStorage.getItem(`noob_highlights_${currentUser?.id || 'me'}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [];
  });
  const [selectedHighlightForManage, setSelectedHighlightForManage] = useState<HighlightItem | null>(null);
  const [showHighlightManager, setShowHighlightManager] = useState(false);
  const [activeHighlightForViewer, setActiveHighlightForViewer] = useState<HighlightItem | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close 3-dots menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowThreeDotsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync highlights to localStorage
  const saveHighlights = (newHighlights: HighlightItem[]) => {
    setHighlights(newHighlights);
    try {
      localStorage.setItem(`noob_highlights_${currentUser?.id || 'me'}`, safeJsonStringify(newHighlights));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveHighlight = (highlight: HighlightItem) => {
    const existingIndex = highlights.findIndex((h) => h.id === highlight.id);
    let updated: HighlightItem[];
    if (existingIndex >= 0) {
      updated = [...highlights];
      updated[existingIndex] = highlight;
    } else {
      updated = [...highlights, highlight];
    }
    saveHighlights(updated);
  };

  const handleDeleteHighlight = (highlightId: string) => {
    const updated = highlights.filter((h) => h.id !== highlightId);
    saveHighlights(updated);
  };

  useEffect(() => {
    loadPrivateCollections();
    loadLikedAndArchived();
    setFollowRequests(currentUser.followRequests || []);
  }, [currentUser]);

  const loadPrivateCollections = async () => {
    try {
      const colls = await fetchCollections();
      setCollections(colls);
    } catch (err) {
      console.error(err);
    }
  };

  const loadLikedAndArchived = async () => {
    try {
      const liked = await fetchLikedPosts();
      const archived = await fetchArchivedPosts();
      const saved = await fetchSavedPosts();
      setLikedPosts(liked);
      setArchivedPosts(archived);
      setSavedPosts(saved && saved.length > 0 ? saved : posts.filter((p) => p.isSaved || currentUser.savedPostIds?.includes(p.id)));
    } catch (err) {
      console.error(err);
      setSavedPosts(posts.filter((p) => p.isSaved || currentUser.savedPostIds?.includes(p.id)));
    }
  };

  const displayedPosts = posts.filter((p) => {
    const isAuthor = p.userId === targetUser.id || p.username === targetUser.username;
    if (!isOwnProfile) return isAuthor;
    return isAuthor && !p.isArchived;
  });

  const displayedReels = reels.filter((r) => {
    return r.author?.id === targetUser.id || r.author?.username === targetUser.username;
  });

  // Builds a real deep link to this specific profile (?profile=username) rather
  // than just copying the current page URL, which is always the same generic
  // app URL since there's no per-profile routing. App.tsx reads this param on
  // load and opens the matching profile once the viewer is logged in.
  const handleShareProfile = async (username: string) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?profile=${encodeURIComponent(username)}`;
    try {
      if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Fallback for browsers/embedded contexts that block the async Clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand('copy');
      } catch {
        // Nothing more we can do; the confetti + "Copied" state below still
        // fire so the click always visibly acknowledges the tap either way.
      }
      document.body.removeChild(textarea);
    }
    confetti({ particleCount: 20, spread: 40 });
    setShareLinkCopied(true);
    setTimeout(() => setShareLinkCopied(false), 2000);
  };

  const handleToggleFollowTargetUser = async () => {
    if (isOwnProfile) return;
    try {
      const nextFollow = !isTargetFollowing;
      setIsTargetFollowing(nextFollow);
      if (onToggleFollowUser) {
        onToggleFollowUser(targetUser.id);
      } else {
        const res = await toggleFollowUser(targetUser.id);
        if (res && res.success !== undefined) {
          setIsTargetFollowing(!!res.isFollowing);
        }
      }
      if (nextFollow) {
        confetti({ particleCount: 25, spread: 50, origin: { y: 0.7 } });
      }
    } catch (err) {
      console.error(err);
      setIsTargetFollowing(!isTargetFollowing);
    }
  };

  const handleToggleBlockTargetUser = async () => {
    if (isOwnProfile) return;
    try {
      if (onBlockUser) {
        onBlockUser(targetUser.id);
      } else {
        if (isTargetBlocked) {
          const res = await unblockUser(targetUser.id);
          const newBlocked = res.blockedUserIds || (currentUser.blockedUserIds || []).filter((id) => id !== targetUser.id);
          if (onUserUpdated) onUserUpdated({ ...currentUser, blockedUserIds: newBlocked });
        } else {
          const res = await blockUser(targetUser.id);
          const newBlocked = res.blockedUserIds || [...(currentUser.blockedUserIds || []), targetUser.id];
          if (onUserUpdated) onUserUpdated({ ...currentUser, blockedUserIds: newBlocked });
        }
      }
      setShowThreeDotsMenu(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmitReport = async () => {
    if (!reportReason) return;
    setIsReporting(true);
    try {
      if (onReportUser) {
        await onReportUser(targetUser.id, reportReason, reportDetails);
      } else {
        await fetch('/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
          body: JSON.stringify({ reportedUserId: targetUser.id, reason: reportReason, details: reportDetails })
        });
      }
      setIsReporting(false);
      setReportSuccessNotice(true);
      setTimeout(() => {
        setReportSuccessNotice(false);
        setShowReportModal(false);
        setReportDetails('');
      }, 1500);
    } catch (err) {
      console.error(err);
      setIsReporting(false);
    }
  };

  const handleSavePrivacySettings = async () => {
    try {
      const res = await updateCurrentUser({
        accountType: accountTypeSetting,
        isBusiness: accountTypeSetting === 'business',
        businessCategory: accountTypeSetting === 'business' ? businessCategorySetting : undefined,
        privacySettings: {
          ...currentUser.privacySettings,
          hideTaggedPhotos,
          blockedWords: blockedWords.split(',').map((w) => w.trim()).filter(Boolean)
        }
      });
      if (res && onUserUpdated) {
        onUserUpdated(res);
      }
      setShowSettingsModal(false);
      confetti({ particleCount: 35, spread: 50, origin: { y: 0.7 } });
    } catch (err) {
      console.error(err);
    }
  };

  const handleProfileUpdated = (updatedUser: User) => {
    if (onUserUpdated) {
      onUserUpdated(updatedUser);
    }
    if (updatedUser.bio) {
      onUpdateBio(updatedUser.bio);
    }
  };

  const handleAcceptRequest = async (requesterId: string) => {
    try {
      const res = await acceptFollowRequest(requesterId);
      if (res.success) {
        setFollowRequests(res.followRequests || []);
        confetti({ particleCount: 25, spread: 45, origin: { y: 0.8 } });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeclineRequest = async (requesterId: string) => {
    try {
      const res = await declineFollowRequest(requesterId);
      if (res.success) {
        setFollowRequests(res.followRequests || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const isBusiness = targetUser.accountType === 'business' || targetUser.isBusiness;
  const isPrivate = targetUser.accountType === 'private';

  return (
    <div id="profile-view-container" className="w-full max-w-4xl mx-auto px-4 pt-4 pb-28">
      {/* Top Banner when viewing another user's profile */}
      {!isOwnProfile && (
        <div className="mb-4 flex items-center justify-between bg-zinc-900/90 border border-zinc-800 rounded-2xl px-4 py-3 shadow-lg">
          <button
            onClick={onBackToMyProfile}
            className="flex items-center gap-2 text-xs font-bold text-zinc-300 hover:text-white transition-colors cursor-pointer group"
          >
            <ArrowLeft className="w-4 h-4 text-[#00FF66] group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to My Profile</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 font-medium">@{targetUser.username}</span>
            {isTargetBlocked && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-bold">
                Blocked
              </span>
            )}
          </div>
        </div>
      )}

      {/* 1. Organized Profile Header */}
      <div className="relative bg-zinc-950 border border-zinc-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl mb-6 space-y-6">
        {/* Three-dots menu button only (top-right corner). Fixed width/height here
            keeps the trigger pinned in place — without it, this absolutely-positioned
            wrapper shrink-to-fits around its widest child, so once the w-72 dropdown
            below mounts as a child, the wrapper (and the button inside it) jumps left. */}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 w-9 h-9" ref={menuRef}>
          <button
            onClick={() => setShowThreeDotsMenu(!showThreeDotsMenu)}
            className={`liquid-glass p-2 rounded-xl transition-all cursor-pointer ${
              showThreeDotsMenu
                ? 'liquid-glass-btn-active text-[#00FF66]'
                : 'text-zinc-300 hover:text-white'
            }`}
            title="Options & Settings"
            aria-label="Options"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {/* Dropdown Menu */}
          {showThreeDotsMenu && (
            <div className="liquid-glass absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-32px)] rounded-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150 max-h-[80vh] overflow-y-auto overscroll-contain">
              {/* Universal: Theme Toggle */}
              <button
                onClick={() => {
                  handleToggleTheme(theme === 'dark' ? 'light' : 'dark');
                  setShowThreeDotsMenu(false);
                }}
                className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-white block group-hover:text-amber-400 transition-colors">
                    Appearance: {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                  </span>
                  <span className="text-[10px] text-zinc-400 block truncate">
                    Tap to switch to {theme === 'dark' ? 'Light' : 'Dark'} theme
                  </span>
                </div>
              </button>

              {isOwnProfile ? (
                <>
                  {/* Option 1: Edit Profile */}
                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      setShowEditProfileModal(true);
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#00FF66]/20 border border-[#00FF66]/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <Edit3 className="w-4 h-4 text-[#00FF66]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-white block group-hover:text-[#00FF66] transition-colors">
                        Edit Profile
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        Update bio, photo, links &amp; details
                      </span>
                    </div>
                  </button>

                  {/* Option 2: Settings & Privacy */}
                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      setAccountTypeSetting(currentUser.accountType || 'public');
                      setShowSettingsModal(true);
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <Settings className="w-4 h-4 text-zinc-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-white block group-hover:text-zinc-200 transition-colors">
                        Account Settings &amp; Privacy
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        Account type, filters &amp; notifications
                      </span>
                    </div>
                  </button>

                  {/* Option: Wallet */}
                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      setShowAccountsStatisticsModal(true);
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <Trophy className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-white block group-hover:text-amber-400 transition-colors">
                        Wallet
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        NOOB Points, transactions &amp; badges
                      </span>
                    </div>
                  </button>

                  {/* Option: Unlock Pro Features */}
                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      setShowProFeaturesModal(true);
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <Sparkles className="w-4 h-4 text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-white block group-hover:text-violet-400 transition-colors">
                        Unlock Pro Features
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        Subscriptions, perks &amp; exclusive access
                      </span>
                    </div>
                  </button>

                  {/* Option: Blocked Accounts */}
                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      setShowBlockedAccountsModal(true);
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <UserX className="w-4 h-4 text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-white block group-hover:text-red-400 transition-colors">
                        Blocked Accounts
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        Manage restricted &amp; blocked profiles
                      </span>
                    </div>
                  </button>

                  {/* Option 3: NOOB Admin Panel (Only for official NOOB admin account) */}
                  {(currentUser.isAdmin && (currentUser.username.toLowerCase() === 'noob' || currentUser.id === 'u_noob_admin')) && (
                    <button
                      onClick={() => {
                        setShowThreeDotsMenu(false);
                        setShowAdminControlModal(true);
                      }}
                      className="w-full p-2.5 rounded-xl bg-[#00FF66]/10 hover:bg-[#00FF66]/20 border border-[#00FF66]/40 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-[#00FF66]/30 border border-[#00FF66]/50 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <ShieldAlert className="w-4 h-4 text-[#00FF66]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-black text-[#00FF66] block group-hover:text-white transition-colors">
                          ⚡ NOOB Admin Panel
                        </span>
                        <span className="text-[10px] text-zinc-300 block truncate">
                          Suspend accounts &amp; dispatch notifications
                        </span>
                      </div>
                    </button>
                  )}

                  {/* Option 4: Get Verified */}
                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      setShowGetVerifiedModal(true);
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <VerifiedBadge size="sm" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-white block group-hover:text-zinc-200 transition-colors">
                        Get Verified (Verified Badge)
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        {currentUser.isVerified ? 'Badge Active' : 'Hidden Coupon or NOOB Points'}
                      </span>
                    </div>
                  </button>

                  {/* Option 5: Contact Customer Support */}
                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      setShowSupportModal(true);
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#00FF66]/20 border border-[#00FF66]/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <Headphones className="w-4 h-4 text-[#00FF66]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-white block group-hover:text-[#00FF66] transition-colors">
                        Contact Customer Support
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        Chatway AI &amp; Help Desk
                      </span>
                    </div>
                  </button>

                  {/* Option 6: Terms and Conditions */}
                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      setShowTermsModal(true);
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <FileText className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-white block group-hover:text-blue-400 transition-colors">
                        Terms and Conditions
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        Community rules &amp; service terms
                      </span>
                    </div>
                  </button>

                  {/* Option 7: Privacy Policy */}
                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      setShowPrivacyModal(true);
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <ShieldCheck className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-white block group-hover:text-purple-400 transition-colors">
                        Privacy Policy
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        Security &amp; data protection
                      </span>
                    </div>
                  </button>

                  {/* Option 8: Logout (at bottom) */}
                  {onLogout && (
                    <div className="pt-1 border-t border-zinc-800/80">
                      <button
                        onClick={() => {
                          setShowThreeDotsMenu(false);
                          onLogout();
                        }}
                        className="w-full p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                          <LogOut className="w-4 h-4 text-red-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-bold text-red-400 block">
                            Log Out of @{currentUser.username}
                          </span>
                          <span className="text-[10px] text-red-400/70 block truncate">
                            Switch or exit session
                          </span>
                        </div>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Actions for other user profiles */}
                  <button
                    onClick={() => {
                      handleToggleBlockTargetUser();
                    }}
                    className={`w-full p-2.5 rounded-xl flex items-center gap-3 text-left transition-colors group cursor-pointer ${
                      isTargetBlocked
                        ? 'hover:bg-emerald-500/10 text-emerald-400'
                        : 'hover:bg-red-500/10 text-red-400'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <UserX className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold block">
                        {isTargetBlocked ? `Unblock @${targetUser.username}` : `Block @${targetUser.username}`}
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        {isTargetBlocked ? 'Restore visibility & interactions' : 'Prevent interaction & hide profile'}
                      </span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      setShowReportModal(true);
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-amber-500/10 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <Flag className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-amber-400 block">
                        Report @{targetUser.username}
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        Report cyberbullying, harassment, or spam
                      </span>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setShowThreeDotsMenu(false);
                      handleShareProfile(targetUser.username);
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <Share2 className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-white block group-hover:text-cyan-400 transition-colors">
                        Share Profile Link
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        Copy link to clipboard
                      </span>
                    </div>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Clean, Organised Vertical Layout: Profile -> Username -> Name -> Stats */}
        <div className="flex flex-col items-center text-center space-y-4">
          {/* 1. Profile Avatar at the Top */}
          <div className="relative cursor-pointer group" onClick={() => setShowFullscreenAvatar(true)} title="View profile picture full screen">
            <div
              className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full p-[3.5px] shadow-2xl transition-transform group-hover:scale-105 ${
                isBusiness
                  ? 'bg-gradient-to-tr from-[#00FF66] to-emerald-400 shadow-[0_0_20px_rgba(0,255,102,0.3)]'
                  : isPrivate
                  ? 'bg-gradient-to-tr from-purple-500 to-pink-500 shadow-[0_0_20px_rgba(168,85,247,0.3)]'
                  : 'bg-gradient-to-tr from-[#ff4e6a] via-[#ff758c] to-[#ff9966] shadow-[0_0_20px_rgba(255,78,106,0.3)]'
              }`}
            >
              <img
                src={targetUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                alt={targetUser.username}
                className="w-full h-full rounded-full object-cover p-0.5 bg-black"
                referrerPolicy="no-referrer"
              />
            </div>
            {/* Status Note Floating Pill */}
            {targetUser.statusNote && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#121212] border border-[#ff4e6a]/60 rounded-full px-2.5 py-0.5 text-[10px] text-pink-400 font-bold shadow-lg flex items-center gap-1 whitespace-nowrap">
                <span>{targetUser.statusNote.text}</span>
                {targetUser.statusNote.musicTrack && <Volume2 className="w-3 h-3 text-pink-400 animate-pulse" />}
              </div>
            )}
          </div>

          {/* 2. Centered Username & Verified Badge (Clean, No Public Tag) */}
          <div className="flex items-center justify-center gap-2 flex-wrap pt-1">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              @{targetUser.username}
            </h1>
            {targetUser.isVerified ? (
              <VerifiedBadge size="md" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[#00FF66] fill-[#00FF66]/20" />
            )}

            {/* Account Type Badge (Only show if Business or Private; No Public tag) */}
            {isBusiness ? (
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#00FF66]/20 text-[#00FF66] font-bold border border-[#00FF66]/30 flex items-center gap-1 whitespace-nowrap">
                <Briefcase className="w-3 h-3" /> Business
              </span>
            ) : isPrivate ? (
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30 flex items-center gap-1 whitespace-nowrap">
                <Lock className="w-3 h-3" /> Private
              </span>
            ) : null}
          </div>

          {/* 3. Display Name in Perfect Line */}
          <div className="flex items-center justify-center gap-1.5 text-sm text-zinc-300 font-bold -mt-2">
            <span>{targetUser.displayName || targetUser.username}</span>
            {targetUser.pronouns && (
              <span className="text-xs text-zinc-500 font-normal">({targetUser.pronouns})</span>
            )}
          </div>

          {/* User ID Display */}
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-zinc-900 border border-zinc-700/80 text-xs font-mono font-medium -mt-2 shadow-inner">
            <span className="text-[10px] text-[#00FF66] font-extrabold uppercase tracking-wide">ID:</span>
            <span className="text-zinc-200 font-bold select-all">{targetUser.id}</span>
          </div>

          {/* 4. Symmetrical Stats Numbers Box */}
          <div className="grid grid-cols-3 divide-x divide-zinc-800 bg-zinc-900/90 border border-zinc-800/80 rounded-2xl py-3.5 px-1 sm:px-6 w-full max-w-md shadow-inner">
            <div className="text-center px-1 sm:px-2 min-w-0">
              <span className="text-lg sm:text-xl font-black text-white block leading-tight">{displayedPosts.length}</span>
              <span className="text-[9px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wide sm:tracking-wider block truncate">Posts</span>
            </div>
            <div className="text-center px-1 sm:px-2 min-w-0">
              <span className="text-lg sm:text-xl font-black text-white block leading-tight">
                {(targetUser.followersCount || 0).toLocaleString()}
              </span>
              <span className="text-[9px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wide sm:tracking-wider block truncate">Followers</span>
            </div>
            <div className="text-center px-1 sm:px-2 min-w-0">
              <span className="text-lg sm:text-xl font-black text-white block leading-tight">
                {(targetUser.followingCount || 0).toLocaleString()}
              </span>
              <span className="text-[9px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wide sm:tracking-wider block truncate">Following</span>
            </div>
          </div>

          {/* 5. Primary Action Buttons (Edit / Share vs Follow / Message / Unblock) */}
          <div className="flex items-center justify-center gap-2.5 w-full max-w-md pt-1">
            {isOwnProfile ? (
              <>
                <button
                  onClick={() => handleShareProfile(targetUser.username)}
                  className={`flex-1 py-2 px-4 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm ${
                    shareLinkCopied
                      ? 'bg-[#00FF66]/15 border-[#00FF66]/40 text-[#00FF66]'
                      : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white'
                  }`}
                  title="Share Profile Link"
                >
                  {shareLinkCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Link Copied!
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5 text-cyan-400" /> Share Profile
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                {isTargetBlocked ? (
                  <button
                    onClick={handleToggleBlockTargetUser}
                    className="flex-1 py-2 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <UserCheck className="w-3.5 h-3.5" /> Unblock @{targetUser.username}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleToggleFollowTargetUser}
                      className={`flex-1 py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                        isTargetFollowing
                          ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-red-500/40 hover:text-red-400'
                          : 'bg-[#00FF66] hover:bg-[#00e65c] text-black font-extrabold'
                      }`}
                    >
                      {isTargetFollowing ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5 text-red-400 group-hover:text-red-500" /> Unfollow
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" /> Follow
                        </>
                      )}
                    </button>

                    {onNavigateToChatWithUser && canMessageTarget && (
                      <button
                        onClick={() => onNavigateToChatWithUser(targetUser)}
                        className="flex-1 py-2 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-blue-500/50 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-blue-400" /> Message
                      </button>
                    )}

                    <button
                      onClick={() => handleShareProfile(targetUser.username)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-sm ${
                        shareLinkCopied
                          ? 'bg-[#00FF66]/15 border-[#00FF66]/40 text-[#00FF66]'
                          : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white'
                      }`}
                      title="Share Profile Link"
                    >
                      {shareLinkCopied ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                      )}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* 2. Comprehensive Bio, City, Website & Social Badges */}
        <div className="space-y-3 pt-3 border-t border-zinc-800/80">
          <p className="text-xs sm:text-sm text-zinc-200 whitespace-pre-line leading-relaxed max-w-2xl font-normal">
            {targetUser.bio || (isOwnProfile ? 'Welcome to my NOOB profile! Tap Edit Profile to customize your bio.' : 'No bio available yet.')}
          </p>

          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 pt-1">
            {targetUser.city && (
              <span className="flex items-center gap-1 text-zinc-300">
                <MapPin className="w-3.5 h-3.5 text-rose-400" />
                <span>{targetUser.city}</span>
              </span>
            )}

            {targetUser.website && (
              <a
                href={targetUser.website.startsWith('http') ? targetUser.website : `https://${targetUser.website}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-cyan-400 hover:underline font-semibold"
              >
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span className="truncate max-w-[200px]">{targetUser.website.replace(/^https?:\/\//, '')}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {targetUser.countryCode && (
              <span className="text-[10px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded-md border border-zinc-800 font-mono">
                {targetUser.countryCode}
              </span>
            )}
          </div>

          {/* Social Profiles Badges */}
          {targetUser.socialLinks && Object.values(targetUser.socialLinks).some(Boolean) && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {targetUser.socialLinks.twitter && (
                <a
                  href={`https://twitter.com/${targetUser.socialLinks.twitter.replace('@', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-semibold text-sky-400 flex items-center gap-1.5"
                >
                  <Twitter className="w-3 h-3" />
                  <span>@{targetUser.socialLinks.twitter.replace('@', '')}</span>
                </a>
              )}
              {targetUser.socialLinks.instagram && (
                <a
                  href={`https://instagram.com/${targetUser.socialLinks.instagram.replace('@', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-semibold text-pink-400 flex items-center gap-1.5"
                >
                  <Instagram className="w-3 h-3" />
                  <span>@{targetUser.socialLinks.instagram.replace('@', '')}</span>
                </a>
              )}
              {targetUser.socialLinks.youtube && (
                <a
                  href={`https://youtube.com/${targetUser.socialLinks.youtube}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-semibold text-red-400 flex items-center gap-1.5"
                >
                  <Youtube className="w-3 h-3" />
                  <span>{targetUser.socialLinks.youtube}</span>
                </a>
              )}
              {targetUser.socialLinks.github && (
                <a
                  href={`https://github.com/${targetUser.socialLinks.github}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5"
                >
                  <Github className="w-3 h-3" />
                  <span>{targetUser.socialLinks.github}</span>
                </a>
              )}
            </div>
          )}

          {/* Interests Tags */}
          {targetUser.interests && targetUser.interests.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {targetUser.interests.map((tag) => (
                <span
                  key={tag}
                  className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Business Category & Direct Contact */}
          {isBusiness && (
            <div className="pt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-[#00FF66] bg-[#00FF66]/10 px-3 py-1 rounded-full border border-[#00FF66]/20">
                {targetUser.businessCategory || 'Digital Creator'}
              </span>
              {targetUser.email && (
                <a
                  href={`mailto:${targetUser.email}`}
                  className="text-[11px] font-semibold text-zinc-300 bg-zinc-900 hover:bg-zinc-800 px-3 py-1 rounded-full border border-zinc-800 flex items-center gap-1"
                >
                  <Mail className="w-3 h-3 text-pink-400" /> Contact Email
                </a>
              )}
              {targetUser.mobileNumber && (
                <a
                  href={`tel:${targetUser.mobileNumber}`}
                  className="text-[11px] font-semibold text-zinc-300 bg-zinc-900 hover:bg-zinc-800 px-3 py-1 rounded-full border border-zinc-800 flex items-center gap-1"
                >
                  <Phone className="w-3 h-3 text-[#00FF66]" /> Call / WhatsApp
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. Follow Requests Drawer (for Private Accounts) */}
      {isPrivate && followRequests.length > 0 && (
        <div className="my-4 p-4 bg-purple-950/40 border border-purple-500/30 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold text-white">Pending Follow Requests ({followRequests.length})</span>
            </div>
            <span className="text-[10px] text-purple-300">Requires manual review</span>
          </div>

          <div className="space-y-2">
            {followRequests.map((req: any) => (
              <div key={req.userId} className="flex items-center justify-between bg-zinc-900/90 p-2.5 rounded-xl border border-white/5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img src={req.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'} alt={req.username} className="w-8 h-8 rounded-full object-cover" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-white truncate block">@{req.username}</span>
                    <span className="text-[10px] text-zinc-400 truncate block">{req.displayName}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAcceptRequest(req.userId)}
                    className="px-3 py-1 rounded-lg bg-[#00FF66] text-black font-bold text-xs hover:scale-105 transition-transform flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3 h-3" /> Accept
                  </button>
                  <button
                    onClick={() => handleDeclineRequest(req.userId)}
                    className="px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white text-xs cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Professional Creator Dashboard Banner (Only for Business Accounts) */}
      {isBusiness && (
        <div className="my-4 p-4 bg-gradient-to-r from-zinc-900 via-zinc-900 to-[#0e2417] border border-[#00FF66]/30 rounded-3xl flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-[#00FF66] shrink-0" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-white">Professional Creator Insights</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#00FF66]/20 text-[#00FF66] font-bold">LIVE</span>
              </div>
              <span className="text-[11px] text-zinc-400">
                Live organic impressions, profile engagement &amp; growth metrics
              </span>
            </div>
          </div>
          <button
            onClick={onOpenProfessionalDashboard}
            className="px-4 py-2 bg-[#00FF66] hover:bg-[#00e65c] text-black text-xs font-black rounded-xl hover:scale-105 transition-transform cursor-pointer"
          >
            View Insights
          </button>
        </div>
      )}

      {/* 5. Story Highlights Carousel (Dynamic, First image = cover icon, can add more media) */}
      <div className="mb-6 flex items-center gap-4 overflow-x-auto pb-2 no-scrollbar">
        {/* + New Highlight Button */}
        <div
          onClick={() => {
            setSelectedHighlightForManage(null);
            setShowHighlightManager(true);
          }}
          className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group"
        >
          <div className="w-14 h-14 rounded-full bg-zinc-900 border border-dashed border-zinc-700 flex items-center justify-center text-zinc-400 group-hover:border-[#00FF66] group-hover:text-[#00FF66] transition-all group-hover:scale-105">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-[11px] text-zinc-400 font-bold group-hover:text-[#00FF66] transition-colors">New</span>
        </div>

        {/* User-Created Highlights */}
        {highlights.map((hl) => (
          <div
            key={hl.id}
            className="flex flex-col items-center gap-1.5 shrink-0 relative group"
          >
            <div
              onClick={() => setActiveHighlightForViewer(hl)}
              className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-zinc-700 via-zinc-800 to-zinc-700 group-hover:from-[#00FF66] group-hover:to-emerald-400 transition-all group-hover:scale-105 shadow-md cursor-pointer relative"
            >
              <img
                src={hl.cover || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                alt={hl.title}
                className="w-full h-full rounded-full object-cover p-0.5 bg-black"
                referrerPolicy="no-referrer"
              />
            </div>

            {isOwnProfile && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteHighlight(hl.id);
                }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-zinc-900 border border-zinc-700 hover:border-red-500 hover:bg-red-600 text-zinc-400 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer shadow-lg z-10"
                title={`Delete ${hl.title}`}
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            )}

            <span
              onClick={() => setActiveHighlightForViewer(hl)}
              className="text-[11px] text-zinc-300 font-medium truncate max-w-[68px] text-center cursor-pointer hover:text-[#00FF66] transition-colors"
            >
              {hl.title}
            </span>
          </div>
        ))}
      </div>

      {/* 6. Profile Content Navigation Tabs */}
      <div className="flex items-center justify-around border-b border-zinc-800 text-xs font-bold pt-2 mb-4">
        <button
          onClick={() => setActiveTab('posts')}
          className={`pb-3 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
            activeTab === 'posts' ? 'border-[#00FF66] text-[#00FF66]' : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Grid className="w-4 h-4" />
          <span className="hidden sm:inline">POSTS</span>
        </button>

        <button
          onClick={() => setActiveTab('reels')}
          className={`pb-3 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
            activeTab === 'reels' ? 'border-[#00FF66] text-[#00FF66]' : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Film className="w-4 h-4" />
          <span className="hidden sm:inline">REELS</span>
        </button>

        <button
          onClick={() => setActiveTab('saved')}
          className={`pb-3 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
            activeTab === 'saved' ? 'border-[#00FF66] text-[#00FF66]' : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
          title="Organized Private Collections"
        >
          <Bookmark className="w-4 h-4" />
          <span className="hidden sm:inline">SAVED</span>
        </button>

        <button
          onClick={() => setActiveTab('liked')}
          className={`pb-3 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
            activeTab === 'liked' ? 'border-[#00FF66] text-[#00FF66]' : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
          title="Liked Posts"
        >
          <Heart className="w-4 h-4" />
          <span className="hidden sm:inline">LIKED</span>
        </button>

        <button
          onClick={() => setActiveTab('archive')}
          className={`pb-3 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
            activeTab === 'archive' ? 'border-[#00FF66] text-[#00FF66]' : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
          title="Archived Posts Vault"
        >
          <Archive className="w-4 h-4" />
          <span className="hidden sm:inline">ARCHIVE</span>
        </button>
      </div>

      {/* 7. Active Tab Content Area */}
      <div>
        {/* A. POSTS GRID */}
        {activeTab === 'posts' && (
          displayedPosts.length === 0 ? (
            <div className="text-center py-16 bg-zinc-950 rounded-3xl border border-zinc-800 space-y-2">
              <Grid className="w-10 h-10 text-zinc-600 mx-auto" />
              <span className="text-sm font-bold text-zinc-300 block">No posts shared yet</span>
              <p className="text-xs text-zinc-500">Capture photos and videos to share with your friends!</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {displayedPosts.map((post) => (
                <div
                  key={post.id}
                  onClick={() => onSelectPost(post)}
                  className="relative aspect-square bg-zinc-900 rounded-2xl overflow-hidden group cursor-pointer border border-zinc-800/80 shadow-md"
                >
                  <img
                    src={post.slides?.[0]?.mediaUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'}
                    alt={post.caption}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {post.slides.length > 1 && (
                    <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-md p-1.5 rounded-lg border border-white/10">
                      <Layers className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white font-bold text-xs">
                    <span className="flex items-center gap-1"><Heart className="w-4 h-4 fill-white" /> {post.likesCount}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* B. REELS GRID */}
        {activeTab === 'reels' && (
          displayedReels.length === 0 ? (
            <div className="text-center py-16 bg-zinc-950 rounded-3xl border border-zinc-800 space-y-2">
              <Film className="w-10 h-10 text-zinc-600 mx-auto" />
              <span className="text-sm font-bold text-zinc-300 block">No reels shared yet</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {displayedReels.map((reel) => (
              <div
                key={reel.id}
                className="relative aspect-[9/16] bg-zinc-900 rounded-2xl overflow-hidden group cursor-pointer border border-zinc-800/80 shadow-md"
              >
                <img
                  src={reel.thumbnailUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80'}
                  alt={reel.caption}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 text-xs text-white font-bold bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-lg border border-white/10">
                  <Film className="w-3.5 h-3.5" /> {reel.viewsCount}
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* C. SAVED POSTS & COLLECTIONS */}
        {activeTab === 'saved' && (
          <div className="space-y-6">
            {/* Header & New Collection Button */}
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-[#00FF66]" />
                <span className="text-sm font-bold text-white">
                  Saved Posts Vault ({savedPosts.length})
                </span>
              </div>
              <button
                onClick={() => {
                  const name = prompt('Enter new private collection name:');
                  if (name) {
                    setCollections([
                      ...collections,
                      {
                        id: `col_${Date.now()}`,
                        name,
                        coverUrl: savedPosts[0]?.slides?.[0]?.mediaUrl || posts[0]?.slides?.[0]?.mediaUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500',
                        postsCount: 1,
                        isCollaborative: false,
                        posts: [savedPosts[0] || posts[0]]
                      }
                    ]);
                  }
                }}
                className="text-xs text-[#00FF66] font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 hover:bg-[#00FF66]/20 transition-colors cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" /> New Collection
              </button>
            </div>

            {/* All Saved Posts Grid */}
            {savedPosts.length > 0 ? (
              <div className="grid grid-cols-3 gap-2 sm:gap-4">
                {savedPosts.map((post) => (
                  <div
                    key={post.id}
                    onClick={() => onSelectPost(post)}
                    className="relative aspect-square bg-zinc-900 rounded-2xl overflow-hidden group cursor-pointer border border-zinc-800 shadow-md"
                  >
                    <img
                      src={post.slides?.[0]?.mediaUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'}
                      alt={post.caption || 'Saved post'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white font-bold text-xs backdrop-blur-[2px]">
                      <span className="flex items-center gap-1">
                        <Heart className="w-4 h-4 fill-white" /> {post.likesCount || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="w-4 h-4 fill-white" /> {post.commentsCount || 0}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 px-4 bg-zinc-900/40 rounded-3xl border border-zinc-800/60">
                <Bookmark className="w-10 h-10 text-[#00FF66] mx-auto mb-3 opacity-60" />
                <h3 className="text-sm font-bold text-white">No Saved Posts Yet</h3>
                <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto">
                  When you bookmark posts from your Feed or Explore, they will be securely organized in your private vault here.
                </p>
              </div>
            )}

            {/* Organized Collections Sub-section */}
            {collections.length > 0 && (
              <div className="pt-4 border-t border-zinc-800/80 space-y-3">
                <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">
                  Organized Collections ({collections.length})
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {collections.map((col) => (
                    <div
                      key={col.id}
                      className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden p-2.5 group hover:border-[#00FF66]/50 transition-colors cursor-pointer shadow-md"
                    >
                      <div className="aspect-square rounded-xl overflow-hidden bg-black mb-2">
                        <img
                          src={col.coverUrl || 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500'}
                          alt={col.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                      <span className="text-xs font-bold text-white truncate block">{col.name}</span>
                      <span className="text-[10px] text-zinc-400 block">{col.postsCount || 1} items</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* D. LIKED POSTS */}
        {activeTab === 'liked' && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {likedPosts.map((post) => (
              <div
                key={post.id}
                onClick={() => onSelectPost(post)}
                className="relative aspect-square bg-zinc-900 rounded-2xl overflow-hidden group cursor-pointer border border-zinc-800"
              >
                <img
                  src={post.slides?.[0]?.mediaUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
              </div>
            ))}
          </div>
        )}

        {/* E. ARCHIVE VAULT */}
        {activeTab === 'archive' && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-400">
              Only you can see posts in your archive vault. They are removed from your public grid without being deleted.
            </p>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {archivedPosts.map((post) => (
                <div
                  key={post.id}
                  onClick={() => onSelectPost(post)}
                  className="relative aspect-square bg-zinc-900 rounded-2xl overflow-hidden group cursor-pointer border border-amber-500/30"
                >
                  <img
                    src={post.slides?.[0]?.mediaUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'}
                    alt=""
                    className="w-full h-full object-cover opacity-75 group-hover:opacity-100"
                  />
                  <div className="absolute bottom-2 left-2 bg-black/80 px-2 py-0.5 rounded text-[10px] text-amber-400 font-bold">
                    Archived
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 8. Full Edit Profile Modal */}
      {showEditProfileModal && (
        <EditProfileModal
          currentUser={currentUser}
          onClose={() => setShowEditProfileModal(false)}
          onProfileUpdated={handleProfileUpdated}
        />
      )}

      {showBlockedAccountsModal && (
        <BlockedAccountsModal
          currentUser={currentUser}
          allUsers={allUsers}
          onClose={() => setShowBlockedAccountsModal(false)}
          onUserUpdated={onUserUpdated}
        />
      )}

      {/* 9. Settings & Privacy Master Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#00FF66]" />
                <h3 className="text-sm font-bold text-white">Settings & Account Controls</h3>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className="text-zinc-400 hover:text-white p-1 cursor-pointer">
                ✕
              </button>
            </div>

            {/* Account Type Selection */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-white block">Account Type Selection</span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAccountTypeSetting('public')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    accountTypeSetting === 'public'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-zinc-800 bg-zinc-900'
                  }`}
                >
                  <span className="text-sm block">🌐</span>
                  <span className="text-xs font-bold text-white block mt-1">Public</span>
                  <span className="text-[9px] text-zinc-400 block">Open visibility</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAccountTypeSetting('private')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    accountTypeSetting === 'private'
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-zinc-800 bg-zinc-900'
                  }`}
                >
                  <span className="text-sm block">🔒</span>
                  <span className="text-xs font-bold text-white block mt-1">Private</span>
                  <span className="text-[9px] text-zinc-400 block">Follow approval</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAccountTypeSetting('business')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    accountTypeSetting === 'business'
                      ? 'border-[#00FF66] bg-emerald-500/10'
                      : 'border-zinc-800 bg-zinc-900'
                  }`}
                >
                  <span className="text-sm block">💼</span>
                  <span className="text-xs font-bold text-white block mt-1">Business</span>
                  <span className="text-[9px] text-zinc-400 block">Creator tools</span>
                </button>
              </div>
            </div>

            {accountTypeSetting === 'business' && (
              <div className="p-3 bg-zinc-900 rounded-2xl border border-zinc-800 space-y-2">
                <label className="text-xs font-bold text-zinc-300 block">Creator / Business Category</label>
                <input
                  type="text"
                  value={businessCategorySetting}
                  onChange={(e) => setBusinessCategorySetting(e.target.value)}
                  placeholder="e.g. Gaming Creator, Digital Artist..."
                  className="w-full bg-zinc-950 text-xs text-white p-2.5 rounded-xl border border-zinc-800 outline-none"
                />
              </div>
            )}

            {/* Privacy Controls */}
            <div className="space-y-3 pt-2 border-t border-zinc-800">
              <span className="text-xs font-bold text-white block">Privacy & Moderation</span>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Offensive Words Filter</label>
                <input
                  type="text"
                  value={blockedWords}
                  onChange={(e) => setBlockedWords(e.target.value)}
                  className="w-full bg-zinc-900 text-xs text-white p-2.5 rounded-xl border border-zinc-800 outline-none"
                  placeholder="spam, bot, scam..."
                />
              </div>

              <div className="space-y-2 text-xs text-zinc-300 pt-1">
                <label className="flex items-center justify-between cursor-pointer">
                  <span>Hide Tagged Photos from Profile</span>
                  <input
                    type="checkbox"
                    checked={hideTaggedPhotos}
                    onChange={(e) => setHideTaggedPhotos(e.target.checked)}
                    className="accent-[#00FF66]"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span>Push Notifications for Favorite Accounts</span>
                  <input
                    type="checkbox"
                    checked={pushFavoritesEnabled}
                    onChange={(e) => setPushFavoritesEnabled(e.target.checked)}
                    className="accent-[#00FF66]"
                  />
                </label>
              </div>
            </div>

            {/* Quick Actions / Edit Profile & Log Out */}
            <div className="pt-3 border-t border-zinc-800 space-y-2">
              <span className="text-xs font-bold text-white block">Account Actions</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(false);
                    setShowEditProfileModal(true);
                  }}
                  className="w-full py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl border border-zinc-700 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer hover:border-[#00FF66]/50 shadow-sm"
                >
                  <Edit3 className="w-4 h-4 text-[#00FF66]" /> Edit Profile
                </button>

                {onLogout && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowSettingsModal(false);
                      onLogout();
                    }}
                    className="w-full py-2.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/30 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
                  >
                    <LogOut className="w-4 h-4 text-red-400" /> Log Out
                  </button>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
              <button
                onClick={() => {
                  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(safeJsonStringify(currentUser, 2));
                  const dlAnchor = document.createElement('a');
                  dlAnchor.setAttribute('href', dataStr);
                  dlAnchor.setAttribute('download', 'noob_profile_archive.json');
                  dlAnchor.click();
                }}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#00FF66]" /> Export Data
              </button>

              <button
                onClick={handleSavePrivacySettings}
                className="px-5 py-2 bg-[#00FF66] hover:bg-[#00FF66]/90 text-black font-extrabold text-xs rounded-xl shadow-md cursor-pointer"
              >
                Save Settings
              </button>
            </div>

            {/* Legal & Policy Links */}
            <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowTermsModal(true)}
                  className="hover:text-white underline cursor-pointer"
                >
                  Terms & Conditions
                </button>
                <span>•</span>
                <button
                  onClick={() => setShowPrivacyModal(true)}
                  className="hover:text-white underline cursor-pointer"
                >
                  Privacy Policy
                </button>
              </div>

              <span className="text-[10px] text-zinc-500 font-mono">NOOB Hub</span>
            </div>
          </div>
        </div>
      )}

      {/* 10. Legal & Support Modals */}
      {showTermsModal && <TermsAndConditions onClose={() => setShowTermsModal(false)} />}
      {showPrivacyModal && <PrivacyPolicy onClose={() => setShowPrivacyModal(false)} />}
      {showSupportModal && (
        <CustomerSupportModal
          currentUser={currentUser}
          onClose={() => setShowSupportModal(false)}
          onOpenTerms={() => {
            setShowSupportModal(false);
            setShowTermsModal(true);
          }}
          onOpenPrivacy={() => {
            setShowSupportModal(false);
            setShowPrivacyModal(true);
          }}
        />
      )}

      {/* 11. Highlight Manager & Viewer Modals */}
      {showHighlightManager && (
        <HighlightManagerModal
          currentUser={currentUser}
          existingHighlight={selectedHighlightForManage}
          onSave={handleSaveHighlight}
          onDelete={handleDeleteHighlight}
          onClose={() => {
            setShowHighlightManager(false);
            setSelectedHighlightForManage(null);
          }}
        />
      )}

      {activeHighlightForViewer && (
        <HighlightViewerModal
          highlight={activeHighlightForViewer}
          onClose={() => setActiveHighlightForViewer(null)}
          onEdit={(hl) => {
            setActiveHighlightForViewer(null);
            setSelectedHighlightForManage(hl);
            setShowHighlightManager(true);
          }}
          onDelete={isOwnProfile ? (id) => {
            handleDeleteHighlight(id);
            setActiveHighlightForViewer(null);
          } : undefined}
        />
      )}

      {/* 12. Fullscreen Profile Picture Modal */}
      <FullscreenAvatarModal
        isOpen={showFullscreenAvatar}
        avatarUrl={targetUser.avatar}
        username={targetUser.username}
        displayName={targetUser.displayName}
        isVerified={targetUser.isVerified}
        onClose={() => setShowFullscreenAvatar(false)}
      />

      {/* 13. Get Verified Modal */}
      <GetVerifiedModal
        isOpen={showGetVerifiedModal}
        currentUser={currentUser}
        onClose={() => setShowGetVerifiedModal(false)}
        onVerificationSuccess={(updated) => {
          if (onUserUpdated) onUserUpdated(updated);
        }}
      />

      {/* 14. NOOB Admin Control Modal */}
      {showAdminControlModal && (
        <AdminControlModal
          currentUser={currentUser}
          onClose={() => setShowAdminControlModal(false)}
        />
      )}

      {/* 15. Wallet Modal (previously imported but never rendered) */}
      {showAccountsStatisticsModal && (
        <AccountsStatisticsModal
          currentUser={currentUser}
          onClose={() => setShowAccountsStatisticsModal(false)}
          onUserUpdated={onUserUpdated}
        />
      )}

      {/* 16. Unlock Pro Features Modal */}
      {showProFeaturesModal && (
        <ProFeaturesModal
          currentUser={currentUser}
          onClose={() => setShowProFeaturesModal(false)}
          onUserUpdated={onUserUpdated}
        />
      )}
    </div>
  );
};

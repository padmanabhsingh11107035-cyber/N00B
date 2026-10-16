import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ProfileAskCard, ProfileMoodChip } from './ProfileFunCards';
import type { FunLocation } from '../../utils/funRoutes';
import { isStaff } from '../../adminAccess';
import {
  Grid,
  Film,
  Play,
  PlaySquare,
  Bookmark,
  Heart,
  Archive,
  Settings,
  BarChart3,
  Lock,
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
  MoreVertical,
  Monitor,
  MessageCircle,
  UserX,
  Flag,
  ArrowLeft,
  Trash2,
  Share2,
  UserPlus,
  UserCheck,
  MessageSquare,
  X,
  Loader2,
  AlertCircle,
  Clock,
  EyeOff,
  Eye,
  ChevronDown,
} from 'lucide-react';
import { Post, Reel, SavedCollection, User, Story, StoryHighlight, LongVideo } from '../../types';
import { POST_FILTERS } from '../../data/mockData';
import {
  fetchCollections,
  fetchLikedPosts,
  fetchArchivedPosts,
  fetchSavedPosts,
  acceptFollowRequest,
  declineFollowRequest,
  blockUser,
  unblockUser,
  submitSafetyReport,
  toggleFollowUser,
  hideProfileFrom,
  unhideProfileFrom,
  fetchHighlights,
  deleteHighlight,
  fetchMutualFollowers,
  fetchUserFeedVideos,
  fetchUserLongVideos,
  type MutualFollower
} from '../../services/api';
import confetti from 'canvas-confetti';
import { EditProfileModal } from './EditProfileModal';
import { TermsAndConditions } from '../Legal/TermsAndConditions';
import { PrivacyPolicy } from '../Legal/PrivacyPolicy';
import { EndToEndEncryption } from '../Legal/EndToEndEncryption';
import { StoryViewerModal } from '../Stories/StoryViewerModal';
import { HighlightManagerModal } from './HighlightManagerModal';
import { useScreenshotAlert } from '../../utils/useScreenshotAlert';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { AvatarMedia } from '../Common/AvatarMedia';
import { PostThumbnailMedia } from '../Common/PostThumbnailMedia';
import { FeedVideoWatchView } from '../Feed/FeedVideoWatchView';
import { formatRelativeTime } from '../../utils/formatTime';
import { FullscreenAvatarModal } from '../Common/FullscreenAvatarModal';
import { GetVerifiedModal } from './GetVerifiedModal';
import { AccountsStatisticsModal } from './AccountsStatisticsModal';
import { ProFeaturesModal } from './ProFeaturesModal';
import { LiveProfilePictureModal } from './LiveProfilePictureModal';
import { BlockedAccountsModal } from './BlockedAccountsModal';
import { HideProfileModal } from '../Modals/HideProfileModal';
import { SwitchAccountModal } from '../Modals/SwitchAccountModal';
import { Globe as GlobeIcon, KeyRound, Languages } from 'lucide-react';
import { EncryptionSettingsModal } from '../Chat/EncryptionModals';
import { DevicesModal } from './DevicesModal';
import { AppearanceSetting } from '../Common/AppearanceSetting';
import { LanguagePicker } from '../Common/LanguagePicker';
import { useLanguage } from '../../i18n/useLanguage.ts';
import { chooseLanguage } from '../../i18n/account.ts';
import { findLanguage } from '../../i18n/languages.ts';
import { CalculatorPage } from './CalculatorPage';
import { QrScannerPage } from './QrScannerPage';
import { TranslatorPage } from './TranslatorPage';
import { ExportDataModal } from './ExportDataModal';
import { buildDataExport } from '../../utils/exportMyData';
import { FollowUsModal } from './FollowUsModal';
import { DeleteAccountModal } from './DeleteAccountModal';
import { FollowListPage } from './FollowListPage';
import { InstallAndPermissionsPage } from './InstallAndPermissionsPage';
import { MutualFollowersSheet } from './MutualFollowersSheet';
import { ShareToChatModal } from './ShareToChatModal';
import { ProfileQrModal } from './ProfileQrModal';
import type { SettingsContext } from '../Settings/types';
import { BurgerLoading } from '../Common/BurgerLoading';
import { LazyVideo } from '../Common/LazyVideo';

// Lazy-loaded: large, rarely-opened screens pulled out of the main bundle rather than loaded on
// every visit — dynamic import() here and in App.tsx (which also renders AdminControlModal) share
// the same underlying chunk, so this doesn't double-load anything.
const CustomerSupportModal = React.lazy(() => import('../Support/CustomerSupportModal').then((m) => ({ default: m.CustomerSupportModal })));
const SuggestionBoxModal = React.lazy(() => import('../Support/SuggestionBoxModal').then((m) => ({ default: m.SuggestionBoxModal })));
const SettingsHub = React.lazy(() => import('../Settings/SettingsHub').then((m) => ({ default: m.SettingsHub })));
const AdminControlModal = React.lazy(() => import('../Modals/AdminControlModal').then((m) => ({ default: m.AdminControlModal })));
// While a window that is loaded on demand arrives: NOOB's burger, for exactly as long as it takes (no minimum, no maximum time).
const LazyFallback: React.FC = () => <BurgerLoading />;
// Settings and activity is fetched in the background while the profile is on screen, so the three dots open it at once.
const preloadSettingsHub = () => { void import('../Settings/SettingsHub'); };

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
  onDeleteMyAccount?: (password: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  onUserUpdated?: (user: User) => void;
  onToggleFollowUser?: (
    userId: string
  ) => void | Promise<{ success: boolean; isFollowing: boolean; isFollowRequested?: boolean; followersCount: number; message?: string } | undefined>;
  onRemoveFollower?: (followerId: string) => void | Promise<{ success: boolean; followersCount?: number; error?: string } | undefined>;
  onBlockUser?: (userId: string) => void;
  onReportUser?: (userId: string, reason: string, details?: string) => void;
  onDeletePost?: (postId: string) => void;
  onDeleteReel?: (reelId: string) => void;
  // "Go to previous page": back to the page this profile was opened from, exactly as it was left
  onGoBack?: () => void;
  // The Fun pages (Ask Me Anything, ...): the small cards on a profile open them.
  onOpenFunPage?: (loc: FunLocation) => void;
  onNavigateToChatWithUser?: (user: User) => void;
  onNavigateToUserProfile?: (user: User) => void;
  // Opens one of the long videos (Home > Videos) listed in the profile's Feed tab
  onOpenLongVideo?: (videoId: string) => void;
  // Present only for the main NOOB admin while they're using the app in "Use as User" mode (see
  // App.tsx's viewAsUser + AdminControlModal's "Use as User" button) — switches back to the admin
  // console. Absent for every other account, so the icon simply never renders for them.
  onSwitchToAdminPanel?: () => void;
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
  onDeleteMyAccount,
  onUserUpdated,
  onToggleFollowUser,
  onRemoveFollower,
  onBlockUser,
  onReportUser,
  onDeletePost,
  onDeleteReel,
  onGoBack,
  onOpenFunPage,
  onNavigateToChatWithUser,
  onNavigateToUserProfile,
  onOpenLongVideo,
  onSwitchToAdminPanel
}) => {
  const [activeTab, setActiveTab] = useState<'posts' | 'reels' | 'feed' | 'saved' | 'liked' | 'archive'>('posts');
  // The "Feed" tab: this person's video posts, one wide card per row. Loaded from the server when the tab is opened (the app itself only
  // holds the latest 200 posts of everyone); until then / if that is unavailable, the video posts already on hand are shown.
  const [feedVideos, setFeedVideos] = useState<{ userId: string; posts: Post[] } | null>(null);
  const [longVideos, setLongVideos] = useState<{ userId: string; videos: LongVideo[] } | null>(null);
  const [watchVideoPost, setWatchVideoPost] = useState<Post | null>(null);
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [likedPosts, setLikedPosts] = useState<Post[]>([]);
  const [archivedPosts, setArchivedPosts] = useState<Post[]>([]);
  const [showSettingsHub, setShowSettingsHub] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showE2eeModal, setShowE2eeModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showSuggestionBox, setShowSuggestionBox] = useState(false);
  const [showGetVerifiedModal, setShowGetVerifiedModal] = useState(false);
  const [showFullscreenAvatar, setShowFullscreenAvatar] = useState(false);
  const [showThreeDotsMenu, setShowThreeDotsMenu] = useState(false);
  const [showAdminControlModal, setShowAdminControlModal] = useState(false);
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);

  const [followRequests, setFollowRequests] = useState<any[]>(currentUser.followRequests || []);

  // Modals for Accounts & Statistics, Blocked Accounts, and Report
  const [showAccountsStatisticsModal, setShowAccountsStatisticsModal] = useState(false);
  const [showProFeaturesModal, setShowProFeaturesModal] = useState(false);
  const [showLiveAvatarModal, setShowLiveAvatarModal] = useState(false);
  const [showBlockedAccountsModal, setShowBlockedAccountsModal] = useState(false);
  const [showHideProfileModal, setShowHideProfileModal] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showTranslator, setShowTranslator] = useState(false);
  const [showSwitchAccount, setShowSwitchAccount] = useState(false);
  const [showEncryptionSettings, setShowEncryptionSettings] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const language = useLanguage();
  const [showCalculatorPage, setShowCalculatorPage] = useState(false);
  const [showQrScannerPage, setShowQrScannerPage] = useState(false);
  // Export Data: the readable text of the person's own details (utils/exportMyData.ts); null while the window is closed
  const [exportText, setExportText] = useState<string | null>(null);
  const [showFollowUsModal, setShowFollowUsModal] = useState(false);
  const [showInstallPermissionsPage, setShowInstallPermissionsPage] = useState(false);
  const [showMutualFollowersSheet, setShowMutualFollowersSheet] = useState(false);
  const [followListTab, setFollowListTab] = useState<'followers' | 'following' | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showShareToChatModal, setShowShareToChatModal] = useState(false);
  const [showProfileQrModal, setShowProfileQrModal] = useState(false);
  const [reportReason, setReportReason] = useState('Cyber Bullying & Harassment');
  const [reportDetails, setReportDetails] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [reportSuccessNotice, setReportSuccessNotice] = useState(false);
  const [reportError, setReportError] = useState('');

  // Target User (Either currentUser or viewingUser)
  const targetUser: User = viewingUser || currentUser;
  const isOwnProfile = !viewingUser || viewingUser.id === currentUser.id;
  useScreenshotAlert('profile', targetUser.id, !isOwnProfile);
  const isTargetBlocked = (currentUser.blockedUserIds || []).includes(targetUser.id);
  const [isTargetFollowing, setIsTargetFollowing] = useState<boolean>(() => {
    if (targetUser.isFollowing !== undefined) return !!targetUser.isFollowing;
    return !!currentUser.followingIds?.includes(targetUser.id);
  });
  const [isTargetFollowRequested, setIsTargetFollowRequested] = useState<boolean>(
    () => !!targetUser.isFollowRequested
  );

  useEffect(() => {
    setIsTargetFollowing(
      targetUser.isFollowing !== undefined
        ? !!targetUser.isFollowing
        : !!currentUser.followingIds?.includes(targetUser.id)
    );
    setIsTargetFollowRequested(!!targetUser.isFollowRequested);
  }, [targetUser.id, targetUser.isFollowing, targetUser.isFollowRequested, currentUser.followingIds]);

  // Private chat is only available between users where at least one follows the other
  const targetFollowsMe = !!targetUser.followingIds?.includes(currentUser.id);
  const canMessageTarget = isTargetFollowing || targetFollowsMe;

  // Highlights: every story the target user has ever posted, auto-grouped by the day it was
  // posted, fetched fresh from the backend for whichever profile is being viewed — not this
  // browser's own localStorage, so they're the same for every viewer and every device (see the
  // 22 Sep story/highlight redesign).
  const [highlights, setHighlights] = useState<StoryHighlight[]>([]);
  const [activeHighlightForViewer, setActiveHighlightForViewer] = useState<StoryHighlight | null>(null);
  const [showHighlightManager, setShowHighlightManager] = useState(false);
  const [editingHighlight, setEditingHighlight] = useState<StoryHighlight | null>(null);

  const reloadHighlights = () => { fetchHighlights(targetUser.id).then(setHighlights); };
  useEffect(() => {
    let alive = true;
    fetchHighlights(targetUser.id).then((list) => { if (alive) setHighlights(list); });
    return () => { alive = false; };
  }, [targetUser.id]);

  // "Followed by ..." — accounts I follow who also follow this profile (Instagram-style mutual
  // connections). Only ever computed from MY following list, never from my followers.
  const [mutualFollowers, setMutualFollowers] = useState<MutualFollower[]>([]);
  useEffect(() => {
    if (isOwnProfile) { setMutualFollowers([]); return; }
    let alive = true;
    fetchMutualFollowers(targetUser.id).then((list) => { if (alive) setMutualFollowers(list); });
    return () => { alive = false; };
  }, [isOwnProfile, targetUser.id]);

  const handleDeleteHighlight = async (highlightId: string) => {
    const prev = highlights;
    setHighlights((h) => h.filter((x) => x.id !== highlightId));
    const ok = await deleteHighlight(highlightId);
    if (!ok) setHighlights(prev);
  };

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

  useEffect(() => {
    // Saved / Liked / Archive are always the SIGNED-IN account's own data (the
    // fetch functions take no user id — there is no "someone else's" version
    // of them), so only load them while looking at your own profile.
    if (!isOwnProfile) return;
    loadPrivateCollections();
    loadLikedAndArchived();
    setFollowRequests(currentUser.followRequests || []);
  }, [currentUser, isOwnProfile]);

  // Landing on someone else's profile while a private tab was still selected
  // (from your own profile, or from a previous profile you visited) must not
  // keep showing your own Saved/Liked/Archive under their name.
  useEffect(() => {
    if (!isOwnProfile && (activeTab === 'saved' || activeTab === 'liked' || activeTab === 'archive')) {
      setActiveTab('posts');
    }
  }, [isOwnProfile, targetUser.id]);

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
    // Archived posts never belong in the main grid — not even for the owner
    // (that's the point of archiving) — and the database only ever hands an
    // archived post to its own author or an admin account in the first
    // place, so this must not special-case "someone else's profile".
    const isAuthor = p.userId === targetUser.id || p.username === targetUser.username;
    return isAuthor && !p.isArchived;
  });

  const isVideoPost = (p: Post) => (p.slides || []).some((s) => s.mediaType === 'video');
  const feedVideoPosts: Post[] = (feedVideos && feedVideos.userId === targetUser.id ? feedVideos.posts : displayedPosts.filter(isVideoPost))
    .filter((p) => !p.isArchived)
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  // The Feed tab lists the video posts AND the long videos (Home > Videos), newest first, in one list.
  const feedLongVideos: LongVideo[] = longVideos && longVideos.userId === targetUser.id ? longVideos.videos : [];
  type FeedTabItem = { kind: 'post'; at: number; post: Post } | { kind: 'video'; at: number; video: LongVideo };
  const feedTabItems: FeedTabItem[] = [
    ...feedVideoPosts.map((post): FeedTabItem => ({ kind: 'post', at: Date.parse(post.createdAt) || 0, post })),
    ...feedLongVideos.map((video): FeedTabItem => ({ kind: 'video', at: Date.parse(video.createdAt) || 0, video }))
  ].sort((a, b) => b.at - a.at);
  const formatVideoLength = (totalSeconds: number): string => {
    const s = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  };
  useEffect(() => {
    if (activeTab !== 'feed') return;
    let alive = true;
    fetchUserFeedVideos(targetUser.id).then((list) => { if (alive && list) setFeedVideos({ userId: targetUser.id, posts: list }); });
    fetchUserLongVideos(targetUser.id).then((list) => { if (alive && list) setLongVideos({ userId: targetUser.id, videos: list }); });
    return () => { alive = false; };
  }, [activeTab, targetUser.id]);

  const displayedReels = reels.filter((r) => {
    return r.userId === targetUser.id || r.username === targetUser.username;
  });

  const handleToggleFollowTargetUser = async () => {
    if (isOwnProfile) return;
    // Cancelling a pending request or unfollowing both just clear state;
    // only a fresh follow/request click plays the confetti.
    const wasIdle = !isTargetFollowing && !isTargetFollowRequested;
    try {
      const res = onToggleFollowUser
        ? await onToggleFollowUser(targetUser.id)
        : await toggleFollowUser(targetUser.id);
      if (res && res.success !== undefined) {
        setIsTargetFollowing(!!res.isFollowing);
        setIsTargetFollowRequested(!!res.isFollowRequested);
        if (wasIdle && (res.isFollowing || res.isFollowRequested)) {
          confetti({ particleCount: 25, spread: 50, origin: { y: 0.7 } });
        }
      }
    } catch (err) {
      console.error(err);
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

  // Hide (or show again) MY profile from the person whose profile I am looking at. They are not told.
  const isHiddenFromTarget = !isOwnProfile && (currentUser.hiddenFromIds || []).includes(targetUser.id);
  const handleToggleHideFromTarget = async () => {
    if (isOwnProfile) return;
    setShowThreeDotsMenu(false);
    const res = isHiddenFromTarget ? await unhideProfileFrom(targetUser.id) : await hideProfileFrom(targetUser.id);
    if (res.success) {
      if (onUserUpdated) onUserUpdated({ ...currentUser, hiddenFromIds: res.hiddenFromIds || [] });
    } else {
      window.alert(res.error || 'Could not change that. Please try again.');
    }
  };

  const handleSubmitReport = async () => {
    if (!reportReason) return;
    setIsReporting(true);
    setReportError('');
    try {
      const res = onReportUser
        ? await onReportUser(targetUser.id, reportReason, reportDetails)
        : await submitSafetyReport(targetUser.id, reportReason, reportDetails);

      setIsReporting(false);

      if (res && (res as any).success === false) {
        setReportError((res as any).error || 'Failed to submit report. Please try again.');
        return;
      }

      setReportSuccessNotice(true);
      setTimeout(() => {
        setReportSuccessNotice(false);
        setShowReportModal(false);
        setReportDetails('');
      }, 1500);
    } catch (err) {
      console.error(err);
      setIsReporting(false);
      setReportError('Failed to submit report. Please check your connection and try again.');
    }
  };

  const closeSettingsHub = React.useCallback(() => setShowSettingsHub(false), []);
  useEffect(() => {
    if (!isOwnProfile) return;
    const w = window as unknown as { requestIdleCallback?: (cb: () => void) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) { const id = w.requestIdleCallback(preloadSettingsHub); return () => w.cancelIdleCallback?.(id); }
    const t = window.setTimeout(preloadSettingsHub, 800);
    return () => window.clearTimeout(t);
  }, [isOwnProfile]);
  const settingsContext = useMemo<SettingsContext>(() => ({
    currentUser,
    allUsers,
    onUserUpdated: (u) => onUserUpdated?.(u),
    isStaff: isStaff(currentUser),
    canLogout: !!onLogout,
    canDeleteAccount: !!onDeleteMyAccount,
    actions: {
      editProfile: () => setShowEditProfileModal(true),
      showProfileTab: (tab) => setActiveTab(tab),
      openLanguagePicker: () => setShowLanguagePicker(true),
      openTranslator: () => setShowTranslator(true),
      openDevices: () => setShowDevices(true),
      openInstall: () => setShowInstallPermissionsPage(true),
      openBlocked: () => setShowBlockedAccountsModal(true),
      openHideProfile: () => setShowHideProfileModal(true),
      openPro: () => setShowProFeaturesModal(true),
      openGetVerified: () => setShowGetVerifiedModal(true),
      openSupport: () => setShowSupportModal(true),
      openSuggestionBox: () => setShowSuggestionBox(true),
      openTerms: () => setShowTermsModal(true),
      openPrivacyPolicy: () => setShowPrivacyModal(true),
      openE2ee: () => setShowE2eeModal(true),
      openWallet: () => setShowAccountsStatisticsModal(true),
      openQrScanner: () => setShowQrScannerPage(true),
      openCalculator: () => setShowCalculatorPage(true),
      openFollowUs: () => setShowFollowUsModal(true),
      openLiveAvatar: () => setShowLiveAvatarModal(true),
      openAdmin: () => setShowAdminControlModal(true),
      openSwitchAccount: () => setShowSwitchAccount(true),
      openExport: () => {
        const mine = (p: { userId?: string; username?: string }) => p.userId === currentUser.id || p.username === currentUser.username;
        const newestFirst = (a: { createdAt: string }, b: { createdAt: string }) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
        setExportText(buildDataExport(currentUser, posts.filter((p) => mine(p) && !p.isArchived).sort(newestFirst), reels.filter(mine).sort(newestFirst)));
      },
      openDeleteAccount: () => setShowDeleteAccountModal(true),
      openProfessionalDashboard: () => { setShowSettingsHub(false); onOpenProfessionalDashboard(); },
      openProfileQr: () => setShowProfileQrModal(true),
      logout: () => { setShowSettingsHub(false); onLogout?.(); },
      close: closeSettingsHub
    }
  }), [currentUser, allUsers, posts, reels, onUserUpdated, onLogout, onDeleteMyAccount, onOpenProfessionalDashboard, closeSettingsHub]);

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
        if (onUserUpdated) {
          onUserUpdated({ ...currentUser, followersCount: res.followersCount, followRequests: res.followRequests });
        }
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
            onClick={onGoBack}
            aria-label="Go to previous page"
            className="flex items-center gap-2 text-xs font-bold text-zinc-300 hover:text-white transition-colors cursor-pointer group"
          >
            <ArrowLeft className="w-4 h-4 text-noob group-hover:-translate-x-0.5 transition-transform" />
            <span>Go to previous page</span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400 font-medium">@{targetUser.username}</span>
            {isTargetBlocked && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 font-bold">
                Blocked
              </span>
            )}
            {isHiddenFromTarget && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 font-bold">
                Your profile is hidden from them
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
        {isOwnProfile && onSwitchToAdminPanel && (
          <button
            onClick={onSwitchToAdminPanel}
            className="liquid-glass absolute top-4 right-14 sm:top-6 sm:right-16 z-20 p-2 rounded-xl text-zinc-300 hover:text-noob transition-all cursor-pointer"
            title="Switch back to the Admin Control Panel"
            aria-label="Switch back to the Admin Control Panel"
          >
            <Monitor className="w-5 h-5" />
          </button>
        )}
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 w-9 h-9" ref={menuRef}>
          <button
            onClick={() => {
              // Your own profile: the three dots open "Settings and activity" as a full page. Other people's profiles keep the small menu (block, hide, report, share).
              if (isOwnProfile) { setShowThreeDotsMenu(false); setShowSettingsHub(true); } else setShowThreeDotsMenu(!showThreeDotsMenu);
            }}
            onPointerEnter={isOwnProfile ? preloadSettingsHub : undefined}
            onTouchStart={isOwnProfile ? preloadSettingsHub : undefined}
            className={`liquid-glass relative p-2 rounded-xl transition-all active:scale-90 touch-manipulation cursor-pointer ${
              showThreeDotsMenu
                ? 'liquid-glass-btn-active text-noob'
                : 'text-zinc-300 hover:text-white'
            }`}
            title={isOwnProfile ? 'Settings and activity' : 'Options'}
            aria-label={isOwnProfile ? 'Settings and activity' : 'Options'}
            data-testid="profile-three-dots"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          {/* Dropdown Menu */}
          {showThreeDotsMenu && (
            <div className="liquid-glass absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-32px)] rounded-2xl p-2 z-50 space-y-1 animate-in fade-in zoom-in-95 duration-150 max-h-[80vh] overflow-y-auto overscroll-contain">
              {/* Universal: Appearance (Dark / Light / System) */}
              <AppearanceSetting />

              {/* Universal: Language */}
              <button
                onClick={() => {
                  setShowThreeDotsMenu(false);
                  setShowLanguagePicker(true);
                }}
                className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors group cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <GlobeIcon className="w-4 h-4 text-sky-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-white block group-hover:text-sky-300 transition-colors">Language</span>
                  <span translate="no" dir="auto" className="text-[10px] text-zinc-400 block truncate">{findLanguage(language)?.native ?? 'English'}</span>
                </div>
              </button>

              {/* Universal: Translator — type any text, or show everything people wrote in your language */}
              <button
                onClick={() => {
                  setShowThreeDotsMenu(false);
                  setShowTranslator(true);
                }}
                className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                data-testid="open-translator"
              >
                <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Languages className="w-4 h-4 text-sky-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-white block group-hover:text-sky-300 transition-colors">Translator</span>
                  <span className="text-[10px] text-zinc-400 block truncate">Translate any text, or the whole app</span>
                </div>
              </button>

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
                    onClick={handleToggleHideFromTarget}
                    className="w-full p-2.5 rounded-xl hover:bg-violet-500/10 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      {isHiddenFromTarget ? <Eye className="w-4 h-4 text-violet-300" /> : <EyeOff className="w-4 h-4 text-violet-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-violet-300 block">
                        {isHiddenFromTarget ? `Show my profile to @${targetUser.username}` : `Hide my profile from @${targetUser.username}`}
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        {isHiddenFromTarget ? 'They can see your profile again' : 'They won’t see your profile or posts'}
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
                      setShowProfileQrModal(true);
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-zinc-900 flex items-center gap-3 text-left transition-colors group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                      <Share2 className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-bold text-white block group-hover:text-cyan-400 transition-colors">
                        Share Profile
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        Send in chat, QR code, or copy link
                      </span>
                    </div>
                  </button>
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
                  ? 'bg-gradient-to-tr from-noob to-noob-strong shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                  : isPrivate
                  ? 'bg-gradient-to-tr from-purple-500 to-pink-500 shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                  : 'bg-gradient-to-tr from-[#ff4e6a] via-[#ff758c] to-[#ff9966] shadow-[0_0_20px_rgba(255,78,106,0.3)]'
              }`}
            >
              <AvatarMedia
                src={targetUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                isLiveAvatar={targetUser.isLiveAvatar}
                liveAvatarVideoUrl={targetUser.liveAvatarVideoUrl}
                alt={targetUser.username}
                className="w-full h-full rounded-full object-cover p-0.5 bg-black"
              />
            </div>
            {/* Status Note Floating Pill */}
            {targetUser.statusNote && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-zinc-900 border border-[#ff4e6a]/60 rounded-full px-2.5 py-0.5 text-[10px] text-pink-400 font-bold shadow-lg flex items-center gap-1 whitespace-nowrap">
                <span>{targetUser.statusNote.text}</span>
                {targetUser.statusNote.musicTrack && <Volume2 className="w-3 h-3 text-pink-400 animate-pulse" />}
              </div>
            )}
          </div>

          {/* 2. Username, exactly centred on the page (like the name below it): the verified tick and the
                switch-account arrow hang off its right side without pushing it off centre. */}
          <div className="w-full flex justify-center pt-1 px-14">
            <div className="relative min-w-0">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight text-center break-all">
              @{targetUser.username}
            </h1>
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-1.5 flex items-center gap-1">
            {isOwnProfile && (
              <button
                type="button"
                onClick={() => setShowSwitchAccount(true)}
                className="p-1 -ml-1 rounded-full hover:bg-white/10 cursor-pointer"
                title="Switch account"
                aria-label="Switch account"
              >
                <ChevronDown className="w-5 h-5 text-white" />
              </button>
            )}
            {targetUser.isVerified ? (
              <VerifiedBadge size="md" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-noob fill-noob/20" />
            )}
            </div>
            </div>
          </div>

          {/* 3. Display Name in Perfect Line */}
          <div className="flex items-center justify-center gap-1.5 text-sm text-zinc-300 font-bold -mt-2">
            <span>{targetUser.displayName || targetUser.username}</span>
            {targetUser.pronouns && (
              <span className="text-xs text-zinc-500 font-normal">({targetUser.pronouns})</span>
            )}
          </div>

          {/* Account type (Business or Private; no "Public" tag), centred under the name */}
          {(isBusiness || isPrivate) && (
            <div className="flex justify-center -mt-2">
              {isBusiness ? (
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-noob/20 text-noob font-bold border border-noob/30 flex items-center gap-1 whitespace-nowrap">
                  <Briefcase className="w-3 h-3" /> Business
                </span>
              ) : (
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30 flex items-center gap-1 whitespace-nowrap">
                  <Lock className="w-3 h-3" /> Private
                </span>
              )}
            </div>
          )}

          {/* Mood Status: how this person feels, only when they chose to share it with the person looking (and it has not expired) */}
          {!isTargetBlocked && <ProfileMoodChip userId={targetUser.id} isOwnProfile={isOwnProfile} onOpenFunPage={onOpenFunPage} />}

          {/* 4. Symmetrical Stats Numbers Box */}
          <div className="grid grid-cols-3 divide-x divide-zinc-800 bg-zinc-900/90 border border-zinc-800/80 rounded-2xl py-3.5 px-1 sm:px-6 w-full max-w-md shadow-inner">
            <div className="text-center px-1 sm:px-2 min-w-0">
              <span className="text-lg sm:text-xl font-black text-white block leading-tight">{displayedPosts.length}</span>
              <span className="text-[9px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wide sm:tracking-wider block truncate">Posts</span>
            </div>
            <button
              onClick={() => setFollowListTab('followers')}
              className="text-center px-1 sm:px-2 min-w-0 cursor-pointer"
            >
              <span className="text-lg sm:text-xl font-black text-white block leading-tight">
                {(targetUser.followersCount || 0).toLocaleString()}
              </span>
              <span className="text-[9px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wide sm:tracking-wider block truncate">Followers</span>
            </button>
            <button
              onClick={() => setFollowListTab('following')}
              className="text-center px-1 sm:px-2 min-w-0 cursor-pointer"
            >
              <span className="text-lg sm:text-xl font-black text-white block leading-tight">
                {(targetUser.followingCount || 0).toLocaleString()}
              </span>
              <span className="text-[9px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wide sm:tracking-wider block truncate">Following</span>
            </button>
          </div>

          {/* 5. Primary Action Buttons (Edit / Share vs Follow / Message / Unblock) */}
          <div className="flex items-center justify-center gap-2.5 w-full max-w-md pt-1">
            {isOwnProfile ? (
              <>
                <button
                  onClick={() => setShowProfileQrModal(true)}
                  className="flex-1 py-2 px-4 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white"
                  title="Share Profile"
                >
                  <Share2 className="w-3.5 h-3.5 text-cyan-400" /> Share Profile
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
                        isTargetFollowing || isTargetFollowRequested
                          ? 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-red-500/40 hover:text-red-400'
                          : 'bg-noob hover:bg-[#00e65c] text-black font-extrabold'
                      }`}
                    >
                      {isTargetFollowing ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5 text-red-400 group-hover:text-red-500" /> Unfollow
                        </>
                      ) : isTargetFollowRequested ? (
                        <>
                          <Clock className="w-3.5 h-3.5" /> Requested
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" /> {targetUser.accountType === 'private' ? 'Request' : 'Follow'}
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
                      onClick={() => setShowProfileQrModal(true)}
                      className="py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center cursor-pointer shadow-sm bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300 hover:text-white"
                      title="Share Profile"
                    >
                      <Share2 className="w-3.5 h-3.5 text-cyan-400" />
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

          {mutualFollowers.length > 0 && (
            <button
              onClick={() => setShowMutualFollowersSheet(true)}
              className="flex items-center gap-2 text-left cursor-pointer group"
            >
              <div className="flex -space-x-2 shrink-0">
                {mutualFollowers.slice(0, 3).map((m) => (
                  <img
                    key={m.id}
                    src={m.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
                    alt={m.username}
                    referrerPolicy="no-referrer"
                    className="w-5 h-5 rounded-full object-cover ring-2 ring-zinc-950 bg-black"
                  />
                ))}
              </div>
              <p className="text-[11px] text-zinc-400 truncate group-hover:text-zinc-300 transition-colors">
                Followed by{' '}
                <span className="text-zinc-200 font-semibold" translate="no">@{mutualFollowers[0].username}</span>
                {mutualFollowers.length === 2 && (
                  <>
                    {' '}and <span className="text-zinc-200 font-semibold" translate="no">@{mutualFollowers[1].username}</span>
                  </>
                )}
                {mutualFollowers.length > 2 && (
                  <> and <span className="text-zinc-200 font-semibold">{mutualFollowers.length - 1} others</span></>
                )}
              </p>
            </button>
          )}

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
              <span className="text-[11px] font-bold text-noob bg-noob/10 px-3 py-1 rounded-full border border-noob/20">
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
                  <Phone className="w-3 h-3 text-noob" /> Call / WhatsApp
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. Follow Requests Drawer (for Private Accounts) — only ever the
          viewer's OWN incoming requests, so this must never render while
          looking at someone else's profile. */}
      {isOwnProfile && isPrivate && followRequests.length > 0 && (
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
                    className="px-3 py-1 rounded-lg bg-noob text-black font-bold text-xs hover:scale-105 transition-transform flex items-center gap-1 cursor-pointer"
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
        <div className="my-4 p-4 bg-gradient-to-r from-zinc-900 via-zinc-900 to-[#0e2417] border border-noob/30 rounded-3xl flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-noob/10 border border-noob/30 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-noob shrink-0" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-white">Professional Creator Insights</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-noob/20 text-noob font-bold">LIVE</span>
              </div>
              <span className="text-[11px] text-zinc-400">
                Live organic impressions, profile engagement &amp; growth metrics
              </span>
            </div>
          </div>
          <button
            onClick={onOpenProfessionalDashboard}
            className="px-4 py-2 bg-noob hover:bg-[#00e65c] text-black text-xs font-black rounded-xl hover:scale-105 transition-transform cursor-pointer"
          >
            View Insights
          </button>
        </div>
      )}

      {/* 5. Story Highlights: every story this person has posted, auto-saved and grouped by the
          day it went up (see the 22 Sep story/highlight redesign) — plus, on your own profile,
          any you made directly with "+ New" without ever posting a story for them. */}
      {(isOwnProfile || highlights.length > 0) && (
        <div className="mb-6 flex items-center gap-4 overflow-x-auto pb-2 no-scrollbar">
          {isOwnProfile && (
            <div
              onClick={() => {
                setEditingHighlight(null);
                setShowHighlightManager(true);
              }}
              className="flex flex-col items-center gap-1.5 shrink-0 cursor-pointer group"
            >
              <div className="w-14 h-14 rounded-full bg-zinc-900 border border-dashed border-zinc-700 flex items-center justify-center text-zinc-400 group-hover:border-noob group-hover:text-noob transition-all group-hover:scale-105">
                <Plus className="w-5 h-5" />
              </div>
              <span className="text-[11px] text-zinc-400 font-bold group-hover:text-noob transition-colors">New</span>
            </div>
          )}

          {highlights.map((hl) => (
            <div key={hl.id} className="flex flex-col items-center gap-1.5 shrink-0 relative group">
              <div
                onClick={() => setActiveHighlightForViewer(hl)}
                className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-zinc-700 via-zinc-800 to-zinc-700 group-hover:from-noob group-hover:to-noob-strong transition-all group-hover:scale-105 shadow-md cursor-pointer relative"
              >
                <img
                  src={hl.coverUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
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
                    setEditingHighlight(hl);
                    setShowHighlightManager(true);
                  }}
                  className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-zinc-900 border border-zinc-700 hover:border-noob text-zinc-400 hover:text-noob flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer shadow-lg z-10"
                  title={`Edit ${hl.title}`}
                >
                  <Edit3 className="w-2.5 h-2.5" />
                </button>
              )}
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
                className="text-[11px] text-zinc-300 font-medium truncate max-w-[68px] text-center cursor-pointer hover:text-noob transition-colors"
              >
                {hl.title}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* The Fun pages' cards: Ask Me Anything (and, on someone's profile, the answers they published) */}
      {!isTargetBlocked && <ProfileAskCard profileUser={targetUser} isOwnProfile={isOwnProfile} onOpenFunPage={onOpenFunPage} />}

      {/* 6. Profile Content Navigation Tabs */}
      <div className="flex items-center justify-around border-b border-zinc-800 text-xs font-bold pt-2 mb-4">
        <button
          onClick={() => setActiveTab('posts')}
          className={`pb-3 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
            activeTab === 'posts' ? 'border-noob text-noob' : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Grid className="w-4 h-4" />
          <span className="hidden sm:inline">POSTS</span>
        </button>

        <button
          onClick={() => setActiveTab('reels')}
          className={`pb-3 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
            activeTab === 'reels' ? 'border-noob text-noob' : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Film className="w-4 h-4" />
          <span className="hidden sm:inline">REELS</span>
        </button>

        <button
          onClick={() => setActiveTab('feed')}
          className={`pb-3 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
            activeTab === 'feed' ? 'border-noob text-noob' : 'border-transparent text-zinc-500 hover:text-zinc-300'
          }`}
          title="Videos shared in the Feed"
        >
          <PlaySquare className="w-4 h-4" />
          <span className="hidden sm:inline">FEED</span>
        </button>

        {/* Saved, Liked and Archive are private — only the profile's own owner sees these tabs at all. */}
        {isOwnProfile && (
          <>
            <button
              onClick={() => setActiveTab('saved')}
              className={`pb-3 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
                activeTab === 'saved' ? 'border-noob text-noob' : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
              title="Organized Private Collections"
            >
              <Bookmark className="w-4 h-4" />
              <span className="hidden sm:inline">SAVED</span>
            </button>

            <button
              onClick={() => setActiveTab('liked')}
              className={`pb-3 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
                activeTab === 'liked' ? 'border-noob text-noob' : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
              title="Liked Posts"
            >
              <Heart className="w-4 h-4" />
              <span className="hidden sm:inline">LIKED</span>
            </button>

            <button
              onClick={() => setActiveTab('archive')}
              className={`pb-3 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
                activeTab === 'archive' ? 'border-noob text-noob' : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
              title="Archived Posts Vault"
            >
              <Archive className="w-4 h-4" />
              <span className="hidden sm:inline">ARCHIVE</span>
            </button>
          </>
        )}
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
                  <PostThumbnailMedia
                    src={post.slides?.[0]?.mediaUrl}
                    mediaType={post.slides?.[0]?.mediaType}
                    alt={post.caption}
                    className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${POST_FILTERS.find((f) => f.id === post.slides?.[0]?.filter)?.style || ''}`}
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
                {reel.thumbnailUrl ? (
                  <img loading="lazy" decoding="async"
                    src={reel.thumbnailUrl}
                    alt={reel.caption}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  // Older reels with no captured thumbnail — the video's own
                  // first frame is still the real reel, not a generic stock
                  // photo shared by every un-thumbnailed reel in the app.
                  <LazyVideo
                    src={reel.videoUrl}
                    muted
                    playsInline
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                )}
                <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1 text-xs text-white font-bold bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-lg border border-white/10">
                  <Film className="w-3.5 h-3.5" /> {reel.viewsCount}
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* B2. FEED VIDEOS: the video posts, each as a wide card across the full width, one under the other */}
        {activeTab === 'feed' && (
          feedTabItems.length === 0 ? (
            <div className="text-center py-16 bg-zinc-950 rounded-3xl border border-zinc-800 space-y-2">
              <PlaySquare className="w-10 h-10 text-zinc-600 mx-auto" />
              <span className="text-sm font-bold text-zinc-300 block">No videos shared yet</span>
              <p className="text-xs text-zinc-500">Videos you post to the Feed or upload to Videos show up here.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {feedTabItems.map((item) => {
                if (item.kind === 'video') {
                  const video = item.video;
                  return (
                    <button
                      key={`lv-${video.id}`}
                      type="button"
                      onClick={() => onOpenLongVideo?.(video.id)}
                      className="group block w-full text-left cursor-pointer"
                      aria-label={`Watch ${video.title || 'video'}`}
                    >
                      <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800/80 shadow-md">
                        {video.thumbnailUrl ? (
                          <img src={video.thumbnailUrl} alt={video.title} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" referrerPolicy="no-referrer" />
                        ) : (
                          <PostThumbnailMedia src={video.videoUrl} mediaType="video" alt={video.title} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" />
                        )}
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-md border border-white/25 flex items-center justify-center">
                            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                          </span>
                        </span>
                        <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">{formatVideoLength(video.durationSeconds)}</span>
                      </div>
                      <div className="mt-2 px-1">
                        <p className="text-sm font-bold text-white line-clamp-2 break-words">{video.title || 'Untitled video'}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {video.viewsCount.toLocaleString()} {video.viewsCount === 1 ? 'view' : 'views'} · {video.likesCount.toLocaleString()} {video.likesCount === 1 ? 'like' : 'likes'} · {formatRelativeTime(video.createdAt)}
                        </p>
                      </div>
                    </button>
                  );
                }
                const post = item.post;
                const videoSlide = post.slides.find((s) => s.mediaType === 'video') || post.slides[0];
                return (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => setWatchVideoPost(post)}
                    className="group block w-full text-left cursor-pointer"
                    aria-label={`Watch ${post.caption || 'video'}`}
                  >
                    <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800/80 shadow-md">
                      <PostThumbnailMedia
                        src={videoSlide?.mediaUrl}
                        mediaType="video"
                        alt={post.caption}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-md border border-white/25 flex items-center justify-center">
                          <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                        </span>
                      </span>
                    </div>
                    <div className="mt-2 px-1">
                      <p className="text-sm font-bold text-white line-clamp-2 break-words">{post.caption || 'Untitled video'}</p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        {post.likesCount.toLocaleString()} {post.likesCount === 1 ? 'like' : 'likes'} · {(post.commentsCount || 0).toLocaleString()} {post.commentsCount === 1 ? 'comment' : 'comments'} · {formatRelativeTime(post.createdAt)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        )}

        {/* C. SAVED POSTS & COLLECTIONS (owner only) */}
        {activeTab === 'saved' && isOwnProfile && (
          <div className="space-y-6">
            {/* Header & New Collection Button */}
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-noob" />
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
                        coverUrl: savedPosts[0]?.slides?.[0]?.mediaUrl || posts[0]?.slides?.[0]?.mediaUrl || '/noob-logo-circle.png',
                        postsCount: 1,
                        isCollaborative: false,
                        posts: [savedPosts[0] || posts[0]]
                      }
                    ]);
                  }
                }}
                className="text-xs text-noob font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-noob/10 border border-noob/30 hover:bg-noob/20 transition-colors cursor-pointer"
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
                    <PostThumbnailMedia
                      src={post.slides?.[0]?.mediaUrl}
                      mediaType={post.slides?.[0]?.mediaType}
                      alt={post.caption || 'Saved post'}
                      className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ${POST_FILTERS.find((f) => f.id === post.slides?.[0]?.filter)?.style || ''}`}
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
                <Bookmark className="w-10 h-10 text-noob mx-auto mb-3 opacity-60" />
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
                      className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden p-2.5 group hover:border-noob/50 transition-colors cursor-pointer shadow-md"
                    >
                      <div className="aspect-square rounded-xl overflow-hidden bg-black mb-2">
                        <img loading="lazy" decoding="async"
                          src={col.coverUrl || '/noob-logo-circle.png'}
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

        {/* D. LIKED POSTS (owner only) */}
        {activeTab === 'liked' && isOwnProfile && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {likedPosts.map((post) => (
              <div
                key={post.id}
                onClick={() => onSelectPost(post)}
                className="relative aspect-square bg-zinc-900 rounded-2xl overflow-hidden group cursor-pointer border border-zinc-800"
              >
                <PostThumbnailMedia
                  src={post.slides?.[0]?.mediaUrl}
                  mediaType={post.slides?.[0]?.mediaType}
                  alt=""
                  className={`w-full h-full object-cover group-hover:scale-105 transition-transform ${POST_FILTERS.find((f) => f.id === post.slides?.[0]?.filter)?.style || ''}`}
                />
              </div>
            ))}
          </div>
        )}

        {/* E. ARCHIVE VAULT (owner only — never visible on someone else's profile) */}
        {activeTab === 'archive' && isOwnProfile && (
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
                  <PostThumbnailMedia
                    src={post.slides?.[0]?.mediaUrl}
                    mediaType={post.slides?.[0]?.mediaType}
                    alt=""
                    className={`w-full h-full object-cover opacity-75 group-hover:opacity-100 ${POST_FILTERS.find((f) => f.id === post.slides?.[0]?.filter)?.style || ''}`}
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

      {showHideProfileModal && <HideProfileModal currentUser={currentUser} onClose={() => setShowHideProfileModal(false)} onUserUpdated={onUserUpdated} />}
      {showLanguagePicker && (
        <LanguagePicker
          value={language}
          onSelect={(code) => {
            void chooseLanguage(code);
            setShowLanguagePicker(false);
          }}
          onClose={() => setShowLanguagePicker(false)}
        />
      )}
      {showSwitchAccount && <SwitchAccountModal onClose={() => setShowSwitchAccount(false)} />}
      {showDevices && (
        <DevicesModal
          onClose={() => setShowDevices(false)}
          onOpenEncryption={() => {
            setShowDevices(false);
            setShowEncryptionSettings(true);
          }}
        />
      )}
      {showEncryptionSettings && <EncryptionSettingsModal onClose={() => setShowEncryptionSettings(false)} />}

      {showBlockedAccountsModal && (
        <BlockedAccountsModal
          currentUser={currentUser}
          allUsers={allUsers}
          onClose={() => setShowBlockedAccountsModal(false)}
          onUserUpdated={onUserUpdated}
        />
      )}

      {showCalculatorPage && <CalculatorPage onClose={() => setShowCalculatorPage(false)} />}

      {exportText !== null && <ExportDataModal text={exportText} onClose={() => setExportText(null)} />}

      {showTranslator && <TranslatorPage onClose={() => setShowTranslator(false)} />}
      {showQrScannerPage && (
        <QrScannerPage
          allUsers={allUsers}
          currentUser={currentUser}
          onClose={() => setShowQrScannerPage(false)}
          onOpenProfile={(user) => { setShowQrScannerPage(false); onNavigateToUserProfile?.(user); }}
        />
      )}

      {showInstallPermissionsPage && (
        <InstallAndPermissionsPage
          currentUser={currentUser}
          onUserUpdated={onUserUpdated}
          onClose={() => setShowInstallPermissionsPage(false)}
        />
      )}

      {showMutualFollowersSheet && (
        <MutualFollowersSheet
          currentUser={currentUser}
          mutuals={mutualFollowers}
          allUsers={allUsers}
          onClose={() => setShowMutualFollowersSheet(false)}
          onToggleFollowUser={onToggleFollowUser}
          onNavigateToUserProfile={onNavigateToUserProfile}
        />
      )}

      {showShareToChatModal && (
        <ShareToChatModal
          currentUser={currentUser}
          targetUser={targetUser}
          onClose={() => setShowShareToChatModal(false)}
        />
      )}

      {showProfileQrModal && (
        <ProfileQrModal
          targetUser={targetUser}
          onSendInChat={() => {
            setShowProfileQrModal(false);
            setShowShareToChatModal(true);
          }}
          onClose={() => setShowProfileQrModal(false)}
        />
      )}

      {showFollowUsModal && <FollowUsModal onClose={() => setShowFollowUsModal(false)} />}

      {watchVideoPost && (
        <FeedVideoWatchView
          post={watchVideoPost}
          currentUser={currentUser}
          onClose={() => setWatchVideoPost(null)}
          onNavigateToProfile={(u) => { setWatchVideoPost(null); onNavigateToUserProfile?.(u); }}
        />
      )}

      {followListTab && (
        <FollowListPage
          currentUser={currentUser}
          targetUser={targetUser}
          allUsers={allUsers}
          initialTab={followListTab}
          onClose={() => setFollowListTab(null)}
          onToggleFollowUser={onToggleFollowUser}
          onRemoveFollower={onRemoveFollower}
          onNavigateToUserProfile={(u) => {
            setFollowListTab(null);
            onNavigateToUserProfile?.(u);
          }}
        />
      )}

      {/* "Settings and activity": the full page the three dots open on your own profile. Every row either opens one of its own pages or one of the windows below. */}
      {showSettingsHub && isOwnProfile && (
        <React.Suspense fallback={<LazyFallback />}>
          <SettingsHub ctx={settingsContext} onClose={closeSettingsHub} />
        </React.Suspense>
      )}

      {showSuggestionBox && (
        <React.Suspense fallback={<LazyFallback />}>
          <SuggestionBoxModal userId={currentUser.id} onClose={() => setShowSuggestionBox(false)} />
        </React.Suspense>
      )}

      {showDeleteAccountModal && onDeleteMyAccount && (
        <DeleteAccountModal
          username={currentUser.username}
          onClose={() => setShowDeleteAccountModal(false)}
          onDeleteMyAccount={onDeleteMyAccount}
        />
      )}

      {/* 10. Legal & Support Modals */}
      {showTermsModal && <TermsAndConditions onClose={() => setShowTermsModal(false)} />}
      {showPrivacyModal && <PrivacyPolicy onClose={() => setShowPrivacyModal(false)} />}
      {showE2eeModal && <EndToEndEncryption onClose={() => setShowE2eeModal(false)} />}
      {showSupportModal && (
        <React.Suspense fallback={<LazyFallback />}>
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
        </React.Suspense>
      )}

      {/* 11. Highlight Viewer — the same story viewer, in playback-only mode (see the 22 Sep
          story/highlight redesign). Manual highlight creation/editing is its own modal below. */}
      {activeHighlightForViewer && (
        <StoryViewerModal
          stories={activeHighlightForViewer.items.map((it): Story => ({
            id: it.id,
            userId: targetUser.id,
            username: targetUser.username,
            userAvatar: targetUser.avatar,
            isVerified: !!targetUser.isVerified,
            mediaUrl: it.mediaUrl,
            mediaType: it.mediaType,
            durationSeconds: 5,
            createdAt: it.createdAt,
            expiresAt: it.createdAt,
            isCloseFriendsOnly: false,
            isViewed: true,
            viewedBy: [],
            stickers: it.stickers || [],
            comments: []
          }))}
          initialIndex={0}
          onClose={() => setActiveHighlightForViewer(null)}
          currentUser={currentUser}
          onAddComment={() => {}}
          isHighlight
          onEditHighlight={
            isOwnProfile
              ? () => {
                  setEditingHighlight(activeHighlightForViewer);
                  setActiveHighlightForViewer(null);
                  setShowHighlightManager(true);
                }
              : undefined
          }
        />
      )}

      {showHighlightManager && (
        <HighlightManagerModal
          existingHighlight={editingHighlight}
          onDone={reloadHighlights}
          onClose={() => {
            setShowHighlightManager(false);
            setEditingHighlight(null);
          }}
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
        <React.Suspense fallback={<LazyFallback />}>
          <AdminControlModal
            currentUser={currentUser}
            onClose={() => setShowAdminControlModal(false)}
          />
        </React.Suspense>
      )}

      {/* 14.5 Report User Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
                  <Flag className="w-4.5 h-4.5 text-amber-400" />
                </div>
                <h2 className="text-base font-bold text-white tracking-tight">Report @{targetUser.username}</h2>
              </div>
              <button
                onClick={() => {
                  setShowReportModal(false);
                  setReportError('');
                }}
                className="text-zinc-400 hover:text-white p-1.5 rounded-full hover:bg-zinc-900 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {reportSuccessNotice ? (
              <div className="py-6 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-noob mx-auto" />
                <p className="text-sm font-bold text-white">Report submitted</p>
                <p className="text-xs text-zinc-400">Our Trust &amp; Safety team will review this account.</p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-300 block">Reason</label>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option>Cyber Bullying & Harassment</option>
                    <option>Spam or Fake Account</option>
                    <option>Hate Speech</option>
                    <option>Inappropriate or Explicit Content</option>
                    <option>Impersonation</option>
                    <option>Other</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-300 block">Additional details (optional)</label>
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    rows={3}
                    placeholder="Anything else that would help us review this..."
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 resize-none"
                  />
                </div>

                {reportError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{reportError}</span>
                  </div>
                )}

                <p className="text-[10px] text-zinc-500">
                  Reporting @{targetUser.username} will also block them from interacting with your account.
                </p>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      setShowReportModal(false);
                      setReportError('');
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-zinc-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitReport}
                    disabled={isReporting}
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isReporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Flag className="w-3.5 h-3.5" />}
                    {isReporting ? 'Submitting...' : 'Submit Report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 15. Wallet Modal (previously imported but never rendered) */}
      {showAccountsStatisticsModal && (
        <AccountsStatisticsModal
          currentUser={currentUser}
          allUsers={allUsers}
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
          allUsers={allUsers}
        />
      )}

      {showLiveAvatarModal && (
        <LiveProfilePictureModal
          currentUser={currentUser}
          onClose={() => setShowLiveAvatarModal(false)}
          onUserUpdated={onUserUpdated}
          onUpgradeClick={() => setShowProFeaturesModal(true)}
        />
      )}
    </div>
  );
};

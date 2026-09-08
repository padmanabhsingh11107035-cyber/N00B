import React, { useState, useEffect } from 'react';
import {
  Home,
  Compass,
  Film,
  MessageSquare,
  Gamepad2,
  Music,
  BarChart3,
  Bell,
  BellRing,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  LogOut,
  Smile,
  Users,
  UserCheck,
  UserPlus
} from 'lucide-react';
import { Post, Reel, Story, User, StatusNote, AppNotification, NotificationType } from './types';
import {
  fetchCurrentUser,
  fetchPosts,
  fetchStories,
  fetchReels,
  fetchUsers,
  toggleFollowUser,
  toggleLikePost,
  toggleSavePost,
  toggleArchivePost,
  toggleCommentsPost,
  toggleLikeCountPost,
  deletePost,
  createPost,
  createReel,
  createStory,
  addCommentToStory,
  updateUserBio,
  updateUserStatusNote,
  logoutUser,
  deleteAllUsers,
  fetchAppNotifications
} from './services/api';
import { FloatingNavBar, NavTab } from './components/Navigation/FloatingNavBar';
import { FeedView } from './components/Feed/FeedView';
import { ExploreView } from './components/Explore/ExploreView';
import { ReelsView } from './components/Reels/ReelsView';
import { ChatView } from './components/Chat/ChatView';
import { GamesView } from './components/Games/GamesView';
import { MusicHubView } from './components/Music/MusicHubView';
import { ProfileView } from './components/Profile/ProfileView';
import { StoryViewerModal } from './components/Stories/StoryViewerModal';
import { CreateStoryModal } from './components/Stories/CreateStoryModal';
import { PostCreationModal } from './components/PostCreation/PostCreationModal';
import { ProfessionalDashboardModal } from './components/Modals/ProfessionalDashboardModal';
import { NotificationsModal, NotificationSettingsState } from './components/Modals/NotificationsModal';
import { StatusNoteModal } from './components/Modals/StatusNoteModal';
import { AuthView } from './components/Auth/AuthView';
import { TermsAndConditions } from './components/Legal/TermsAndConditions';
import { PrivacyPolicy } from './components/Legal/PrivacyPolicy';
import { CustomerSupportModal } from './components/Support/CustomerSupportModal';
import { VerifiedBadge } from './components/Common/VerifiedBadge';
import { ALL_50_MINI_GAMES, MiniGameMeta } from './components/Games/types';
import { GamePlayModal } from './components/Games/GamePlayModal';
import { Headphones, Bot } from 'lucide-react';

const INITIAL_NOTIFICATIONS: AppNotification[] = [];

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('feed');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<User[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState<AppNotification[]>(INITIAL_NOTIFICATIONS);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingsState>({
    masterEnabled: true,
    followRequests: true,
    newFollowers: true,
    likesComments: true,
    gamesLeaderboard: true,
    musicHub: true,
    soundAlerts: true
  });
  const [loading, setLoading] = useState(true);

  // Active Modals & Selected items
  const [activeStoryViewerIndex, setActiveStoryViewerIndex] = useState<number | null>(null);
  const [showCreateStoryModal, setShowCreateStoryModal] = useState(false);
  const [showPostCreationModal, setShowPostCreationModal] = useState(false);
  const [showProfessionalDashboardModal, setShowProfessionalDashboardModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showStatusNoteModal, setShowStatusNoteModal] = useState(false);
  const [showCustomerSupportModal, setShowCustomerSupportModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [selectedReelId, setSelectedReelId] = useState<string | undefined>(undefined);
  const [viewingProfileUser, setViewingProfileUser] = useState<User | null>(null);
  const [pendingChatUser, setPendingChatUser] = useState<User | null>(null);
  const [gameToPlay, setGameToPlay] = useState<{
    game: MiniGameMeta;
    challenger?: string;
    roomCode?: string;
  } | null>(null);

  useEffect(() => {
    loadInitialData();

    // Check URL parameters for direct game invite link
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const gameParam = params.get('playGame');
        const challengerParam = params.get('challenger');
        const roomParam = params.get('room');

        if (gameParam) {
          const matched = ALL_50_MINI_GAMES.find(
            (g) => g.id === gameParam || g.id.toLowerCase() === gameParam.toLowerCase()
          );
          if (matched) {
            setGameToPlay({
              game: matched,
              challenger: challengerParam || undefined,
              roomCode: roomParam || undefined
            });
            setActiveTab('games');
          }
        }
      } catch (err) {
        console.error('URL param parse error:', err);
      }
    }
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [user, pList, sList, rList, uList, notifRes] = await Promise.all([
        fetchCurrentUser(),
        fetchPosts(),
        fetchStories(),
        fetchReels(),
        fetchUsers(),
        fetchAppNotifications().catch(() => ({ notifications: [] }))
      ]);
      setCurrentUser(user);
      setPosts(pList);
      setStories(sList);
      setReels(rList);
      setRegisteredUsers(uList);
      if (notifRes && Array.isArray(notifRes.notifications)) {
        setNotifications(notifRes.notifications);
        setUnreadNotificationCount(notifRes.notifications.filter((n: any) => !n.isRead).length);
      }
    } catch (err) {
      console.error('Failed to load initial data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToReel = (reelId: string) => {
    setSelectedReelId(reelId);
    setActiveTab('reels');
  };

  const handleNavigateToPost = (postId: string) => {
    setActiveTab('feed');
    setTimeout(() => {
      const el = document.getElementById(`post-card-${postId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  };

  const handleNavigateToUserProfile = (user: User) => {
    if (user.id === currentUser?.id || user.username?.toLowerCase() === currentUser?.username?.toLowerCase()) {
      setViewingProfileUser(null);
    } else {
      setViewingProfileUser(user);
    }
    setActiveTab('profile');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- SMART POST OR REEL ACTIONS ---
  const handleCreatePostOrReel = async (data: {
    isReel?: boolean;
    reelData?: Partial<Reel>;
    postData?: Partial<Post>;
  }) => {
    try {
      if (data.isReel && data.reelData) {
        const newReel = await createReel(data.reelData);
        setReels((prev) => [newReel, ...prev]);
        setSelectedReelId(newReel.id);
        setActiveTab('reels');
      } else if (data.postData) {
        const newPost = await createPost(data.postData);
        setPosts((prev) => [newPost, ...prev]);
        setActiveTab('feed');
      }
    } catch (err) {
      console.error('Failed to create post or reel:', err);
    }
  };

  // --- POST ACTIONS ---
  const handleToggleLike = async (postId: string) => {
    try {
      const res = await toggleLikePost(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isLiked: res.isLiked, likesCount: res.likesCount } : p
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleSave = async (postId: string) => {
    try {
      const res = await toggleSavePost(postId);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, isSaved: res.isSaved } : p))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleArchive = async (postId: string) => {
    try {
      const res = await toggleArchivePost(postId);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, isArchived: res.isArchived } : p))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleComments = async (postId: string) => {
    try {
      const res = await toggleCommentsPost(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isCommentsDisabled: res.isCommentsDisabled } : p
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleLikeCount = async (postId: string) => {
    try {
      const res = await toggleLikeCountPost(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, isLikeCountHidden: res.isLikeCountHidden } : p
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreatePost = async (postData: Partial<Post>) => {
    try {
      const newPost = await createPost(postData);
      setPosts([newPost, ...posts]);
      setActiveTab('feed');
    } catch (err) {
      console.error(err);
    }
  };

  // --- STORY ACTIONS ---
  const handleCreateStory = async (storyData: Partial<Story>) => {
    try {
      const newStory = await createStory(storyData);
      setStories([newStory, ...stories]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddStoryComment = async (storyId: string, text: string) => {
    try {
      const newComment = await addCommentToStory(storyId, text);
      setStories((prev) =>
        prev.map((s) =>
          s.id === storyId ? { ...s, comments: [...(s.comments || []), newComment] } : s
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  // --- PROFILE ACTIONS ---
  const handleUpdateBio = async (newBio: string) => {
    try {
      const updatedUser = await updateUserBio(newBio);
      setCurrentUser(updatedUser);
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateStatusNote = async (note: StatusNote | undefined) => {
    try {
      const updatedUser = await updateUserStatusNote(note);
      setCurrentUser(updatedUser);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleFollowUser = async (userId: string) => {
    try {
      const res = await toggleFollowUser(userId);
      setRegisteredUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, isFollowing: res.isFollowing, followersCount: res.followersCount } : u))
      );
      if (currentUser) {
        const curFollowing = currentUser.followingIds || [];
        const nextFollowing = res.isFollowing
          ? [...curFollowing.filter((id) => id !== userId), userId]
          : curFollowing.filter((id) => id !== userId);
        setCurrentUser({
          ...currentUser,
          followingIds: nextFollowing,
          followingCount: nextFollowing.length
        });
      }
      if (viewingProfileUser && viewingProfileUser.id === userId) {
        setViewingProfileUser((prev) =>
          prev
            ? {
                ...prev,
                isFollowing: res.isFollowing,
                followersCount: res.followersCount
              }
            : null
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenNotifications = () => {
    setShowNotificationsModal(true);
    setUnreadNotificationCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleAcceptFollowRequest = (notifId: string, actorUsername: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notifId
          ? { ...n, actionStatus: 'accepted', text: 'You accepted their follow request.' }
          : n
      )
    );
    setRegisteredUsers((prev) =>
      prev.map((u) =>
        u.username === actorUsername ? { ...u, isFollowing: true, isFollowRequested: false } : u
      )
    );
    if (currentUser) {
      setCurrentUser((prev) => (prev ? { ...prev, followersCount: (prev.followersCount || 0) + 1 } : null));
    }
  };

  const handleDeclineFollowRequest = (notifId: string, actorUsername: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notifId
          ? { ...n, actionStatus: 'declined', text: 'Follow request dismissed.' }
          : n
      )
    );
    setRegisteredUsers((prev) =>
      prev.map((u) => (u.username === actorUsername ? { ...u, isFollowRequested: false } : u))
    );
  };

  const handleSimulateNotification = (type: NotificationType = 'new_follower') => {
    const randomUsers = [
      {
        username: 'nova_star',
        name: 'Nova Star',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'
      },
      {
        username: 'pixel_coder',
        name: 'Pixel Coder',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80'
      },
      {
        username: 'synth_wave',
        name: 'Synth Wave',
        avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&auto=format&fit=crop&q=80'
      },
      {
        username: 'alex_gamer',
        name: 'Alex V.',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=300&auto=format&fit=crop&q=80'
      }
    ];
    const picked = randomUsers[Math.floor(Math.random() * randomUsers.length)];
    let text = 'started following you.';
    let actionStatus: 'pending' | undefined = undefined;
    if (type === 'follow_request_received') {
      text = 'requested to follow you.';
      actionStatus = 'pending';
    } else if (type === 'follow_request_accepted') {
      text = 'accepted your follow request.';
    } else if (type === 'post_like') {
      text = 'liked your recent CAD project post.';
    } else if (type === 'post_comment') {
      text = 'commented: "Awesome 3D rendering!"';
    } else if (type === 'music_share') {
      text = 'shared a new audio track with you.';
    }

    const newNotif: AppNotification = {
      id: `notif_${Date.now()}`,
      type,
      actorId: picked.username,
      actorUsername: picked.username,
      actorDisplayName: picked.name,
      actorAvatar: picked.avatar,
      text,
      time: 'Just now',
      timestamp: Date.now(),
      isRead: false,
      actionStatus
    };

    setNotifications((prev) => [newNotif, ...prev]);
    setUnreadNotificationCount((prev) => prev + 1);
  };

  const handleSelectNavTab = (tab: NavTab) => {
    if (tab === 'post') {
      setShowPostCreationModal(true);
    } else {
      if (tab === 'profile') {
        setViewingProfileUser(null);
      }
      setActiveTab(tab);
      if (tab === 'chat') {
        setUnreadChatCount(0);
      }
    }
  };

  const handleAuthSuccess = (user: User) => {
    if (user && user.id) {
      localStorage.setItem('ig_user_id', user.id);
    }
    setCurrentUser(user);
    loadInitialData();
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('ig_user_id');
      await logoutUser();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('ig_user_id');
      setCurrentUser(null);
    }
  };

  const handleDeleteAllUsers = async () => {
    try {
      await deleteAllUsers();
    } catch (err) {
      console.error('Delete all users error:', err);
    } finally {
      setCurrentUser(null);
      setPosts([]);
      setStories([]);
      setReels([]);
      setRegisteredUsers([]);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-screen bg-black flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 rounded-full border-2 border-red-500 border-t-transparent animate-spin mb-4" />
        <span className="text-sm font-extrabold tracking-tight text-white">
          NOOB
        </span>
        <span className="text-[10px] text-zinc-500 mt-1">Fun & Connecting People...</span>
      </div>
    );
  }

  // If no user is logged in, present the main Login / Sign Up Page
  if (!currentUser) {
    return <AuthView onAuthSuccess={handleAuthSuccess} />;
  }

  const otherUsers = registeredUsers.filter((u) => u.id !== currentUser.id && u.username !== currentUser.username);

  return (
    <div className="min-h-screen bg-black text-white selection:bg-red-500 selection:text-white font-sans antialiased flex flex-row items-start justify-center p-0 lg:p-6 lg:gap-8 overflow-x-hidden">
      {/* 1. Left Desktop Sidebar (shown on xl: screens) */}
      <aside className="hidden xl:flex flex-col w-[240px] h-[92vh] sticky top-6 justify-between pb-4 shrink-0 select-none">
        <div className="space-y-7">
          {/* Logo & Brand Header */}
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 to-rose-400 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.35)]">
              <Smile className="w-5 h-5 text-white stroke-[2.5]" />
            </div>
            <div>
              <span className="text-lg font-black tracking-tight text-white flex items-center gap-1.5">
                NOOB <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold border border-red-500/30">APP</span>
              </span>
              <span className="text-[10px] text-zinc-500 block -mt-0.5">Fun & Connect</span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button
              onClick={() => handleSelectNavTab('feed')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'feed'
                  ? 'bg-zinc-900/90 text-white border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)] font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
              }`}
            >
              <Home className={`w-4 h-4 ${activeTab === 'feed' ? 'stroke-red-500' : 'stroke-current'}`} />
              <span>Home Feed</span>
            </button>

            <button
              onClick={() => handleSelectNavTab('explore')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'explore'
                  ? 'bg-zinc-900/90 text-white border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)] font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
              }`}
            >
              <Compass className={`w-4 h-4 ${activeTab === 'explore' ? 'stroke-red-500' : 'stroke-current'}`} />
              <span>Explore People</span>
            </button>

            <button
              onClick={() => handleSelectNavTab('reels')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'reels'
                  ? 'bg-zinc-900/90 text-white border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)] font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
              }`}
            >
              <Film className={`w-4 h-4 ${activeTab === 'reels' ? 'stroke-red-500' : 'stroke-current'}`} />
              <span>Reels & Videos</span>
            </button>

            <button
              onClick={handleOpenNotifications}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-900/40 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <Bell className="w-4 h-4 text-emerald-400 group-hover:rotate-12 transition-transform" />
                <span>Activity & Alerts</span>
              </div>
              {unreadNotificationCount > 0 ? (
                <span className="px-2 py-0.5 text-[9px] font-black rounded-full bg-[#00FF66] text-black animate-pulse">
                  {unreadNotificationCount}
                </span>
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-700" />
              )}
            </button>

            <button
              onClick={() => handleSelectNavTab('chat')}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'chat'
                  ? 'bg-zinc-900/90 text-white border border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)] font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <MessageSquare className={`w-4 h-4 ${activeTab === 'chat' ? 'stroke-red-500' : 'stroke-current'}`} />
                <span>Direct Chat</span>
              </div>
              {unreadChatCount > 0 && (
                <span className="px-2 py-0.5 text-[9px] font-black rounded-full bg-red-600 text-white animate-bounce">
                  {unreadChatCount}
                </span>
              )}
            </button>

            <button
              onClick={() => handleSelectNavTab('games')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'games'
                  ? 'bg-zinc-900/90 text-[#00FF66] border border-[#00FF66]/30 shadow-[0_0_15px_rgba(0,255,102,0.15)] font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
              }`}
            >
              <Gamepad2 className={`w-4 h-4 ${activeTab === 'games' ? 'stroke-[#00FF66]' : 'stroke-current'}`} />
              <span>50 Mini-Games</span>
            </button>

            <button
              onClick={() => handleSelectNavTab('music')}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'music'
                  ? 'bg-zinc-900/90 text-[#00FF66] border border-[#00FF66]/30 shadow-[0_0_15px_rgba(0,255,102,0.15)] font-bold'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-900/40'
              }`}
            >
              <Music className={`w-4 h-4 ${activeTab === 'music' ? 'stroke-[#00FF66]' : 'stroke-current'}`} />
              <span>Music Hub</span>
            </button>

            <button
              onClick={() => setShowProfessionalDashboardModal(true)}
              className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-900/40 transition-all cursor-pointer"
            >
              <BarChart3 className="w-4 h-4 text-purple-400" />
              <span>Account Insights</span>
            </button>

            <button
              onClick={() => setShowCustomerSupportModal(true)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-xs font-bold text-white bg-gradient-to-r from-violet-900/50 via-indigo-900/50 to-cyan-900/40 border border-indigo-500/30 hover:border-cyan-400/60 shadow-lg shadow-indigo-500/10 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3.5">
                <Headphones className="w-4 h-4 text-cyan-400 group-hover:rotate-12 transition-transform" />
                <span className="bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">AI Customer Support</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-[#00FF66] animate-pulse" />
            </button>
          </nav>
        </div>

        {/* Profile Desk Widget */}
        <div className="bg-zinc-900/60 hover:bg-zinc-900/90 border border-white/5 p-3 rounded-2xl transition-all shadow-lg">
          <div className="flex items-center gap-3">
            <div
              onClick={() => setActiveTab('profile')}
              className="relative cursor-pointer"
            >
              <img
                src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                alt={currentUser.username}
                className="w-9 h-9 rounded-full object-cover ring-2 ring-red-500/60"
                referrerPolicy="no-referrer"
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-black" />
            </div>
            <div
              onClick={() => setActiveTab('profile')}
              className="min-w-0 flex-1 cursor-pointer"
            >
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-white truncate">{currentUser.displayName || currentUser.username}</span>
                {currentUser.isVerified ? <VerifiedBadge size="xs" /> : <CheckCircle2 className="w-3 h-3 text-red-500 shrink-0" />}
              </div>
              <span className="text-[10px] text-zinc-400 font-medium block truncate">@{currentUser.username}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
              title="Log Out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. Center View / Main App Screen Container */}
      <main className="relative w-full max-w-[480px] bg-black lg:rounded-[40px] lg:border lg:border-zinc-800/80 shadow-2xl flex flex-col min-h-screen lg:min-h-[92vh] pb-24 overflow-hidden shrink-0">
        {activeTab === 'feed' && (
          <FeedView
            currentUser={currentUser}
            posts={posts.filter((p) => !p.isArchived)}
            stories={stories}
            reels={reels}
            unreadNotificationCount={unreadNotificationCount}
            unreadChatCount={unreadChatCount}
            latestNotification={notifications.find((n) => !n.isRead) || notifications[0]}
            onToggleLike={handleToggleLike}
            onToggleSave={handleToggleSave}
            onToggleArchive={handleToggleArchive}
            onToggleComments={handleToggleComments}
            onToggleLikeCount={handleToggleLikeCount}
            onDeletePost={handleDeletePost}
            onOpenStoryViewer={(index) => setActiveStoryViewerIndex(index)}
            onOpenCreateStory={() => setShowCreateStoryModal(true)}
            onOpenStatusNoteModal={() => setShowStatusNoteModal(true)}
            onOpenNotifications={handleOpenNotifications}
            onNavigateToChat={() => {
              setUnreadChatCount(0);
              setActiveTab('chat');
            }}
            onRefreshFeed={loadInitialData}
            onNavigateToPost={handleNavigateToPost}
            onNavigateToReel={handleNavigateToReel}
          />
        )}

        {activeTab === 'explore' && (
          <ExploreView
            currentUser={currentUser}
            posts={posts.filter((p) => !p.isArchived)}
            reels={reels}
            onSelectPost={(post) => {
              handleNavigateToPost(post.id);
            }}
            onSelectReel={(reel) => {
              handleNavigateToReel(reel.id);
            }}
            onStartChat={(user) => {
              setActiveTab('chat');
            }}
            onNavigateToUserProfile={handleNavigateToUserProfile}
            onToggleFollowUser={handleToggleFollowUser}
          />
        )}

        {activeTab === 'reels' && (
          <div className="py-2 px-2">
            <ReelsView
              reels={reels}
              currentUser={currentUser}
              onNavigateToChat={() => setActiveTab('chat')}
              initialReelId={selectedReelId}
            />
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="py-2 px-2">
            <ChatView
              currentUser={currentUser}
              pendingChatUser={pendingChatUser}
              onPendingChatUserHandled={() => setPendingChatUser(null)}
              onPlayGame={(gameId, challengerUsername, roomCode) => {
                const matched = ALL_50_MINI_GAMES.find(
                  (g) => g.id === gameId || g.id.toLowerCase() === gameId.toLowerCase()
                );
                if (matched) {
                  setGameToPlay({
                    game: matched,
                    challenger: challengerUsername,
                    roomCode
                  });
                }
              }}
            />
          </div>
        )}

        {activeTab === 'games' && (
          <GamesView
            currentUser={currentUser}
            allUsers={registeredUsers}
            onUserUpdated={(u) => setCurrentUser(u)}
          />
        )}

        {activeTab === 'music' && (
          <MusicHubView currentUser={currentUser} />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            currentUser={currentUser}
            viewingUser={viewingProfileUser}
            allUsers={registeredUsers}
            posts={posts}
            reels={reels}
            onSelectPost={(post) => {
              handleNavigateToPost(post.id);
            }}
            onUpdateBio={handleUpdateBio}
            onOpenProfessionalDashboard={() => setShowProfessionalDashboardModal(true)}
            onLogout={handleLogout}
            onDeleteAllUsers={handleDeleteAllUsers}
            onUserUpdated={(u) => setCurrentUser(u)}
            onToggleFollowUser={handleToggleFollowUser}
            onBackToMyProfile={() => setViewingProfileUser(null)}
            onNavigateToChatWithUser={(targetUser) => {
              setPendingChatUser(targetUser);
              setActiveTab('chat');
            }}
          />
        )}
      </main>

      {/* 3. Right Desktop Sidebar (Registered People & Community) */}
      <aside className="hidden lg:flex flex-col w-[280px] h-[92vh] sticky top-6 space-y-6 shrink-0 select-none">
        {/* Community People Directory */}
        <div className="bg-zinc-900/40 p-5 rounded-[28px] border border-white/5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-3.5">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-red-500" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">NOOB Members</h3>
            </div>
            <button
              onClick={() => setActiveTab('explore')}
              className="text-[10px] font-semibold text-red-400 hover:underline cursor-pointer"
            >
              Explore all
            </button>
          </div>

          <div className="space-y-3.5">
            {otherUsers.length === 0 ? (
              <div className="text-center py-4 text-xs text-zinc-500">
                You are the first member! Invite friends to sign up.
              </div>
            ) : (
              otherUsers.slice(0, 5).map((user) => (
                <div key={user.id} className="flex items-center justify-between gap-2">
                  <div
                    onClick={() => handleNavigateToUserProfile(user)}
                    className="flex items-center gap-2.5 min-w-0 cursor-pointer group"
                    title={`View @${user.username}'s profile (ID: ${user.id})`}
                  >
                    <img
                      src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                      alt={user.username}
                      className="w-8 h-8 rounded-full object-cover ring-1 ring-white/10 group-hover:ring-red-500"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-xs font-bold text-white truncate block group-hover:text-red-400">
                          {user.displayName || user.username}
                        </span>
                        {user.isVerified && <VerifiedBadge size="xs" />}
                      </div>
                      <span className="text-[10px] text-zinc-500 truncate block">
                        @{user.username}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleFollowUser(user.id)}
                    className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
                      user.isFollowing
                        ? 'bg-zinc-800 text-zinc-300 hover:text-pink-400'
                        : user.isFollowRequested
                        ? 'bg-purple-950 text-purple-300 border border-purple-500/40'
                        : 'bg-gradient-to-r from-[#ff4e6a] to-[#ff758c] text-white hover:opacity-90 shadow-sm'
                    }`}
                  >
                    {user.isFollowing ? 'Following' : user.isFollowRequested ? 'Requested' : user.accountType === 'private' ? 'Request' : 'Follow'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Minimal Sophisticated Footer Links */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-zinc-500 text-[10px] px-2">
          <button onClick={() => setShowPrivacyModal(true)} className="hover:underline cursor-pointer">
            Privacy Policy
          </button>
          <span>•</span>
          <button onClick={() => setShowTermsModal(true)} className="hover:underline cursor-pointer">
            Terms & Conditions
          </button>
          <span>•</span>
          <span onClick={() => setActiveTab('explore')} className="hover:underline cursor-pointer">
            Explore People
          </span>
          <div className="w-full text-zinc-600 text-[9px] mt-1">
            © 2026 NOOB • Fun & Connecting People
          </div>
        </div>
      </aside>

      {/* Floating Glassmorphism Navigation Bar */}
      <FloatingNavBar
        activeTab={activeTab}
        onSelectTab={handleSelectNavTab}
        userAvatar={currentUser.avatar}
        unreadChatCount={unreadChatCount}
      />

      {/* Floating AI Customer Support Quick-Trigger Button (Bottom Right - hidden in Chat to prevent input overlap) */}
      {activeTab !== 'chat' && (
        <button
          onClick={() => setShowCustomerSupportModal(true)}
          className="fixed bottom-24 lg:bottom-8 right-4 sm:right-8 z-40 p-3.5 sm:px-4 sm:py-3 rounded-full bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-400 hover:scale-105 text-white font-black text-xs shadow-[0_0_25px_rgba(99,102,241,0.5)] border border-white/20 transition-all cursor-pointer flex items-center gap-2 group"
          title="Open NOOB AI Assistant"
        >
          <div className="relative">
            <Headphones className="w-5 h-5 text-white group-hover:rotate-12 transition-transform" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#00FF66] rounded-full ring-2 ring-black animate-pulse" />
          </div>
          <span className="hidden sm:inline font-bold tracking-wide">NOOB AI Support</span>
        </button>
      )}

      {/* --- MODALS --- */}
      {/* 0. AI Customer Support Modal */}
      {showCustomerSupportModal && (
        <CustomerSupportModal
          currentUser={currentUser}
          onClose={() => setShowCustomerSupportModal(false)}
          onOpenTerms={() => setShowTermsModal(true)}
          onOpenPrivacy={() => setShowPrivacyModal(true)}
        />
      )}

      {/* 1. Fullscreen Story Viewer */}
      {activeStoryViewerIndex !== null && stories[activeStoryViewerIndex] && (
        <StoryViewerModal
          stories={stories}
          initialIndex={activeStoryViewerIndex}
          onClose={() => setActiveStoryViewerIndex(null)}
          currentUser={currentUser}
          onAddComment={handleAddStoryComment}
        />
      )}

      {/* 2. Story Creation Modal */}
      {showCreateStoryModal && (
        <CreateStoryModal
          onClose={() => setShowCreateStoryModal(false)}
          onSubmitStory={handleCreateStory}
        />
      )}

      {/* 3. Post & Carousel Creation Modal */}
      {showPostCreationModal && (
        <PostCreationModal
          currentUser={currentUser}
          allUsers={registeredUsers}
          onClose={() => setShowPostCreationModal(false)}
          onSubmitPost={handleCreatePostOrReel}
        />
      )}

      {/* 4. Professional Dashboard Modal */}
      {showProfessionalDashboardModal && (
        <ProfessionalDashboardModal
          currentUser={currentUser}
          onClose={() => setShowProfessionalDashboardModal(false)}
          onUserUpdated={(u) => setCurrentUser(u)}
        />
      )}

      {/* 6. Notifications & Following Activity Modal */}
      {showNotificationsModal && (
        <NotificationsModal
          notifications={notifications}
          notificationSettings={notificationSettings}
          onUpdateSettings={setNotificationSettings}
          onAcceptFollowRequest={handleAcceptFollowRequest}
          onDeclineFollowRequest={handleDeclineFollowRequest}
          onSimulateNotification={handleSimulateNotification}
          onClose={() => setShowNotificationsModal(false)}
        />
      )}

      {/* 7. Status Note & Music Snippet Modal */}
      {showStatusNoteModal && (
        <StatusNoteModal
          currentUser={currentUser}
          onClose={() => setShowStatusNoteModal(false)}
          onSaveNote={handleUpdateStatusNote}
        />
      )}

      {/* 8. Legal Modals */}
      {showTermsModal && (
        <TermsAndConditions onClose={() => setShowTermsModal(false)} />
      )}
      {showPrivacyModal && (
        <PrivacyPolicy onClose={() => setShowPrivacyModal(false)} />
      )}

      {/* 9. Direct 1v1 Game Play Modal */}
      {gameToPlay && (
        <GamePlayModal
          game={gameToPlay.game}
          currentUser={currentUser}
          allUsers={registeredUsers}
          initialChallenger={gameToPlay.challenger}
          initialRoomCode={gameToPlay.roomCode}
          onClose={() => setGameToPlay(null)}
          onPointsUpdated={(pointsEarned) => {
            setCurrentUser((prev) =>
              prev ? { ...prev, noobPoints: (prev.noobPoints || 0) + pointsEarned } : prev
            );
          }}
        />
      )}
    </div>
  );
}

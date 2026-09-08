import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Pin,
  MoreVertical,
  Phone,
  Video,
  Send,
  Mic,
  Image,
  Sparkles,
  Globe,
  Edit2,
  Trash2,
  Clock,
  Music,
  ShieldCheck,
  Flame,
  Check,
  CheckCheck,
  Palette,
  ScreenShare,
  X,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Gamepad2,
  Users,
  Plus,
  RefreshCw,
  UserPlus,
  Star,
  PowerOff,
  ShieldAlert,
  AlertTriangle,
  Heart,
  Bot,
  UserX,
  UserCheck,
  Shield,
  Crown,
  Settings,
  Info,
  Lock,
  MessageCircle,
  SquarePen,
  Filter,
  Smile
} from 'lucide-react';
import { ChatConversation, Message, User } from '../../types';

const EMOJI_CATEGORIES = [
  {
    title: 'Reactions & Hype',
    emojis: ['🔥', '😂', '❤️', '😍', '👏', '🎉', '💯', '✨', '⚡', '😎', '🙌', '💀']
  },
  {
    title: 'Gaming & Victory',
    emojis: ['🎮', '🕹️', '👑', '🏆', '👾', '🎯', '🥇', '⚔️', '🛡️', '🎲', '🚀', '💣']
  },
  {
    title: 'Faces & Mood',
    emojis: ['😀', '🤣', '🤩', '🥳', '🤔', '👀', '🤙', '💪', '🤝', '✌️', '🫡', '🤯']
  }
];

const CURATED_GIFS = [
  { id: 'g1', title: 'Victory Dance', url: 'https://i.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif' },
  { id: 'g2', title: 'GG Game Over', url: 'https://i.giphy.com/media/l41JGlWa1xOjJSsV2/giphy.gif' },
  { id: 'g3', title: 'Mind Blown', url: 'https://i.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif' },
  { id: 'g4', title: 'High Five', url: 'https://i.giphy.com/media/3oEjHV0z8S7WM4MwnK/giphy.gif' },
  { id: 'g5', title: 'Popcorn Time', url: 'https://i.giphy.com/media/gl0mkIZOW6Nwc/giphy.gif' },
  { id: 'g6', title: 'Celebration Cheers', url: 'https://i.giphy.com/media/BPJmthQ3YRwD6QqcVD/giphy.gif' }
];

const CURATED_STICKERS = [
  { id: 's1', label: 'NOOB Crown', emoji: '👑' },
  { id: 's2', label: 'Super Fire', emoji: '🔥' },
  { id: 's3', label: 'Pro Gamer', emoji: '🎮' },
  { id: 's4', label: 'Diamond', emoji: '💎' },
  { id: 's5', label: '100 Point', emoji: '💯' },
  { id: 's6', label: 'Rocket Win', emoji: '🚀' },
  { id: 's7', label: 'Bullseye', emoji: '🎯' },
  { id: 's8', label: 'Champion', emoji: '⭐' }
];
import {
  fetchChats,
  fetchMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  translateMessage,
  updateChatSettings,
  fetchUsers
} from '../../services/api';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { CreateGroupModal } from './CreateGroupModal';
import { GroupDetailsModal } from './GroupDetailsModal';
import { safeJsonStringify } from '../../utils/safeJson';
import confetti from 'canvas-confetti';

interface ChatViewProps {
  currentUser: User;
  onPlayGame?: (gameId: string, challengerUsername: string, roomCode?: string) => void;
  pendingChatUser?: User | null;
  onPendingChatUserHandled?: () => void;
}

type FilterTab = 'all' | 'unread' | 'favourites' | 'groups';

const THEME_COLORS = [
  { name: 'Neon Emerald', hex: '#00FF66' },
  { name: 'Cyber Cyan', hex: '#00E5FF' },
  { name: 'Electric Purple', hex: '#D946EF' },
  { name: 'Sunset Coral', hex: '#FF6B6B' }
];

export const ChatView: React.FC<ChatViewProps> = ({ currentUser, onPlayGame, pendingChatUser, onPendingChatUserHandled }) => {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [activeFilterTab, setActiveFilterTab] = useState<FilterTab>('all');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showGroupDetails, setShowGroupDetails] = useState(false);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [chatBlockedNotice, setChatBlockedNotice] = useState('');
  const [isEditingMessageId, setIsEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');
  const [globalChatTheme, setGlobalChatTheme] = useState<string>(() => {
    return localStorage.getItem('noob_chat_theme') || '#00FF66';
  });
  const [showLeftMenu, setShowLeftMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activePickerTab, setActivePickerTab] = useState<'emojis' | 'gifs' | 'stickers'>('emojis');
  const [scheduledTime, setScheduledTime] = useState('');
  const [showChatActionsMenu, setShowChatActionsMenu] = useState(false);
  
  // Mobile responsive view: on small screens, showList vs showChat
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeChatIdRef = useRef<string | null>(activeChatId);
  const chatActionsMenuRef = useRef<HTMLDivElement>(null);
  const leftMenuRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    if (!chatBlockedNotice) return;
    const timer = setTimeout(() => setChatBlockedNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [chatBlockedNotice]);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (chatActionsMenuRef.current && !chatActionsMenuRef.current.contains(e.target as Node)) {
        setShowChatActionsMenu(false);
      }
      if (leftMenuRef.current && !leftMenuRef.current.contains(e.target as Node)) {
        setShowLeftMenu(false);
      }
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Local Storage persistence cache key
  const CACHE_KEY_CHATS = `noob_chats_cache_${currentUser.id}`;
  const CACHE_KEY_MSGS = `noob_msgs_cache_${currentUser.id}`;

  // Initial load
  useEffect(() => {
    // 1. Instant optimistic restore from local persistence
    try {
      const cachedChats = localStorage.getItem(CACHE_KEY_CHATS);
      if (cachedChats) {
        const parsed = JSON.parse(cachedChats);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConversations(parsed);
          if (!activeChatIdRef.current) {
            setActiveChatId(parsed[0].id);
          }
        }
      }
    } catch (e) {
      // Ignore cache parse error
    }

    loadChats();
    loadAllUsers();

    // Cross-device real-time synchronization polling (every 2s for super fast message delivery)
    const interval = setInterval(() => {
      syncLiveChatData();
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeChatId) {
      loadMessages(activeChatId);
      setInChatSearchQuery('');
      setShowInChatSearch(false);
      setShowChatActionsMenu(false);
    }
  }, [activeChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadChats = async () => {
    try {
      const data = await fetchChats();
      // Ensure Chat Page is exclusively for genuine user-to-user peer messaging & groups
      const realChats = (data || []).filter(
        (c: any) =>
          !c.isAi &&
          c.id !== 'c_ai_assistant' &&
          !c.participants?.some((p: any) => p.isAi || p.username === 'noob_ai')
      );
      setConversations(realChats);
      localStorage.setItem(CACHE_KEY_CHATS, safeJsonStringify(realChats));

      if (realChats.length > 0 && !activeChatIdRef.current) {
        setActiveChatId(realChats[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadAllUsers = async () => {
    try {
      const users = await fetchUsers();
      setAllUsers(users);
    } catch (err) {
      console.error(err);
    }
  };

  // Fast live sync across all tabs & devices
  const syncLiveChatData = async () => {
    try {
      const data = await fetchChats();
      const realChats = (data || []).filter(
        (c: any) =>
          !c.isAi &&
          c.id !== 'c_ai_assistant' &&
          !c.participants?.some((p: any) => p.isAi || p.username === 'noob_ai')
      );
      setConversations(realChats);
      localStorage.setItem(CACHE_KEY_CHATS, safeJsonStringify(realChats));

      const currentActiveId = activeChatIdRef.current;
      if (currentActiveId) {
        const latestMsgs = await fetchMessages(currentActiveId);
        setMessages((prev) => {
          if (
            latestMsgs.length !== prev.length ||
            (latestMsgs.length > 0 && latestMsgs[latestMsgs.length - 1].id !== prev[prev.length - 1]?.id)
          ) {
            return latestMsgs;
          }
          return prev;
        });
      }
    } catch (err) {
      // Background sync silent catch
    }
  };

  const loadMessages = async (chatId: string) => {
    try {
      // Check cache first for instant opening
      try {
        const cached = localStorage.getItem(`${CACHE_KEY_MSGS}_${chatId}`);
        if (cached) {
          setMessages(JSON.parse(cached));
        }
      } catch (e) {}

      const data = await fetchMessages(chatId);
      setMessages(data);
      localStorage.setItem(`${CACHE_KEY_MSGS}_${chatId}`, safeJsonStringify(data));
    } catch (err) {
      console.error(err);
    }
  };

  // Helper: check if a user is a Friend (Follows currentUser OR CurrentUser follows them)
  const isUserFriend = (u: User) => {
    if (u.id === currentUser.id || u.isAi) return false;
    const isFollowing = u.isFollowing || currentUser.followingIds?.includes(u.id);
    const isFollower = u.followingIds?.includes(currentUser.id);
    return !!(isFollowing || isFollower);
  };

  // Same eligibility rule used everywhere a chat can be started: a real
  // follow relationship in either direction, or (while the community is
  // tiny) anyone at all, so a fresh install with a couple of users isn't a
  // dead end.
  const canStartChatWith = (u: User) =>
    isUserFriend(u) || (allUsers.length <= 4 && u.id !== currentUser.id && !u.isAi);

  const handleStartChatWithUser = (user: User) => {
    // Private chats are limited to users with a follow relationship in
    // either direction (matches the "Connected Friends" list rules).
    if (!canStartChatWith(user)) {
      setChatBlockedNotice(`You can only message @${user.username} if you follow them or they follow you.`);
      return;
    }
    setChatBlockedNotice('');
    // Check if chat already exists
    const existing = conversations.find(
      (c) => !c.isGroup && c.participants.some((p) => p.id === user.id)
    );
    if (existing) {
      setActiveChatId(existing.id);
      setMobileView('chat');
      setSearchQuery('');
    } else {
      const newChat: ChatConversation = {
        id: `c_${Date.now()}`,
        participants: [user, currentUser],
        isGroup: false,
        unreadCount: 0,
        isPinned: false,
        isMuted: false,
        themeColor: '#00FF66',
        vanishMode: false,
        readReceiptsEnabled: true,
        createdAt: 'Just now',
        lastMessage: {
          id: `m_${Date.now()}`,
          chatId: `c_${Date.now()}`,
          senderId: currentUser.id,
          text: `👋 Started a direct chat with friend @${user.username}`,
          createdAt: 'Just now',
          status: 'read'
        }
      };
      const updated = [newChat, ...conversations];
      setConversations(updated);
      localStorage.setItem(CACHE_KEY_CHATS, safeJsonStringify(updated));
      setActiveChatId(newChat.id);
      setMobileView('chat');
      setSearchQuery('');
    }
  };

  // Opens a chat with a user handed off from elsewhere in the app (e.g. the
  // "Message" button on a profile), once the friends list has loaded.
  useEffect(() => {
    if (pendingChatUser && allUsers.length > 0) {
      handleStartChatWithUser(pendingChatUser);
      onPendingChatUserHandled?.();
    }
  }, [pendingChatUser, allUsers]);

  const handleTogglePin = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/chats/${chatId}/pin`, {
        method: 'POST',
        headers: { 'x-user-id': currentUser.id }
      });
      const data = await res.json();
      if (data.success) {
        setConversations(
          conversations.map((c) => (c.id === chatId ? { ...c, isPinned: data.isPinned } : c))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const activeChat = conversations.find((c) => c.id === activeChatId) || conversations[0];

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChat) return;

    const textToSend = inputText.trim();
    setInputText('');
    setScheduledTime('');

    // Ultra-fast instant optimistic message with delivered state
    const optimisticMsg: Message = {
      id: `temp_${Date.now()}`,
      chatId: activeChat.id,
      senderId: currentUser.id || 'u_me',
      senderUsername: currentUser.username,
      senderDisplayName: currentUser.displayName,
      senderAvatar: currentUser.avatar,
      text: textToSend,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isEdited: false,
      status: 'delivered',
      scheduledAt: scheduledTime || undefined
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const response = await sendMessage(activeChat.id, {
        senderId: currentUser.id,
        senderUsername: currentUser.username,
        senderDisplayName: currentUser.displayName,
        senderAvatar: currentUser.avatar,
        text: textToSend,
        scheduledAt: scheduledTime || undefined
      });

      // Replace optimistic message with saved server response
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === optimisticMsg.id ? { ...response, status: 'delivered' } : m));
        localStorage.setItem(`${CACHE_KEY_MSGS}_${activeChat.id}`, safeJsonStringify(next));
        return next;
      });

      // Sync conversation list last message
      setConversations((prev) => {
        const next = prev.map((c) =>
          c.id === activeChat.id
            ? { ...c, lastMessage: { ...response, status: 'delivered' } }
            : c
        );
        localStorage.setItem(CACHE_KEY_CHATS, safeJsonStringify(next));
        return next;
      });

      // Rapidly mark double tick as read
      setTimeout(() => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === response.id || m.id === optimisticMsg.id
              ? { ...m, status: 'read', isViewed: true }
              : m
          )
        );
      }, 500);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendGif = async (gifUrl: string) => {
    if (!activeChat) return;
    setShowEmojiPicker(false);
    const optimisticMsg: Message = {
      id: `temp_${Date.now()}`,
      chatId: activeChat.id,
      senderId: currentUser.id,
      senderUsername: currentUser.username,
      senderDisplayName: currentUser.displayName,
      senderAvatar: currentUser.avatar,
      text: '',
      mediaUrl: gifUrl,
      mediaType: 'image',
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isEdited: false,
      status: 'delivered'
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    try {
      const response = await sendMessage(activeChat.id, {
        senderId: currentUser.id,
        senderUsername: currentUser.username,
        senderDisplayName: currentUser.displayName,
        senderAvatar: currentUser.avatar,
        text: '',
        mediaUrl: gifUrl,
        mediaType: 'image'
      });
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === optimisticMsg.id
            ? { ...response, mediaUrl: response?.mediaUrl || gifUrl, mediaType: 'image', status: 'delivered' }
            : m
        );
        localStorage.setItem(`${CACHE_KEY_MSGS}_${activeChat.id}`, safeJsonStringify(next));
        return next;
      });
      setConversations((prev) => {
        const next = prev.map((c) =>
          c.id === activeChat.id
            ? {
                ...c,
                lastMessage: {
                  ...response,
                  mediaUrl: response?.mediaUrl || gifUrl,
                  status: 'delivered',
                  text: '📷 GIF'
                }
              }
            : c
        );
        localStorage.setItem(CACHE_KEY_CHATS, safeJsonStringify(next));
        return next;
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendSticker = async (stickerEmoji: string, label: string) => {
    if (!activeChat) return;
    setShowEmojiPicker(false);
    const optimisticMsg: Message = {
      id: `temp_${Date.now()}`,
      chatId: activeChat.id,
      senderId: currentUser.id,
      senderUsername: currentUser.username,
      senderDisplayName: currentUser.displayName,
      senderAvatar: currentUser.avatar,
      text: `${stickerEmoji} ${label}`,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isEdited: false,
      status: 'delivered'
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    try {
      const response = await sendMessage(activeChat.id, {
        senderId: currentUser.id,
        senderUsername: currentUser.username,
        senderDisplayName: currentUser.displayName,
        senderAvatar: currentUser.avatar,
        text: `${stickerEmoji} ${label}`
      });
      setMessages((prev) => {
        const next = prev.map((m) => (m.id === optimisticMsg.id ? { ...response, status: 'delivered' } : m));
        localStorage.setItem(`${CACHE_KEY_MSGS}_${activeChat.id}`, safeJsonStringify(next));
        return next;
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    setInputText((prev) => prev + emoji);
  };

  const handleTranslate = async (msgId: string) => {
    if (!activeChat) return;
    try {
      const translated = await translateMessage(activeChat.id, msgId);
      setMessages(
        messages.map((m) => (m.id === msgId ? { ...m, translatedText: translated } : m))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveEdit = async (msgId: string) => {
    if (!activeChat || !editingText.trim()) return;
    try {
      const updated = await editMessage(activeChat.id, msgId, editingText.trim());
      setMessages(messages.map((m) => (m.id === msgId ? updated : m)));
      setIsEditingMessageId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMsg = async (msgId: string) => {
    if (!activeChat) return;
    try {
      await deleteMessage(activeChat.id, msgId);
      setMessages(messages.filter((m) => m.id !== msgId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateTheme = async (hex: string) => {
    setGlobalChatTheme(hex);
    localStorage.setItem('noob_chat_theme', hex);

    const updated = conversations.map((c) =>
      !activeChat || c.id === activeChat.id ? { ...c, themeColor: hex } : c
    );
    setConversations(updated);
    localStorage.setItem(CACHE_KEY_CHATS, safeJsonStringify(updated));

    if (activeChat) {
      try {
        await updateChatSettings(activeChat.id, { themeColor: hex });
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleToggleVanishMode = async () => {
    if (!activeChat) return;
    const newVanish = !activeChat.vanishMode;
    await updateChatSettings(activeChat.id, { vanishMode: newVanish });
    setConversations(
      conversations.map((c) => (c.id === activeChat.id ? { ...c, vanishMode: newVanish } : c))
    );
  };

  // Filter Friends: all users who follow me OR whom I follow
  const myFriends = allUsers.filter((u) => canStartChatWith(u));

  // Synthesize contacts for friends who don't have an active conversation yet
  const friendsWithoutConversation = myFriends.filter(
    (friend) => !conversations.some((c) => !c.isGroup && c.participants.some((p) => p.id === friend.id))
  );

  // Unified items list:
  // 1. Group chats (isGroup: true) - includes default lounge & custom groups
  // 2. Direct conversations with friends
  const visibleConversations = conversations.filter((c) => {
    if (c.isGroup) return true;
    const partner = c.participants.find((p) => p.id !== currentUser.id);
    if (!partner) return true;
    return isUserFriend(partner) || myFriends.some((f) => f.id === partner.id);
  });

  // Sort: Global lounge & Pinned chats first
  const sortedConversations = [...visibleConversations].sort((a, b) => {
    if (a.isGlobalDefault && !b.isGlobalDefault) return -1;
    if (!a.isGlobalDefault && b.isGlobalDefault) return 1;
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  // Apply Filter Tab: 'all' | 'unread' | 'favourites' | 'groups'
  const filteredByTab = sortedConversations.filter((c) => {
    if (activeFilterTab === 'unread') return (c.unreadCount || 0) > 0;
    if (activeFilterTab === 'favourites') return c.isPinned;
    if (activeFilterTab === 'groups') return c.isGroup;
    return true;
  });

  const queryClean = searchQuery.toLowerCase().trim();

  const finalFilteredConversations = filteredByTab.filter((c) => {
    if (!queryClean) return true;
    const name = c.isGroup
      ? c.name || 'Group Chat'
      : c.customNickname || c.participants[0]?.displayName || c.participants[0]?.username || '';
    const username = c.participants[0]?.username || '';
    const lastMsgText = c.lastMessage?.text || '';
    return (
      name.toLowerCase().includes(queryClean) ||
      username.toLowerCase().includes(queryClean) ||
      lastMsgText.toLowerCase().includes(queryClean)
    );
  });

  const filteredFriendsWithoutChat =
    activeFilterTab === 'groups'
      ? []
      : friendsWithoutConversation.filter((f) => {
          if (!queryClean) return true;
          return (
            f.username.toLowerCase().includes(queryClean) ||
            (f.displayName && f.displayName.toLowerCase().includes(queryClean))
          );
        });

  // Filter in-chat messages if in-chat search query is active
  const filteredMessages = inChatSearchQuery.trim()
    ? messages.filter((m) =>
        (m.text || '').toLowerCase().includes(inChatSearchQuery.toLowerCase().trim())
      )
    : messages;

  return (
    <div
      id="chat-view-container"
      className="relative w-full max-w-6xl mx-auto h-[calc(100vh-80px)] min-h-[580px] max-h-[880px] bg-zinc-950 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col mb-16 sm:mb-0"
    >
      {chatBlockedNotice && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-2xl bg-zinc-900 border border-rose-500/40 text-rose-300 text-xs font-semibold shadow-2xl max-w-[90%] text-center">
          {chatBlockedNotice}
        </div>
      )}

      {/* WhatsApp/Signal Style Main Container */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* LEFT COLUMN: WhatsApp-style Chats List (Matching Screenshot) */}
        <aside
          className={`w-full md:w-80 lg:w-96 shrink-0 bg-zinc-950 border-r border-zinc-800/80 flex flex-col z-20 ${
            mobileView === 'chat' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Top Bar matching screenshot */}
          <div className="p-3.5 pb-2 border-b border-zinc-900 flex items-center justify-between">
            <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
              Chats
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#00FF66]/15 text-[#00FF66] border border-[#00FF66]/30">
                {visibleConversations.length + friendsWithoutConversation.length}
              </span>
            </h1>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowCreateGroup(true)}
                className="p-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shadow-sm"
                title="Create New Group"
              >
                <Plus className="w-4 h-4 text-[#00FF66]" />
                <span className="text-xs font-bold hidden sm:inline">New Group</span>
              </button>

              <button
                onClick={() => setShowNewChatModal(true)}
                className="p-2 hover:bg-zinc-800 text-zinc-300 hover:text-white rounded-xl transition-colors cursor-pointer"
                title="Start a New Direct Chat"
              >
                <SquarePen className="w-4 h-4" />
              </button>

              <div className="relative" ref={leftMenuRef}>
                <button
                  onClick={() => setShowLeftMenu(!showLeftMenu)}
                  className={`p-2 rounded-xl transition-colors cursor-pointer ${
                    showLeftMenu
                      ? 'bg-zinc-800 text-white'
                      : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                  title="Chat Options"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showLeftMenu && (
                  <div className="absolute right-0 top-full mt-1.5 w-52 bg-zinc-950 border border-zinc-800 rounded-2xl p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl">
                    <button
                      onClick={() => {
                        setShowLeftMenu(false);
                        setShowCreateGroup(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl hover:bg-zinc-900 flex items-center gap-2.5 text-left text-xs font-semibold text-zinc-200 hover:text-white transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4 text-[#00FF66]" /> New Group Chat
                    </button>
                    <button
                      onClick={() => {
                        setShowLeftMenu(false);
                        setShowSettingsModal(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl hover:bg-zinc-900 flex items-center gap-2.5 text-left text-xs font-semibold text-zinc-200 hover:text-white transition-colors cursor-pointer"
                    >
                      <Palette className="w-4 h-4 text-emerald-400" /> Chat Bubble Theme
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Search Bar matching screenshot ("Search or start a new chat") */}
          <div className="px-3 py-2 border-b border-zinc-900">
            <div className="flex items-center bg-zinc-900/90 border border-zinc-800/80 rounded-xl px-3 py-2 focus-within:border-[#00FF66] transition-colors relative">
              <Search className="w-4 h-4 text-zinc-400 mr-2.5 shrink-0" />
              <input
                type="text"
                placeholder="Search or start a new chat"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none pr-5"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 text-zinc-400 hover:text-white"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Filter Chips matching screenshot (All, Unread, Favourites, Groups) */}
          <div className="px-3 py-2 border-b border-zinc-900/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'unread', label: 'Unread' },
                { id: 'favourites', label: 'Favourites' },
                { id: 'groups', label: 'Groups' }
              ] as const
            ).map((tab) => {
              const isActive = activeFilterTab === tab.id;
              const count =
                tab.id === 'unread'
                  ? visibleConversations.filter((c) => (c.unreadCount || 0) > 0).length
                  : tab.id === 'favourites'
                  ? visibleConversations.filter((c) => c.isPinned).length
                  : tab.id === 'groups'
                  ? visibleConversations.filter((c) => c.isGroup).length
                  : visibleConversations.length;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveFilterTab(tab.id)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1 cursor-pointer ${
                    isActive
                      ? 'bg-[#00FF66]/20 text-[#00FF66] border border-[#00FF66]/40 font-bold shadow-[0_0_10px_rgba(0,255,102,0.15)]'
                      : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800/80'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.id !== 'all' && count > 0 && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        isActive ? 'bg-[#00FF66] text-black' : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Chat List Rows */}
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-900/60 no-scrollbar">
            {finalFilteredConversations.length === 0 && filteredFriendsWithoutChat.length === 0 && (
              <div className="p-8 text-center text-zinc-500 text-xs space-y-2">
                <MessageCircle className="w-8 h-8 text-zinc-600 mx-auto opacity-50" />
                <p>No conversations found</p>
              </div>
            )}

            {/* Active & Pinned Chats with explicit 'chat' and 'group' tags */}
            {finalFilteredConversations.map((c) => {
              const partner =
                c.participants.find((p) => p.id !== currentUser.id) ||
                c.participants[0] ||
                currentUser;
              const displayName = c.isGroup
                ? c.name || 'Group Chat'
                : c.customNickname || partner.displayName || partner.username;
              const isSelected = activeChat?.id === c.id;
              const lastMsg = c.lastMessage;
              const isMine = lastMsg?.senderId === currentUser.id || lastMsg?.senderId === 'u_me';

              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setActiveChatId(c.id);
                    setMobileView('chat');
                  }}
                  className={`p-3.5 flex items-center gap-3 cursor-pointer transition-colors group relative ${
                    isSelected
                      ? 'bg-zinc-900/95 border-l-3 border-[#00FF66]'
                      : 'hover:bg-zinc-900/50'
                  }`}
                >
                  {/* Left Avatar */}
                  <div className="relative shrink-0">
                    {c.isGroup ? (
                      <div className="relative">
                        <img
                          src={
                            c.avatar ||
                            'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=400&auto=format&fit=crop&q=80'
                          }
                          alt=""
                          className="w-12 h-12 rounded-full object-cover ring-1 ring-purple-500/50"
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 px-1 py-0.2 rounded bg-purple-600 text-white text-[7px] font-black uppercase tracking-tight shadow">
                          group
                        </span>
                      </div>
                    ) : (
                      <div className="relative">
                        <img
                          src={
                            partner.avatar ||
                            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
                          }
                          alt=""
                          className="w-12 h-12 rounded-full object-cover ring-1 ring-zinc-700"
                        />
                        <span className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-[#00FF66] border-2 border-black rounded-full" />
                      </div>
                    )}
                  </div>

                  {/* Middle & Right Content */}
                  <div className="flex-1 min-w-0">
                    {/* Header: Title + Tag ('group' or 'chat') + Time */}
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-bold text-white truncate group-hover:text-[#00FF66] transition-colors">
                          {displayName}
                        </span>

                        {/* Explicit Tags: "group" or "chat" */}
                        {c.isGroup ? (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold uppercase border border-purple-500/30 shrink-0">
                            group
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-[#00FF66] font-bold uppercase border border-[#00FF66]/30 shrink-0">
                            chat
                          </span>
                        )}

                        {!c.isGroup && partner.isVerified && <VerifiedBadge size="xs" />}
                      </div>

                      <span className="text-[11px] text-zinc-500 shrink-0 font-medium">
                        {c.lastMessage?.createdAt || 'Active'}
                      </span>
                    </div>

                    {/* Subtitle: Delivery status + Snippet + Unread badge */}
                    <div className="flex items-center justify-between mt-1 gap-2">
                      <div className="flex items-center text-xs text-zinc-400 truncate min-w-0">
                        {isMine && (
                          <span className="inline-flex items-center mr-1 shrink-0">
                            {lastMsg?.status === 'delivered' ? (
                              <CheckCheck className="w-3.5 h-3.5 text-zinc-400" title="Delivered" />
                            ) : (
                              <CheckCheck
                                className="w-3.5 h-3.5 text-[#00E5FF] drop-shadow-[0_0_4px_rgba(0,229,255,0.7)]"
                                title="Read"
                              />
                            )}
                          </span>
                        )}
                        <span className="truncate">
                          {lastMsg?.text || (c.isGroup ? 'Group channel active' : 'Chat started')}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.isPinned && (
                          <Pin className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                        )}
                        {c.unreadCount && c.unreadCount > 0 ? (
                          <span className="w-5 h-5 rounded-full bg-[#00FF66] text-black text-[10px] font-black flex items-center justify-center shadow-sm">
                            {c.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Direct Friends who don't have a chat thread yet */}
            {filteredFriendsWithoutChat.length > 0 && (
              <div className="p-3 bg-zinc-950/90 border-t border-zinc-900 space-y-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 px-1">
                  <UserCheck className="w-3.5 h-3.5 text-[#00FF66]" /> Connected Friends (
                  {filteredFriendsWithoutChat.length})
                </span>
                <div className="space-y-1">
                  {filteredFriendsWithoutChat.map((friend) => (
                    <div
                      key={friend.id}
                      onClick={() => handleStartChatWithUser(friend)}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/70 hover:bg-zinc-800/80 border border-zinc-800/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={friend.avatar}
                          alt={friend.username}
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                        />
                        <div className="truncate">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white truncate">
                              {friend.displayName || friend.username}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-[#00FF66] font-bold uppercase border border-[#00FF66]/30 shrink-0">
                              chat
                            </span>
                            {friend.isVerified && <VerifiedBadge size="xs" />}
                          </div>
                          <span className="text-[10px] text-zinc-400 truncate block font-medium">
                            @{friend.username} • Friend
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="px-2.5 py-1 bg-[#00FF66] text-black font-bold text-xs rounded-lg transition-colors shrink-0 shadow-sm"
                      >
                        Chat
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Security Note */}
          <div className="p-2.5 bg-zinc-950 border-t border-zinc-900 text-center flex items-center justify-center gap-1.5 text-[10px] text-zinc-500 font-medium">
            <Lock className="w-3 h-3 text-[#00FF66]" />
            <span>Your personal messages are end-to-end encrypted</span>
          </div>
        </aside>

        {/* RIGHT COLUMN: Active Conversation View */}
        <section
          className={`flex-1 flex flex-col bg-zinc-950 relative min-w-0 ${
            mobileView === 'list' ? 'hidden md:flex' : 'flex'
          }`}
          style={{
            background: activeChat?.vanishMode
              ? 'radial-gradient(circle at 50% 50%, #170b22 0%, #09090b 100%)'
              : undefined
          }}
        >
          {/* Active Chat Header */}
          <div className="px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/90 backdrop-blur-md flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {/* Back to list on mobile */}
              <button
                onClick={() => setMobileView('list')}
                className="p-1.5 hover:bg-zinc-800 text-zinc-300 rounded-lg md:hidden cursor-pointer mr-1"
                title="Back to chats"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div
                className="flex items-center gap-3 min-w-0 cursor-pointer group"
                onClick={() => {
                  if (activeChat?.isGroup) {
                    setShowGroupDetails(true);
                  }
                }}
                title={activeChat?.isGroup ? 'Click to view group details & members' : undefined}
              >
                <div className="relative shrink-0">
                  {activeChat?.isGroup ? (
                    <div className="relative">
                      <img
                        src={
                          activeChat.avatar ||
                          'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=400&auto=format&fit=crop&q=80'
                        }
                        alt=""
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-purple-500/60 group-hover:scale-105 transition-transform"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 px-1 py-0.2 rounded bg-purple-600 text-white text-[7px] font-black uppercase">
                        group
                      </span>
                    </div>
                  ) : (
                    <div className="relative">
                      <img
                        src={
                          activeChat?.participants.find((p) => p.id !== currentUser.id)?.avatar ||
                          currentUser.avatar ||
                          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
                        }
                        alt=""
                        className="w-10 h-10 rounded-full object-cover ring-1 ring-[#00FF66]"
                      />
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#00FF66] rounded-full border border-black" />
                    </div>
                  )}
                </div>

                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-bold text-white truncate group-hover:text-[#00FF66] transition-colors">
                      {activeChat?.isGroup
                        ? activeChat.name || 'Group Chat'
                        : activeChat?.customNickname ||
                          activeChat?.participants.find((p) => p.id !== currentUser.id)?.displayName ||
                          'Active Chat'}
                    </h3>

                    {activeChat?.isGroup ? (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold uppercase border border-purple-500/30">
                        group
                      </span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-[#00FF66] font-bold uppercase border border-[#00FF66]/30">
                        chat
                      </span>
                    )}

                    {!activeChat?.isGroup &&
                      activeChat?.participants.find((p) => p.id !== currentUser.id)?.isVerified && (
                        <VerifiedBadge size="xs" />
                      )}
                  </div>

                  <div className="text-[11px] text-zinc-400 flex items-center gap-2">
                    {activeChat?.isGroup ? (
                      <span className="text-purple-300 font-medium flex items-center gap-1">
                        <Users className="w-3 h-3" /> {activeChat.participants.length} members • Tap for
                        Info
                      </span>
                    ) : (
                      <span className="text-[#00FF66] font-medium flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        {activeChat?.vanishMode ? 'Vanish Mode On' : 'End-to-End Encrypted'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Top Right Actions: Clean 3-Dot Dropdown Menu */}
            <div className="flex items-center gap-1.5 text-zinc-300 shrink-0 relative" ref={chatActionsMenuRef}>
              {/* Three Dots More Actions Button */}
              <button
                onClick={() => setShowChatActionsMenu(!showChatActionsMenu)}
                className={`p-2 rounded-xl transition-all cursor-pointer ${
                  showChatActionsMenu
                    ? 'bg-[#00FF66] text-black shadow-[0_0_12px_rgba(0,255,102,0.3)]'
                    : 'hover:bg-zinc-800 text-zinc-300 hover:text-white bg-zinc-900/80 border border-zinc-800'
                }`}
                title="Chat actions and options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* Three Dots Dropdown Menu */}
              {showChatActionsMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-black/40"
                    onClick={() => setShowChatActionsMenu(false)}
                  />
                  <div className="absolute right-0 top-full mt-2 w-60 bg-zinc-950 border border-zinc-700/80 rounded-2xl p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl divide-y divide-zinc-900 force-dark">
                  <div className="p-1 space-y-0.5">
                    {/* Option: Group Info (if group) */}
                    {activeChat?.isGroup && (
                      <button
                        onClick={() => {
                          setShowChatActionsMenu(false);
                          setShowGroupDetails(true);
                        }}
                        className="w-full px-3 py-2 rounded-xl hover:bg-zinc-900 flex items-center justify-between text-left text-xs font-semibold text-zinc-200 hover:text-white transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2.5">
                          <Info className="w-4 h-4 text-purple-400" /> Group Info &amp; Admins
                        </span>
                        <span className="text-[10px] text-purple-300 bg-purple-500/20 px-1.5 py-0.5 rounded font-bold">
                          {activeChat.participants.length}
                        </span>
                      </button>
                    )}

                    {/* Option: Search in conversation */}
                    <button
                      onClick={() => {
                        setShowChatActionsMenu(false);
                        setShowInChatSearch(!showInChatSearch);
                        if (showInChatSearch) setInChatSearchQuery('');
                      }}
                      className="w-full px-3 py-2 rounded-xl hover:bg-zinc-900 flex items-center gap-2.5 text-left text-xs font-semibold text-zinc-200 hover:text-white transition-colors cursor-pointer"
                    >
                      <Search className="w-4 h-4 text-cyan-400" /> Search in Chat
                    </button>

                    {/* Option: Pin / Unpin */}
                    <button
                      onClick={(e) => {
                        setShowChatActionsMenu(false);
                        if (activeChat) handleTogglePin(activeChat.id, e);
                      }}
                      className="w-full px-3 py-2 rounded-xl hover:bg-zinc-900 flex items-center justify-between text-left text-xs font-semibold text-zinc-200 hover:text-white transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <Pin className={`w-4 h-4 ${activeChat?.isPinned ? 'text-amber-400 fill-amber-400' : 'text-zinc-400'}`} />
                        {activeChat?.isPinned ? 'Unpin Conversation' : 'Pin Conversation'}
                      </span>
                      {activeChat?.isPinned && (
                        <span className="text-[10px] text-amber-400 font-bold">Pinned</span>
                      )}
                    </button>

                    {/* Option: Vanish Mode Toggle */}
                    <button
                      onClick={() => {
                        setShowChatActionsMenu(false);
                        handleToggleVanishMode();
                      }}
                      className="w-full px-3 py-2 rounded-xl hover:bg-zinc-900 flex items-center justify-between text-left text-xs font-semibold text-zinc-200 hover:text-white transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5">
                        <Flame className={`w-4 h-4 ${activeChat?.vanishMode ? 'text-pink-400' : 'text-zinc-400'}`} />
                        Vanish Mode
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        activeChat?.vanishMode ? 'bg-pink-500/20 text-pink-400' : 'text-zinc-500'
                      }`}>
                        {activeChat?.vanishMode ? 'On' : 'Off'}
                      </span>
                    </button>

                    {/* Option: Theme & Nickname */}
                    <button
                      onClick={() => {
                        setShowChatActionsMenu(false);
                        setShowSettingsModal(true);
                      }}
                      className="w-full px-3 py-2 rounded-xl hover:bg-zinc-900 flex items-center gap-2.5 text-left text-xs font-semibold text-zinc-200 hover:text-white transition-colors cursor-pointer"
                    >
                      <Palette className="w-4 h-4 text-emerald-400" /> Chat Theme &amp; Nickname
                    </button>
                  </div>
                </div>
                </>
              )}
            </div>
          </div>

          {/* In-Chat Search Bar Drawer */}
          {showInChatSearch && (
            <div className="px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex items-center gap-2 animate-in slide-in-from-top duration-200">
              <Search className="w-3.5 h-3.5 text-[#00FF66] shrink-0" />
              <input
                type="text"
                autoFocus
                placeholder="Find in conversation..."
                value={inChatSearchQuery}
                onChange={(e) => setInChatSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
              />
              {inChatSearchQuery && (
                <span className="text-[10px] text-[#00FF66] font-bold px-2 py-0.5 bg-[#00FF66]/10 rounded-full">
                  {filteredMessages.length} found
                </span>
              )}
              <button
                onClick={() => {
                  setShowInChatSearch(false);
                  setInChatSearchQuery('');
                }}
                className="text-zinc-400 hover:text-white p-1"
                title="Close search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Messages History Container */}
          <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3 scroll-smooth">
            {/* Encryption notice banner */}
            <div className="flex justify-center my-2">
              <div className="px-3.5 py-1.5 rounded-full bg-zinc-900/90 border border-zinc-800/80 text-zinc-400 text-[10px] font-medium flex items-center gap-1.5 shadow-sm">
                <Lock className="w-3 h-3 text-[#00FF66]" />
                <span>Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.</span>
              </div>
            </div>

            {filteredMessages.length === 0 && inChatSearchQuery && (
              <div className="py-8 text-center text-zinc-500 text-xs">
                No messages matching "{inChatSearchQuery}" in this chat.
              </div>
            )}

            {filteredMessages.map((m) => {
              const isMine =
                m.senderId === currentUser.id ||
                m.senderId === 'u_me' ||
                (!!m.senderUsername && !!currentUser.username && m.senderUsername.toLowerCase() === currentUser.username.toLowerCase()) ||
                ((currentUser.username?.toLowerCase() === 'noob' || currentUser.id === 'u_noob_admin') && (m.senderUsername?.toLowerCase() === 'noob' || m.senderId === 'u_noob_admin'));
              const isNoobMaster = currentUser.id === 'u_noob_admin' || currentUser.username?.toLowerCase() === 'noob';
              const isGroupAdmin = !!(activeChat?.isGroup && (
                activeChat.creatorId === currentUser.id ||
                activeChat.adminIds?.includes(currentUser.id) ||
                isNoobMaster
              ));
              const canDeleteAsAdmin = isGroupAdmin || isNoobMaster;
              const senderUser =
                activeChat?.participants?.find((p) => p.id === m.senderId) ||
                (m.senderUsername ? {
                  id: m.senderId,
                  username: m.senderUsername,
                  displayName: m.senderDisplayName || m.senderUsername,
                  avatar: m.senderAvatar || '/noob-logo.svg',
                  isVerified: m.senderIsVerified
                } : null);

              const senderAvatar = m.senderAvatar || senderUser?.avatar || '/noob-logo.svg';
              const senderName = m.senderDisplayName || senderUser?.displayName || m.senderUsername || senderUser?.username || 'NOOB Member';
              const senderVerified = !!(m.senderIsVerified || senderUser?.isVerified);

              return (
                <div
                  key={m.id}
                  className={`flex flex-col group ${isMine ? 'items-end' : 'items-start'}`}
                >
                  {/* In Group Chats: Show sender name for incoming messages */}
                  {activeChat?.isGroup && !isMine && (
                    <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-zinc-400 font-semibold">
                      <img
                        src={senderAvatar}
                        alt={senderName}
                        className="w-4 h-4 rounded-full object-cover border border-zinc-700 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <span>{senderName}</span>
                      {senderVerified && <VerifiedBadge size="xs" />}
                    </div>
                  )}

                  <div
                    className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-xs relative ${
                      isMine
                        ? 'text-white border shadow-md'
                        : 'bg-zinc-900 text-zinc-200 border border-zinc-800'
                    }`}
                    style={
                      isMine
                        ? {
                            backgroundColor: `${activeChat?.themeColor || globalChatTheme || '#00FF66'}26`,
                            borderColor: activeChat?.themeColor || globalChatTheme || '#00FF66',
                            boxShadow: `0 2px 14px ${(activeChat?.themeColor || globalChatTheme || '#00FF66')}30`
                          }
                        : undefined
                    }
                  >
                    {/* Shared Music track */}
                    {m.sharedTrack && (
                      <div className="mb-2 p-2 bg-black/60 rounded-xl flex items-center gap-2 border border-zinc-700">
                        <Music className="w-4 h-4 text-[#00FF66] animate-pulse" />
                        <div className="truncate">
                          <span className="text-[11px] font-bold text-white block">
                            {m.sharedTrack.title}
                          </span>
                          <span className="text-[9px] text-zinc-400">{m.sharedTrack.artist}</span>
                        </div>
                      </div>
                    )}

                    {/* Game Invite Challenge Card */}
                    {m.gameInvite && (
                      <div className="mb-2 p-3 bg-gradient-to-r from-emerald-950/90 via-zinc-900 to-zinc-900 rounded-xl border border-[#00FF66]/40 shadow-lg space-y-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#00FF66]/20 border-[#00FF66]/40 flex items-center justify-center text-[#00FF66]">
                            <Gamepad2 className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-white block">
                              🎮 {m.gameInvite.gameTitle}
                            </span>
                            <span className="text-[10px] text-[#00FF66]">
                              Challenged by @{m.gameInvite.fromUsername}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (onPlayGame && m.gameInvite) {
                              onPlayGame(
                                m.gameInvite.gameId,
                                m.gameInvite.fromUsername,
                                m.gameInvite.roomCode
                              );
                            }
                          }}
                          className="w-full py-1.5 bg-[#00FF66] hover:bg-emerald-400 text-black font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-[#00FF66]/20 cursor-pointer"
                        >
                          <Gamepad2 className="w-3.5 h-3.5" /> Accept & Play Duel
                        </button>
                      </div>
                    )}

                    {/* Voice duration badge */}
                    {m.mediaType === 'audio' && (
                      <div className="mb-1 flex items-center gap-2 text-emerald-400 font-semibold text-[11px]">
                        <Mic className="w-3.5 h-3.5 animate-pulse" />
                        <span>Voice Recording ({m.audioDuration || '0:14'})</span>
                      </div>
                    )}

                    {/* Media / GIF / Video Display */}
                    {m.mediaUrl && (
                      <div className="mb-2 rounded-xl overflow-hidden min-h-[100px] max-w-xs sm:max-w-sm bg-black/40 border border-white/10 shadow-md">
                        {m.mediaType === 'video' ? (
                          <video
                            src={m.mediaUrl}
                            controls
                            className="w-full max-h-72 rounded-xl object-contain"
                          />
                        ) : (
                          <img
                            src={m.mediaUrl}
                            alt="GIF / Attachment"
                            className="w-full max-h-72 min-h-[100px] rounded-xl object-contain bg-black/30"
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            onError={(e) => {
                              const img = e.currentTarget;
                              if (!img.dataset.hasFailed) {
                                img.dataset.hasFailed = 'true';
                                img.src = 'https://i.giphy.com/media/BPJmthQ3YRwD6QqcVD/giphy.gif';
                              }
                            }}
                          />
                        )}
                      </div>
                    )}

                    {/* Message Body */}
                    {isEditingMessageId === m.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="w-full bg-black/60 text-xs text-white p-1.5 rounded-lg border border-zinc-600 outline-none"
                        />
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setIsEditingMessageId(null)}
                            className="px-2 py-0.5 text-[10px] text-zinc-400 hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveEdit(m.id)}
                            className="px-2 py-0.5 text-[10px] bg-[#00FF66] text-black font-bold rounded"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : m.text ? (
                      <p className="leading-relaxed whitespace-pre-wrap break-words">{m.text}</p>
                    ) : !m.mediaUrl && !m.sharedTrack && !m.gameInvite ? (
                      <p className="italic text-zinc-400 text-xs flex items-center gap-1">
                        📷 <span>Shared Attachment</span>
                      </p>
                    ) : null}

                    {/* Translated text */}
                    {m.translatedText && (
                      <p className="mt-1.5 pt-1.5 border-t border-zinc-700/60 text-[11px] text-cyan-300 italic">
                        🌐 {m.translatedText}
                      </p>
                    )}

                    {/* Timestamp & Double Check Status */}
                    <div className="flex items-center justify-end gap-1.5 mt-1 text-[10px] text-zinc-400">
                      <span>{m.createdAt}</span>
                      {m.isEdited && <span className="italic">(edited)</span>}

                      {/* Double Check Tick Icons for Outgoing Messages */}
                      {isMine && (
                        <div className="flex items-center shrink-0 ml-0.5">
                          {m.status === 'sent' ? (
                            <Check className="w-3.5 h-3.5 text-zinc-400" title="Sent" />
                          ) : m.status === 'delivered' ? (
                            <CheckCheck className="w-3.5 h-3.5 text-zinc-400" title="Delivered" />
                          ) : (
                            <CheckCheck
                              className="w-3.5 h-3.5 text-[#00E5FF] drop-shadow-[0_0_5px_rgba(0,229,255,0.7)]"
                              title="Read"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Message Action Bar on Hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mt-1 text-[11px] text-zinc-400">
                    <button
                      onClick={() => handleTranslate(m.id)}
                      className="hover:text-white p-1 rounded"
                      title="Translate"
                    >
                      <Globe className="w-3 h-3" />
                    </button>
                    {isMine && (
                      <button
                        onClick={() => {
                          setIsEditingMessageId(m.id);
                          setEditingText(m.text);
                        }}
                        className="hover:text-white p-1 rounded"
                        title="Edit"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                    {(isMine || canDeleteAsAdmin) && (
                      <button
                        onClick={() => handleDeleteMsg(m.id)}
                        className="hover:text-rose-400 p-1 rounded cursor-pointer"
                        title={isMine ? 'Delete' : 'Delete Message (Admin Moderation)'}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Message Input Bar */}
          <div className="p-3 sm:p-4 bg-zinc-900/95 border-t border-zinc-800/90 shrink-0 relative">
            {/* Emojis, GIFs & Stickers Picker Popover */}
            {showEmojiPicker && (
              <div
                ref={emojiPickerRef}
                className="absolute bottom-full left-4 mb-2 w-80 sm:w-96 bg-zinc-950 border border-zinc-700/90 rounded-3xl p-3.5 shadow-2xl z-40 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
              >
                {/* Tab selector */}
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
                  <div className="flex items-center gap-1.5 bg-zinc-900/90 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setActivePickerTab('emojis')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activePickerTab === 'emojis'
                          ? 'bg-[#00FF66] text-black shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Emojis 😊
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePickerTab('gifs')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activePickerTab === 'gifs'
                          ? 'bg-[#00FF66] text-black shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      GIFs 🎬
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivePickerTab('stickers')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activePickerTab === 'stickers'
                          ? 'bg-[#00FF66] text-black shadow-sm'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Stickers 🎨
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(false)}
                    className="text-zinc-500 hover:text-white p-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Tab content */}
                <div className="max-h-56 overflow-y-auto pr-1">
                  {activePickerTab === 'emojis' && (
                    <div className="space-y-3">
                      {EMOJI_CATEGORIES.map((cat) => (
                        <div key={cat.title}>
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">
                            {cat.title}
                          </span>
                          <div className="grid grid-cols-6 gap-1.5 text-xl">
                            {cat.emojis.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleSelectEmoji(emoji)}
                                className="h-9 rounded-xl hover:bg-zinc-800 flex items-center justify-center transition-transform hover:scale-125 cursor-pointer"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activePickerTab === 'gifs' && (
                    <div className="grid grid-cols-2 gap-2">
                      {CURATED_GIFS.map((gif) => (
                        <button
                          key={gif.id}
                          type="button"
                          onClick={() => handleSendGif(gif.url)}
                          className="group relative rounded-xl overflow-hidden border border-zinc-800 hover:border-[#00FF66] transition-all cursor-pointer text-left"
                        >
                          <img
                            src={gif.url}
                            alt={gif.title}
                            className="w-full h-20 object-cover group-hover:scale-105 transition-transform"
                          />
                          <span className="absolute bottom-0 inset-x-0 bg-black/75 text-[9px] font-bold text-white py-0.5 px-1 truncate">
                            {gif.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {activePickerTab === 'stickers' && (
                    <div className="grid grid-cols-4 gap-2">
                      {CURATED_STICKERS.map((stk) => (
                        <button
                          key={stk.id}
                          type="button"
                          onClick={() => handleSendSticker(stk.emoji, stk.label)}
                          className="flex flex-col items-center justify-center p-2 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-[#00FF66]/50 transition-all cursor-pointer group"
                        >
                          <span className="text-3xl group-hover:scale-110 transition-transform">
                            {stk.emoji}
                          </span>
                          <span className="text-[9px] font-bold text-zinc-400 group-hover:text-white mt-1 text-center truncate max-w-full">
                            {stk.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className={`p-2.5 rounded-2xl border transition-all cursor-pointer ${
                  showEmojiPicker
                    ? 'bg-[#00FF66] text-black border-[#00FF66] shadow-[0_0_12px_rgba(0,255,102,0.3)]'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-amber-400 border-zinc-700'
                }`}
                title="Emojis, GIFs & Stickers"
              >
                <Smile className="w-4 h-4" />
              </button>

              <div className="flex-1 flex items-center bg-black/80 border border-zinc-700/80 rounded-2xl px-3.5 py-2 focus-within:border-[#00FF66] transition-colors shadow-inner">
                <input
                  type="text"
                  placeholder={
                    activeChat?.vanishMode
                      ? 'Send vanishing message...'
                      : activeChat?.isGroup
                      ? `Message ${activeChat.name || 'group'}...`
                      : 'Type message...'
                  }
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={!inputText.trim()}
                className="p-2.5 sm:px-4 bg-[#00FF66] hover:bg-emerald-400 text-black font-bold rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-[#00FF66]/20 cursor-pointer flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                <span className="text-xs font-bold hidden sm:inline">Send</span>
              </button>
            </form>
          </div>
        </section>
      </div>

      {/* MODALS */}
      {/* 1. Create Group Chat Modal */}
      <CreateGroupModal
        isOpen={showCreateGroup}
        currentUser={currentUser}
        availableUsers={allUsers}
        onClose={() => setShowCreateGroup(false)}
        onGroupCreated={(newChat) => {
          setConversations([newChat, ...conversations]);
          setActiveChatId(newChat.id);
          setMobileView('chat');
        }}
      />

      {/* 2. Group Details & Admin Management Modal */}
      {activeChat && activeChat.isGroup && (
        <GroupDetailsModal
          isOpen={showGroupDetails}
          chat={activeChat}
          currentUser={currentUser}
          allUsers={allUsers}
          onClose={() => setShowGroupDetails(false)}
          onChatUpdated={(updatedChat) => {
            setConversations(
              conversations.map((c) => (c.id === updatedChat.id ? updatedChat : c))
            );
          }}
        />
      )}

      {/* 3. Settings Modal (Themes, Custom Nicknames, etc.) */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-[#00FF66]" /> Chat Customization
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-2 font-medium">Chat Bubble Theme</label>
              <div className="grid grid-cols-2 gap-2.5">
                {THEME_COLORS.map((t) => {
                  const currentTheme = activeChat?.themeColor || globalChatTheme;
                  const isSelected = currentTheme === t.hex;
                  return (
                    <button
                      key={t.hex}
                      type="button"
                      onClick={() => handleUpdateTheme(t.hex)}
                      className={`flex items-center justify-between p-2.5 rounded-2xl border text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-zinc-800/90 text-white shadow-lg ring-1'
                          : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-zinc-300'
                      }`}
                      style={{
                        borderColor: isSelected ? t.hex : undefined,
                        boxShadow: isSelected ? `0 0 14px ${t.hex}40` : undefined,
                        ringColor: isSelected ? t.hex : undefined
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full ring-2 ring-black shrink-0"
                          style={{ backgroundColor: t.hex }}
                        />
                        <span className="truncate">{t.name}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" style={{ color: t.hex }} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
              <span>Selected Theme Preview:</span>
              <span
                className="px-2.5 py-1 rounded-xl font-bold text-white text-[10px] border shadow-sm"
                style={{
                  backgroundColor: `${activeChat?.themeColor || globalChatTheme}30`,
                  borderColor: activeChat?.themeColor || globalChatTheme,
                  boxShadow: `0 0 10px ${activeChat?.themeColor || globalChatTheme}33`
                }}
              >
                Sample Message Bubble
              </span>
            </div>

            <div className="pt-2 border-t border-zinc-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="px-5 py-2 bg-[#00FF66] hover:bg-emerald-400 text-black text-xs font-black rounded-xl transition-all cursor-pointer shadow-md shadow-[#00FF66]/20"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. New Direct Message Modal (Button between + and 3 dots) */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <SquarePen className="w-4 h-4 text-[#00FF66]" /> Start a Direct Chat
              </h3>
              <button
                onClick={() => {
                  setShowNewChatModal(false);
                  setNewChatSearch('');
                }}
                className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-zinc-500 -mt-2">
              You can message people who follow you or who you follow.
            </p>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search user by @username or name..."
                value={newChatSearch}
                onChange={(e) => setNewChatSearch(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl pl-9 pr-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00FF66]"
                autoFocus
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
              {allUsers
                .filter((u) => u.id !== currentUser.id)
                .filter((u) => canStartChatWith(u))
                .filter(
                  (u) =>
                    !newChatSearch.trim() ||
                    u.username.toLowerCase().includes(newChatSearch.toLowerCase()) ||
                    u.displayName?.toLowerCase().includes(newChatSearch.toLowerCase())
                )
                .map((u) => (
                  <div
                    key={u.id}
                    onClick={() => {
                      handleStartChatWithUser(u);
                      setShowNewChatModal(false);
                      setNewChatSearch('');
                    }}
                    className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img
                          src={u.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                          alt={u.username}
                          className="w-10 h-10 rounded-full object-cover border border-zinc-700"
                        />
                        <span className="w-2.5 h-2.5 rounded-full bg-[#00FF66] ring-2 ring-black absolute bottom-0 right-0" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-1">
                          <span>{u.displayName || u.username}</span>
                          {u.isVerified && <VerifiedBadge size="xs" />}
                        </div>
                        <div className="text-[11px] text-zinc-400">@{u.username}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="px-3.5 py-1.5 bg-[#00FF66]/15 group-hover:bg-[#00FF66] text-[#00FF66] group-hover:text-black rounded-xl text-xs font-bold transition-all"
                    >
                      Chat
                    </button>
                  </div>
                ))}
              {allUsers.filter((u) => canStartChatWith(u)).length === 0 && (
                <div className="text-center py-6 text-xs text-zinc-500">
                  Follow someone (or get followed back) to start a direct chat with them.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

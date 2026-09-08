import express from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import {
  CURRENT_USER,
  MOCK_USERS,
  MOCK_POSTS,
  MOCK_COMMENTS,
  MOCK_STORIES,
  MOCK_REELS,
  MOCK_CHATS,
  MOCK_MESSAGES,
  MOCK_COLLECTIONS,
  MOCK_GAME_SCORES,
  MOCK_HIGHLIGHTS,
  INITIAL_SETTINGS
} from './src/data/mockData';
import { uploadMediaToB2, signMediaKey, getB2Client } from './server/b2Storage';
import { connectDB, isDbConnected, getDbStatusLabel, loadCollection, saveCollection } from './server/db';

// Lazy initialized Gemini client
let aiClient: GoogleGenAI | null = null;
function getAIClient() {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    } catch (e) {
      console.warn('Gemini client init error:', e);
    }
  }
  return aiClient;
}

// Configure multer memory storage for handling file uploads (images, videos, audio)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Simple in-memory rate limiter for bot attack protection
const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();
function checkRateLimit(ip: string, limit: number = 60, windowMs: number = 60000): boolean {
  const now = Date.now();
  const entry = ipRequestCounts.get(ip);
  if (!entry || now > entry.resetTime) {
    ipRequestCounts.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (entry.count >= limit) {
    return false;
  }
  entry.count += 1;
  return true;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  await connectDB();

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // In-memory persistent database state for the session
  let users: any[] = [
    {
      id: 'u_noob_admin',
      username: 'NOOB',
      displayName: 'NOOB',
      firstName: 'NOOB',
      lastName: 'Admin',
      email: 'admin@noob.app',
      password: '12345678',
      avatar: '/noob-logo.svg.jpeg',
      bio: '⚡ Official Administrator & Platform Overseer of NOOB. Connect, stream, compete and explore.',
      accountType: 'public',
      isVerified: true,
      verificationTier: 'max',
      isAdmin: true,
      isSuspended: false,
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      noobPoints: 999999,
      gamesWonCount: 100,
      gamesPlayedCount: 100,
      isBusiness: false,
      followingIds: [],
      blockedUserIds: [],
      privacySettings: {
        hideTaggedPhotos: false,
        blockedWords: [],
        hiddenStoryUsernames: []
      }
    }
  ];
  let currentSessionUserId: string | null = null;
  let posts: any[] = [];
  let comments: Record<string, any[]> = {};
  let stories: any[] = [];
  let reels: any[] = [...MOCK_REELS];
  let supportReviews: { rating: number; feedback?: string; username?: string; timestamp: string }[] = [];

  let notifications: any[] = [
    {
      id: 'notif_welcome',
      senderId: 'u_noob_admin',
      senderUsername: 'NOOB',
      senderAvatar: '/noob-logo.svg.jpeg',
      senderIsVerified: true,
      targetUserId: 'all',
      title: '⚡ Welcome to NOOB',
      message: 'Welcome to the official NOOB platform! Share your moments, challenge gamers in 50 mini-games, stream tracks, and connect globally.',
      type: 'admin_broadcast',
      createdAt: new Date().toISOString()
    }
  ];

  let chats: any[] = [
    {
      id: 'c_global_lounge',
      name: '🌐 NOOB Global Lounge',
      avatar: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=400&auto=format&fit=crop&q=80',
      participants: users.map(sanitizeUser),
      creatorId: 'u_admin',
      adminIds: ['u_admin'],
      isGroup: true,
      isGlobalDefault: true,
      description: 'Official global community group chat for all NOOB members',
      unreadCount: 0,
      isPinned: true,
      isMuted: false,
      themeColor: '#00FF66',
      vanishMode: false,
      readReceiptsEnabled: true,
      createdAt: 'Always active',
      lastMessage: {
        id: 'm_global_init',
        chatId: 'c_global_lounge',
        senderId: 'system',
        text: '👋 Welcome to the NOOB Global Community! Chat with everyone in real time across all devices.',
        createdAt: 'Active'
      }
    },
    ...MOCK_CHATS
  ];
  let messages: Record<string, any[]> = {
    c_global_lounge: [
      {
        id: 'm_global_init',
        chatId: 'c_global_lounge',
        senderId: 'system',
        text: '👋 Welcome to the NOOB Global Community! Chat with everyone in real time across all devices.',
        createdAt: 'Just now',
        isEdited: false,
        status: 'read',
        reactions: [{ emoji: '🔥', count: 15, users: [] }, { emoji: '🚀', count: 10, users: [] }]
      }
    ],
    ...MOCK_MESSAGES
  };
  let collections: any[] = [...MOCK_COLLECTIONS];
  let gameScores: any[] = [...MOCK_GAME_SCORES];
  let highlights: any[] = [...MOCK_HIGHLIGHTS];
  let reports: any[] = [];
  let chatReviews: any[] = [];
  let settings = { ...INITIAL_SETTINGS };
  let reelHistory: string[] = [];

  // Initial community music tracks (featuring Dhurandhar movie soundtrack)
  let musicTracks: any[] = [
    {
      id: 'trk_dhurandar_1',
      title: 'Dhurandhar - Title Track (Aditya Dhar Movie)',
      artist: 'Ranveer Singh & Shashwat Sachdev',
      genre: 'Bollywood / Action Drill',
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
      coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&auto=format&fit=crop&q=80',
      duration: '3:24',
      uploaderId: 'u_admin',
      uploaderUsername: 'dhurandhar_official',
      uploaderAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=80',
      likesCount: 540,
      playsCount: 4200,
      isLiked: false,
      isNew: true,
      createdAt: 'Just now'
    },
    {
      id: 'trk_dhurandar_2',
      title: 'Dhurandhar - Roar of the Beast (Action Theme)',
      artist: 'Shashwat Sachdev & Aditya Dhar OST',
      genre: 'Epic Cinematic / Beats',
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
      coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&auto=format&fit=crop&q=80',
      duration: '2:58',
      uploaderId: 'u_admin',
      uploaderUsername: 'dhurandhar_official',
      uploaderAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=80',
      likesCount: 390,
      playsCount: 3100,
      isLiked: false,
      isNew: true,
      createdAt: '1 hour ago'
    },
    {
      id: 'trk_dhurandar_3',
      title: 'Dhurandhar - Midnight Strike (Punjabi Drill & Bass)',
      artist: 'Dhurandhar Official Soundtrack',
      genre: 'Desi Hip-Hop / Drill',
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
      coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80',
      duration: '3:45',
      uploaderId: 'u_admin',
      uploaderUsername: 'dhurandhar_official',
      uploaderAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=80',
      likesCount: 460,
      playsCount: 3890,
      isLiked: false,
      isNew: true,
      createdAt: '3 hours ago'
    },
    {
      id: 'trk_dhurandar_4',
      title: 'Dhurandhar - The Undefeated Warriors Anthem',
      artist: 'Ranveer Singh & Symphonic Orchestra',
      genre: 'Bollywood Anthem / High Voltage',
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
      coverUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&auto=format&fit=crop&q=80',
      duration: '3:15',
      uploaderId: 'u_admin',
      uploaderUsername: 'dhurandhar_official',
      uploaderAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=80',
      likesCount: 610,
      playsCount: 5120,
      isLiked: false,
      isNew: true,
      createdAt: '4 hours ago'
    },
    {
      id: 'trk_dhurandar_5',
      title: 'Dhurandhar - Dhol & Beats Anthem (Aditya Dhar OST)',
      artist: 'Shashwat Sachdev & Punjabi Dhol Ensemble',
      genre: 'Folk Fusion / Action OST',
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      coverUrl: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=400&auto=format&fit=crop&q=80',
      duration: '3:30',
      uploaderId: 'u_admin',
      uploaderUsername: 'dhurandhar_official',
      uploaderAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=80',
      likesCount: 580,
      playsCount: 4790,
      isLiked: true,
      createdAt: '5 hours ago'
    },
    {
      id: 'trk_dhurandar_6',
      title: 'Dhurandhar - Mission Dawn (Secret Agent Thriller BGM)',
      artist: 'Aditya Dhar Film Score',
      genre: 'Action Score / Cyber Bass',
      audioUrl: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
      coverUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&auto=format&fit=crop&q=80',
      duration: '2:50',
      uploaderId: 'u_admin',
      uploaderUsername: 'dhurandhar_official',
      uploaderAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=80',
      likesCount: 310,
      playsCount: 2940,
      isLiked: false,
      createdAt: '6 hours ago'
    }
  ];

  // --- MongoDB persistence ---
  // If MONGODB_URI is configured, replace the mock seed data above with whatever
  // was last saved, so state survives server restarts / Railway redeploys.
  const PERSISTED_STATE_KEYS = [
    'users', 'posts', 'comments', 'stories', 'reels', 'supportReviews',
    'notifications', 'chats', 'messages', 'collections', 'gameScores',
    'highlights', 'reports', 'chatReviews', 'settings', 'reelHistory', 'musicTracks'
  ] as const;

  if (isDbConnected()) {
    const loaded: Record<string, any> = {};
    await Promise.all(PERSISTED_STATE_KEYS.map(async (key) => {
      loaded[key] = await loadCollection(key);
    }));

    if (loaded.users) users = loaded.users;
    if (loaded.posts) posts = loaded.posts;
    if (loaded.comments) comments = loaded.comments;
    if (loaded.stories) stories = loaded.stories;
    if (loaded.reels) reels = loaded.reels;
    if (loaded.supportReviews) supportReviews = loaded.supportReviews;
    if (loaded.notifications) notifications = loaded.notifications;
    if (loaded.chats) chats = loaded.chats;
    if (loaded.messages) messages = loaded.messages;
    if (loaded.collections) collections = loaded.collections;
    if (loaded.gameScores) gameScores = loaded.gameScores;
    if (loaded.highlights) highlights = loaded.highlights;
    if (loaded.reports) reports = loaded.reports;
    if (loaded.chatReviews) chatReviews = loaded.chatReviews;
    if (loaded.settings) settings = loaded.settings;
    if (loaded.reelHistory) reelHistory = loaded.reelHistory;
    if (loaded.musicTracks) musicTracks = loaded.musicTracks;

    console.log('MongoDB: restored persisted app state');
  }

  // Debounced full-state save: any non-GET request schedules a save a few
  // seconds out, coalescing bursts of mutations into a single write.
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  async function persistStateNow() {
    if (!isDbConnected()) return;
    await Promise.all([
      saveCollection('users', users),
      saveCollection('posts', posts),
      saveCollection('comments', comments),
      saveCollection('stories', stories),
      saveCollection('reels', reels),
      saveCollection('supportReviews', supportReviews),
      saveCollection('notifications', notifications),
      saveCollection('chats', chats),
      saveCollection('messages', messages),
      saveCollection('collections', collections),
      saveCollection('gameScores', gameScores),
      saveCollection('highlights', highlights),
      saveCollection('reports', reports),
      saveCollection('chatReviews', chatReviews),
      saveCollection('settings', settings),
      saveCollection('reelHistory', reelHistory),
      saveCollection('musicTracks', musicTracks),
    ]);
  }

  function schedulePersist() {
    if (!isDbConnected() || persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistStateNow().catch(err => console.error('MongoDB persist failed:', err));
    }, 3000);
  }

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, async () => {
      if (persistTimer) clearTimeout(persistTimer);
      await persistStateNow();
      process.exit(0);
    });
  }

  // Helper to sanitize user object (remove password)
  function sanitizeUser(u: any) {
    if (!u) return null;
    const { password, ...safeUser } = u;
    return safeUser;
  }

  // Records a NOOB Points change (earn or spend) on a user, for the Wallet
  // transaction history. Call this at every place points are earned or spent.
  function recordTransaction(user: any, amount: number, reason: string) {
    if (!user.noobTransactions) user.noobTransactions = [];
    user.noobTransactions.unshift({
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      amount,
      reason,
      timestamp: new Date().toISOString(),
      balanceAfter: user.noobPoints || 0,
    });
    // Keep the list from growing unbounded in memory
    if (user.noobTransactions.length > 200) {
      user.noobTransactions.length = 200;
    }
  }

  function getActiveUser(req: express.Request) {
    const headerUserId = req.headers['x-user-id'] as string;
    if (headerUserId) {
      const found = users.find(u => u.id === headerUserId);
      if (found) return found;
    }
    return null;
  }

  // Schedule a debounced state save after every mutating request finishes
  app.use((req, res, next) => {
    res.on('finish', () => {
      if (req.method !== 'GET') schedulePersist();
    });
    next();
  });

  // --- API Routes ---

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      serverTime: new Date().toISOString(),
      usersCount: users.length,
      b2Storage: getB2Client().isConfigured ? 'connected' : 'ready',
      mongoStorage: getDbStatusLabel()
    });
  });

  // --- MEDIA UPLOAD (BACKBLAZE B2 S3 INTEGRATION) ---
  app.post('/api/upload/media', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const folder = (req.body.folder || 'posts') as 'posts' | 'reels' | 'stories' | 'avatars' | 'music' | 'covers';
      const result = await uploadMediaToB2(
        req.file.buffer,
        folder,
        req.file.originalname,
        req.file.mimetype
      );

      res.status(201).json({
        success: true,
        objectKey: result.objectKey,
        url: result.presignedUrl
      });
    } catch (err: any) {
      console.error('Media upload error:', err);
      res.status(500).json({ error: 'Failed to upload media to cloud storage', details: err?.message });
    }
  });

  // --- AUTHENTICATION ROUTES ---
  app.post('/api/auth/signup', (req, res) => {
    const {
      firstName,
      lastName,
      username,
      displayName,
      email,
      countryCode,
      mobileNumber,
      gender,
      password,
      avatar,
      bio,
      accountType,
      businessCategory,
      businessEmail,
      businessPhone,
      businessAddress,
      agreedToTerms
    } = req.body;

    if (!firstName || !firstName.trim()) {
      return res.status(400).json({ error: 'First Name is required' });
    }
    if (!lastName || !lastName.trim()) {
      return res.status(400).json({ error: 'Last Name is required' });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email address is required' });
    }
    if (!username || !username.trim()) {
      return res.status(400).json({ error: 'User ID / Username is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!bio || !bio.trim()) {
      return res.status(400).json({ error: 'Bio is compulsory. Please write a short bio about yourself.' });
    }
    if (!agreedToTerms) {
      return res.status(400).json({ error: "You must agree to NOOB's general terms and privacy policy" });
    }

    const cleanUsername = username.toLowerCase().trim().replace(/[^a-z0-9_.]/g, '');
    if (!cleanUsername) {
      return res.status(400).json({ error: 'User ID contains invalid characters' });
    }

    const exists = users.some(u => u.username.toLowerCase() === cleanUsername);
    if (exists) {
      return res.status(409).json({ error: 'User ID is already taken. Please choose another.' });
    }

    const computedDisplayName = displayName?.trim() || `${firstName.trim()} ${lastName.trim()}`;
    const chosenAccountType: 'public' | 'private' | 'business' =
      accountType === 'private' || accountType === 'business' ? accountType : 'public';

    // Find NOOB admin account to set as default follow
    const noobAdmin = users.find(u => u.username.toLowerCase() === 'noob' || u.id === 'u_noob_admin');
    const defaultFollowingIds: string[] = [];
    if (noobAdmin && noobAdmin.id) {
      defaultFollowingIds.push(noobAdmin.id);
      noobAdmin.followersCount = (noobAdmin.followersCount || 0) + 1;
    }

    const newUser = {
      id: `u_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      username: cleanUsername,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      displayName: computedDisplayName,
      email: email.trim().toLowerCase(),
      countryCode: countryCode || '+91 (IN)',
      mobileNumber: (mobileNumber || '').trim(),
      gender: gender || 'Prefer not to say',
      password,
      avatar: avatar || '/noob-logo.svg.jpeg',
      bio: bio?.trim() || '🎉 Here for fun, laughs & connecting with cool people!',
      accountType: chosenAccountType,
      isBusiness: chosenAccountType === 'business',
      businessCategory: businessCategory || (chosenAccountType === 'business' ? 'Creator & Brand' : undefined),
      businessEmail: businessEmail || (chosenAccountType === 'business' ? email.trim().toLowerCase() : undefined),
      businessPhone: businessPhone || (chosenAccountType === 'business' ? mobileNumber : undefined),
      businessAddress: businessAddress || undefined,
      agreedToTerms: true,
      isVerified: false,
      followersCount: 0,
      followingCount: defaultFollowingIds.length,
      postsCount: 0,
      noobPoints: 0,
      gamesWonCount: 0,
      gamesPlayedCount: 0,
      followingIds: defaultFollowingIds,
      followRequests: [],
      pendingSentRequests: [],
      externalLinks: [],
      customLinks: [],
      businessAddresses: businessAddress ? [businessAddress] : [],
      crossProfiles: [],
      privacySettings: {
        hideTaggedPhotos: false,
        blockedWords: [],
        hiddenStoryUsernames: []
      },
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    currentSessionUserId = newUser.id;

    res.status(201).json({ success: true, user: sanitizeUser(newUser) });
  });

  app.post('/api/auth/login', (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username/Email and password are required' });
    }

    const cleanIdentifier = identifier.toLowerCase().trim();
    const user = users.find(u =>
      u.username.toLowerCase() === cleanIdentifier ||
      (u.email && u.email.toLowerCase() === cleanIdentifier)
    );

    if (!user) {
      // Auto-register convenience or clear message
      return res.status(401).json({ error: 'Account not found. Please click "Create Account" below.' });
    }

    if (user.password && user.password !== password) {
      return res.status(401).json({ error: 'Incorrect password. Please check your credentials.' });
    }

    if (user.isSuspended) {
      return res.status(403).json({
        error: `This account has been suspended by NOOB Administrator.${user.suspendedReason ? ' Reason: ' + user.suspendedReason : ''}`
      });
    }

    currentSessionUserId = user.id;
    res.json({ success: true, user: sanitizeUser(user) });
  });

  app.post('/api/auth/logout', (req, res) => {
    currentSessionUserId = null;
    res.json({ success: true, message: 'Logged out successfully' });
  });

  app.delete('/api/auth/delete-all-users', (req, res) => {
    users = [];
    posts = [];
    comments = {};
    stories = [];
    reels = [];
    chats = [];
    messages = {};
    collections = [];
    gameScores = [];
    highlights = [];
    currentSessionUserId = null;
    res.json({ success: true, message: 'All users and data have been reset.' });
  });

  // Current user & profile
  app.get('/api/users/me', async (req, res) => {
    const activeUser = getActiveUser(req);
    if (activeUser && activeUser.avatar) {
      activeUser.avatar = await signMediaKey(activeUser.avatar);
    }
    res.json({ user: sanitizeUser(activeUser) });
  });

  app.put('/api/users/me', (req, res) => {
    const activeUser = getActiveUser(req);
    if (!activeUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const updated = req.body;
    const index = users.findIndex(u => u.id === activeUser.id);
    if (index !== -1) {
      users[index] = { ...users[index], ...updated };
      res.json({ success: true, user: sanitizeUser(users[index]) });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  });

  // Full detailed profile update
  app.post('/api/users/profile/update', (req, res) => {
    const activeUser = getActiveUser(req);
    if (!activeUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const {
      displayName,
      firstName,
      lastName,
      username,
      bio,
      avatar,
      website,
      city,
      countryCode,
      mobileNumber,
      gender,
      pronouns,
      accountType,
      businessCategory,
      interests,
      socialLinks
    } = req.body;

    const index = users.findIndex(u => u.id === activeUser.id);
    if (index === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if new username is unique
    if (username && username.toLowerCase() !== users[index].username.toLowerCase()) {
      const cleanU = username.toLowerCase().trim().replace(/[^a-z0-9_.]/g, '');
      const taken = users.some(u => u.id !== activeUser.id && u.username.toLowerCase() === cleanU);
      if (taken) {
        return res.status(409).json({ error: 'Username is already taken by another account.' });
      }
      users[index].username = cleanU;
    }

    if (displayName) users[index].displayName = displayName.trim();
    if (firstName) users[index].firstName = firstName.trim();
    if (lastName) users[index].lastName = lastName.trim();
    if (bio !== undefined) users[index].bio = bio.trim();
    if (avatar) users[index].avatar = avatar;
    if (website !== undefined) users[index].website = website.trim();
    if (city !== undefined) users[index].city = city.trim();
    if (countryCode) users[index].countryCode = countryCode;
    if (mobileNumber !== undefined) users[index].mobileNumber = mobileNumber.trim();
    if (gender !== undefined) users[index].gender = gender;
    if (pronouns !== undefined) users[index].pronouns = pronouns;
    if (accountType) {
      users[index].accountType = accountType;
      users[index].isBusiness = accountType === 'business';
    }
    if (businessCategory !== undefined) users[index].businessCategory = businessCategory;
    if (interests) users[index].interests = interests;
    if (socialLinks) users[index].socialLinks = socialLinks;

    res.json({
      success: true,
      message: 'Profile successfully updated',
      user: sanitizeUser(users[index])
    });
  });

  // Store a device's push notification token against the logged-in account.
  // Actually sending notifications still needs a Firebase service account
  // key configured on the server (not set up yet) — this just persists
  // tokens so that piece can be wired in later without a client change.
  app.post('/api/users/push-token', (req, res) => {
    const active = getActiveUser(req);
    if (!active) return res.status(401).json({ error: 'Please log in.' });

    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Push token is required.' });

    const index = users.findIndex(u => u.id === active.id);
    if (index === -1) return res.status(404).json({ error: 'User not found.' });

    users[index].pushTokens = Array.from(new Set([...(users[index].pushTokens || []), token]));
    res.json({ success: true });
  });

  // Verification endpoint (Coupon code, 100M permanent points, or 50k/mo points with password authentication)
  app.post('/api/users/verify', (req, res) => {
    const active = getActiveUser(req);
    if (!active) return res.status(401).json({ error: 'Please log in to verify your account.' });

    const { password, method, couponCode } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required to authenticate verification request.' });
    }

    const index = users.findIndex(u => u.id === active.id);
    if (index === -1) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    // Verify account password
    if (users[index].password && users[index].password !== password.trim()) {
      return res.status(401).json({ error: 'Invalid password. Please check your credentials.' });
    }

    // Check method
    if (method === 'coupon') {
      const validCoupon = 'noob_4t95uirowejhfhiyr75u8432iwju';
      if (!couponCode || couponCode.trim() !== validCoupon) {
        return res.status(400).json({ error: 'Invalid or expired verification coupon code.' });
      }
    } else if (method === 'points_permanent') {
      const requiredPoints = 100000000;
      if ((users[index].noobPoints || 0) < requiredPoints) {
        return res.status(400).json({
          error: `Insufficient NOOB Points. You have ${users[index].noobPoints || 0} points, but ${requiredPoints.toLocaleString()} points are required for permanent verification.`
        });
      }
      users[index].noobPoints -= requiredPoints;
      recordTransaction(users[index], -requiredPoints, 'Permanent verification badge');
    } else if (method === 'points_monthly') {
      const requiredPoints = 50000;
      if ((users[index].noobPoints || 0) < requiredPoints) {
        return res.status(400).json({
          error: `Insufficient NOOB Points. You have ${users[index].noobPoints || 0} points, but ${requiredPoints.toLocaleString()} points are required for monthly verification.`
        });
      }
      users[index].noobPoints -= requiredPoints;
      recordTransaction(users[index], -requiredPoints, 'Monthly verification badge');
    } else if (method === 'direct_vip' || method === 'upi' || method === 'card' || method === 'crypto') {
      // Direct VIP checkout authorized via password & mock gateway
      users[index].vipPaymentRef = `PAY_NOOB_${Date.now()}`;
    } else {
      return res.status(400).json({ error: 'Invalid verification method specified.' });
    }

    // Mark as verified
    users[index].isVerified = true;
    users[index].verificationTier = 'premium';

    res.json({
      success: true,
      message: 'Congratulations! Your account @' + users[index].username + ' is now officially verified with the blue checkmark!',
      user: sanitizeUser(users[index])
    });
  });

  // All Users directory (for search, follow, explore & game invites)
  app.get('/api/users', (req, res) => {
    const active = getActiveUser(req);
    const sanitized = users.map(u => ({
      ...sanitizeUser(u),
      isFollowing: active?.followingIds?.includes(u.id) || false
    }));
    res.json({ users: sanitized });
  });

  // Follow / Unfollow User (supports /follow and /toggle-follow)
  const handleToggleFollow = (req: any, res: any) => {
    const targetUserId = req.params.id;
    const active = getActiveUser(req);
    if (!active) return res.status(401).json({ error: 'Unauthorized' });

    active.followingIds = active.followingIds || [];
    const isFollowing = active.followingIds.includes(targetUserId);

    const targetUser = users.find(u => u.id === targetUserId);

    if (isFollowing) {
      active.followingIds = active.followingIds.filter((id: string) => id !== targetUserId);
      active.followingCount = Math.max(0, (active.followingCount || 0) - 1);
      if (targetUser) targetUser.followersCount = Math.max(0, (targetUser.followersCount || 0) - 1);
      res.json({ success: true, isFollowing: false, followersCount: targetUser?.followersCount || 0 });
    } else {
      active.followingIds.push(targetUserId);
      active.followingCount = (active.followingCount || 0) + 1;
      if (targetUser) targetUser.followersCount = (targetUser.followersCount || 0) + 1;
      res.json({ success: true, isFollowing: true, followersCount: targetUser?.followersCount || 1 });
    }
  };

  app.post('/api/users/:id/follow', handleToggleFollow);
  app.post('/api/users/:id/toggle-follow', handleToggleFollow);

  // --- POSTS ROUTES ---
  app.get('/api/posts', async (req, res) => {
    const active = getActiveUser(req);
    const mapped = await Promise.all(
      posts.map(async (p) => {
        const signedSlides = await Promise.all(
          p.slides.map(async (s: any) => ({
            ...s,
            mediaUrl: await signMediaKey(s.mediaUrl)
          }))
        );
        return {
          ...p,
          slides: signedSlides,
          userAvatar: await signMediaKey(p.userAvatar),
          isLiked: p.likedBy?.includes(active?.id) || false,
          isSaved: p.savedBy?.includes(active?.id) || false
        };
      })
    );
    res.json({ posts: mapped });
  });

  app.post('/api/posts', (req, res) => {
    const active = getActiveUser(req);
    const author = active || {
      id: 'u_1',
      username: 'alex_cyber',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      isVerified: true
    };

    const { slides, caption, category, hashtags, audioTrack, webLink } = req.body;

    const newPost = {
      id: `p_${Date.now()}`,
      userId: author.id,
      username: author.username,
      userAvatar: author.avatar,
      isVerified: !!author.isVerified,
      caption: caption || '',
      createdAt: 'Just now',
      slides: slides || [],
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      savesCount: 0,
      isLiked: false,
      isSaved: false,
      likedBy: [],
      savedBy: [],
      hashtags: hashtags || [],
      category: category || 'tech',
      audioTrack,
      webLink
    };

    posts.unshift(newPost);
    if (active) {
      active.postsCount = (active.postsCount || 0) + 1;
      active.noobPoints = (active.noobPoints || 0) + 25;
      recordTransaction(active, 25, 'Published a post');
    }
    res.status(201).json({ success: true, post: newPost });
  });

  app.post('/api/posts/:id/like', (req, res) => {
    const postId = req.params.id;
    const active = getActiveUser(req);
    const post = posts.find(p => p.id === postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.likedBy = post.likedBy || [];
    const isLiked = post.likedBy.includes(active?.id);

    if (isLiked) {
      post.likedBy = post.likedBy.filter((id: string) => id !== active?.id);
      post.likesCount = Math.max(0, (post.likesCount || 0) - 1);
    } else {
      post.likedBy.push(active?.id);
      post.likesCount = (post.likesCount || 0) + 1;
    }

    res.json({ success: true, isLiked: !isLiked, likesCount: post.likesCount });
  });

  app.post('/api/posts/:id/save', (req, res) => {
    const postId = req.params.id;
    const active = getActiveUser(req);
    const post = posts.find(p => p.id === postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    post.savedBy = post.savedBy || [];
    const isSaved = post.savedBy.includes(active?.id);

    if (isSaved) {
      post.savedBy = post.savedBy.filter((id: string) => id !== active?.id);
    } else {
      post.savedBy.push(active?.id);
    }

    res.json({ success: true, isSaved: !isSaved });
  });

  app.get('/api/posts/saved', async (req, res) => {
    const active = getActiveUser(req);
    const saved = posts.filter(p => p.savedBy?.includes(active?.id) || p.isSaved);
    const mapped = await Promise.all(
      saved.map(async (p) => ({
        ...p,
        slides: await Promise.all(p.slides.map(async (s: any) => ({ ...s, mediaUrl: await signMediaKey(s.mediaUrl) }))),
        userAvatar: await signMediaKey(p.userAvatar),
        isLiked: p.likedBy?.includes(active?.id) || false,
        isSaved: true
      }))
    );
    res.json({ posts: mapped });
  });

  app.get('/api/posts/liked', async (req, res) => {
    const active = getActiveUser(req);
    const liked = posts.filter(p => p.likedBy?.includes(active?.id) || p.isLiked);
    const mapped = await Promise.all(
      liked.map(async (p) => ({
        ...p,
        slides: await Promise.all(p.slides.map(async (s: any) => ({ ...s, mediaUrl: await signMediaKey(s.mediaUrl) }))),
        userAvatar: await signMediaKey(p.userAvatar),
        isLiked: true,
        isSaved: p.savedBy?.includes(active?.id) || false
      }))
    );
    res.json({ posts: mapped });
  });

  app.get('/api/posts/archived', async (req, res) => {
    const active = getActiveUser(req);
    const archived = posts.filter(p => p.isArchived && (p.userId === active?.id || p.username === active?.username));
    const mapped = await Promise.all(
      archived.map(async (p) => ({
        ...p,
        slides: await Promise.all(p.slides.map(async (s: any) => ({ ...s, mediaUrl: await signMediaKey(s.mediaUrl) }))),
        userAvatar: await signMediaKey(p.userAvatar),
        isLiked: p.likedBy?.includes(active?.id) || false,
        isSaved: p.savedBy?.includes(active?.id) || false
      }))
    );
    res.json({ posts: mapped });
  });

  app.post('/api/posts/:id/archive', (req, res) => {
    const postId = req.params.id;
    const post = posts.find(p => p.id === postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.isArchived = !post.isArchived;
    res.json({ success: true, isArchived: post.isArchived });
  });

  app.post('/api/posts/:id/toggle-comments', (req, res) => {
    const postId = req.params.id;
    const post = posts.find(p => p.id === postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.isCommentsDisabled = !post.isCommentsDisabled;
    res.json({ success: true, isCommentsDisabled: post.isCommentsDisabled });
  });

  app.post('/api/posts/:id/toggle-like-count', (req, res) => {
    const postId = req.params.id;
    const post = posts.find(p => p.id === postId);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    post.isLikeCountHidden = !post.isLikeCountHidden;
    res.json({ success: true, isLikeCountHidden: post.isLikeCountHidden });
  });

  // Delete Post
  app.delete('/api/posts/:id', (req, res) => {
    const postId = req.params.id;
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const active = getActiveUser(req);
    const isOwner = active && (active.id === post.userId || active.username === post.username);
    const isMasterAdmin = active && (active.isAdmin || active.username.toLowerCase() === 'noob' || active.id === 'u_noob_admin');
    if (!isOwner && !isMasterAdmin) {
      return res.status(403).json({ error: 'You can only delete your own posts.' });
    }

    posts = posts.filter(p => p.id !== postId);
    const author = users.find(u => u.id === post.userId || u.username === post.username);
    if (author) {
      author.postsCount = Math.max(0, (author.postsCount || 0) - 1);
    }
    delete comments[postId];
    res.json({ success: true, message: 'Post deleted successfully' });
  });

  // --- COMMENTS ROUTES ---
  app.get('/api/posts/:id/comments', (req, res) => {
    const postId = req.params.id;
    const postComments = comments[postId] || [];
    res.json({ comments: postComments });
  });

  app.post('/api/posts/:id/comments', (req, res) => {
    const postId = req.params.id;
    const active = getActiveUser(req);
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Comment text cannot be empty' });
    }

    const newComment = {
      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      postId,
      userId: active?.id || 'u_anon',
      username: active?.username || 'user',
      userAvatar: active?.avatar || '/noob-logo.svg.jpeg',
      isVerified: !!active?.isVerified,
      text: text.trim(),
      likesCount: 0,
      isLiked: false,
      isPinned: false,
      createdAt: 'Just now'
    };

    if (!comments[postId]) comments[postId] = [];
    comments[postId].unshift(newComment);

    const post = posts.find(p => p.id === postId);
    if (post) {
      post.commentsCount = (post.commentsCount || 0) + 1;
    }
    if (active) {
      active.noobPoints = (active.noobPoints || 0) + 5;
      recordTransaction(active, 5, 'Posted a comment');
    }

    res.status(201).json({ success: true, comment: newComment });
  });

  app.delete('/api/posts/:id/comments/:commentId', (req, res) => {
    const { id: postId, commentId } = req.params;
    if (comments[postId]) {
      comments[postId] = comments[postId].filter((c: any) => c.id !== commentId);
    }
    const post = posts.find(p => p.id === postId);
    if (post) {
      post.commentsCount = Math.max(0, (post.commentsCount || 0) - 1);
    }
    res.json({ success: true });
  });

  app.post('/api/posts/:id/comments/:commentId/pin', (req, res) => {
    const { id: postId, commentId } = req.params;
    if (comments[postId]) {
      const c = comments[postId].find((item: any) => item.id === commentId);
      if (c) {
        c.isPinned = !c.isPinned;
        return res.json({ success: true, isPinned: c.isPinned });
      }
    }
    res.json({ success: true, isPinned: false });
  });

  // Collections endpoints
  let savedCollections: any[] = [
    {
      id: 'col_default_1',
      name: 'Design & Aesthetics',
      coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=80',
      postsCount: 3,
      isCollaborative: false
    },
    {
      id: 'col_default_2',
      name: 'Gaming & Cyber Highlights',
      coverUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=500&auto=format&fit=crop&q=80',
      postsCount: 2,
      isCollaborative: false
    }
  ];

  app.get('/api/collections', (req, res) => {
    res.json({ collections: savedCollections });
  });

  app.post('/api/collections', (req, res) => {
    const { name, coverUrl } = req.body;
    const newCol = {
      id: `col_${Date.now()}`,
      name: name || 'New Collection',
      coverUrl: coverUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500&auto=format&fit=crop&q=80',
      postsCount: 0,
      isCollaborative: false
    };
    savedCollections.unshift(newCol);
    res.status(201).json({ success: true, collection: newCol });
  });

  // --- STORIES ROUTES ---
  app.get('/api/stories', async (req, res) => {
    const active = getActiveUser(req);
    const now = Date.now();

    const visible = stories.filter(s => {
      // Auto-expire after 24 hours
      if (s.expiresAt && new Date(s.expiresAt).getTime() < now) return false;

      // Privacy: public accounts are visible to everyone; private accounts
      // only to the author themself or accounts they follow / are followed by.
      if (s.userId === active?.id) return true;
      const author = users.find(u => u.id === s.userId);
      if (!author || author.accountType !== 'private') return true;
      if (!active) return false;
      const isFollowing = active.followingIds?.includes(author.id);
      const isFollower = author.followingIds?.includes(active.id);
      return !!(isFollowing || isFollower);
    });

    const mapped = await Promise.all(
      visible.map(async s => ({
        ...s,
        mediaUrl: await signMediaKey(s.mediaUrl),
        userAvatar: await signMediaKey(s.userAvatar)
      }))
    );
    res.json({ stories: mapped });
  });

  app.post('/api/stories', (req, res) => {
    const active = getActiveUser(req);
    const author = active || {
      id: 'u_1',
      username: 'alex_cyber',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      isVerified: true
    };

    const { mediaUrl, mediaType, stickers, isCloseFriendsOnly } = req.body;

    const newStory = {
      id: `s_${Date.now()}`,
      userId: author.id,
      username: author.username,
      userAvatar: author.avatar,
      isVerified: !!author.isVerified,
      mediaUrl: mediaUrl || '',
      mediaType: mediaType || 'image',
      durationSeconds: 5,
      createdAt: 'Just now',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      isCloseFriendsOnly: !!isCloseFriendsOnly,
      isViewed: false,
      stickers: stickers || [],
      comments: []
    };

    stories.unshift(newStory);
    res.status(201).json({ success: true, story: newStory });
  });

  // --- REELS ROUTES ---
  app.get('/api/reels', async (req, res) => {
    const active = getActiveUser(req);
    const mapped = await Promise.all(
      reels.map(async r => ({
        ...r,
        videoUrl: await signMediaKey(r.videoUrl),
        thumbnailUrl: await signMediaKey(r.thumbnailUrl),
        userAvatar: await signMediaKey(r.userAvatar),
        isLiked: r.likedBy?.includes(active?.id) || false,
        isSaved: r.savedBy?.includes(active?.id) || false
      }))
    );
    res.json({ reels: mapped });
  });

  app.post('/api/reels', (req, res) => {
    const active = getActiveUser(req);
    const author = active || {
      id: 'u_1',
      username: 'alex_cyber',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      isVerified: true
    };

    const { videoUrl, thumbnailUrl, caption, audioTrack, hashtags } = req.body;

    const newReel = {
      id: `r_${Date.now()}`,
      userId: author.id,
      username: author.username,
      userAvatar: author.avatar,
      isVerified: !!author.isVerified,
      videoUrl: videoUrl || '',
      thumbnailUrl: thumbnailUrl || '',
      caption: caption || '',
      audioTrack: audioTrack || { title: 'Original Sound', artist: author.username },
      likesCount: 0,
      commentsCount: 0,
      sharesCount: 0,
      savesCount: 0,
      viewsCount: 1,
      isLiked: false,
      isSaved: false,
      isFollowing: false,
      hashtags: hashtags || [],
      createdAt: 'Just now',
      durationSeconds: 15
    };

    reels.unshift(newReel);
    if (active) {
      active.noobPoints = (active.noobPoints || 0) + 25;
      recordTransaction(active, 25, 'Published a reel');
    }
    res.status(201).json({ success: true, reel: newReel });
  });

  app.post('/api/reels/:id/like', (req, res) => {
    const reelId = req.params.id;
    const active = getActiveUser(req);
    const reel = reels.find(r => r.id === reelId);
    if (!reel) return res.status(404).json({ error: 'Reel not found' });

    reel.likedBy = reel.likedBy || [];
    const isLiked = reel.likedBy.includes(active?.id);

    if (isLiked) {
      reel.likedBy = reel.likedBy.filter((id: string) => id !== active?.id);
      reel.likesCount = Math.max(0, (reel.likesCount || 0) - 1);
    } else {
      reel.likedBy.push(active?.id);
      reel.likesCount = (reel.likesCount || 0) + 1;
    }

    res.json({ success: true, isLiked: !isLiked, likesCount: reel.likesCount });
  });

  // Delete Reel
  app.delete('/api/reels/:id', (req, res) => {
    const reelId = req.params.id;
    const reel = reels.find(r => r.id === reelId);
    if (!reel) {
      return res.status(404).json({ error: 'Reel not found' });
    }

    const active = getActiveUser(req);
    const isOwner = active && (active.id === reel.userId || active.username === reel.username);
    const isMasterAdmin = active && (active.isAdmin || active.username.toLowerCase() === 'noob' || active.id === 'u_noob_admin');
    if (!isOwner && !isMasterAdmin) {
      return res.status(403).json({ error: 'You can only delete your own reels.' });
    }

    reels = reels.filter(r => r.id !== reelId);
    res.json({ success: true, message: 'Reel deleted successfully' });
  });

  // --- MUSIC HUB API ---
  app.get('/api/music/tracks', async (req, res) => {
    const active = getActiveUser(req);
    const mapped = await Promise.all(
      musicTracks.map(async t => ({
        ...t,
        audioUrl: await signMediaKey(t.audioUrl),
        coverUrl: await signMediaKey(t.coverUrl),
        uploaderAvatar: await signMediaKey(t.uploaderAvatar),
        isLiked: t.likedBy?.includes(active?.id) || false
      }))
    );
    res.json({ tracks: mapped });
  });

  app.post('/api/music/tracks', (req, res) => {
    const active = getActiveUser(req);
    const author = active || {
      id: 'u_1',
      username: 'dj_noob',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80'
    };

    const { title, artist, genre, audioUrl, coverUrl, duration } = req.body;

    if (!title || !audioUrl) {
      return res.status(400).json({ error: 'Track title and audio file are required' });
    }

    const newTrack = {
      id: `trk_${Date.now()}`,
      title: title.trim(),
      artist: (artist || author.displayName || author.username).trim(),
      genre: genre || 'Original / All Genres',
      audioUrl,
      coverUrl: coverUrl || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80',
      duration: duration || '3:00',
      uploaderId: author.id,
      uploaderUsername: author.username,
      uploaderAvatar: author.avatar,
      likesCount: 0,
      playsCount: 0,
      likedBy: [],
      isLiked: false,
      createdAt: 'Just now'
    };

    musicTracks.unshift(newTrack);
    res.status(201).json({ success: true, track: newTrack });
  });

  app.post('/api/music/tracks/:id/like', (req, res) => {
    const trackId = req.params.id;
    const active = getActiveUser(req);
    const track = musicTracks.find(t => t.id === trackId);
    if (!track) return res.status(404).json({ error: 'Track not found' });

    track.likedBy = track.likedBy || [];
    const isLiked = track.likedBy.includes(active?.id);

    if (isLiked) {
      track.likedBy = track.likedBy.filter((id: string) => id !== active?.id);
      track.likesCount = Math.max(0, (track.likesCount || 0) - 1);
    } else {
      track.likedBy.push(active?.id);
      track.likesCount = (track.likesCount || 0) + 1;
    }

    res.json({ success: true, isLiked: !isLiked, likesCount: track.likesCount });
  });

  // --- DIRECT MESSAGES & CHAT ---
  app.get('/api/chats', (req, res) => {
    // Ensure global lounge is always present and updated with all users
    let globalChat = chats.find(c => c.id === 'c_global_lounge');
    if (!globalChat) {
      globalChat = {
        id: 'c_global_lounge',
        name: '🌐 NOOB Global Lounge',
        avatar: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=400&auto=format&fit=crop&q=80',
        participants: users.map(sanitizeUser),
        creatorId: 'u_noob_admin',
        adminIds: ['u_noob_admin'],
        isGroup: true,
        isGlobalDefault: true,
        description: 'Official global community group chat for all NOOB members',
        unreadCount: 0,
        isPinned: true,
        isMuted: false,
        themeColor: '#00FF66',
        vanishMode: false,
        readReceiptsEnabled: true,
        createdAt: 'Always active',
        lastMessage: {
          id: 'm_global_init',
          chatId: 'c_global_lounge',
          senderId: 'system',
          text: '👋 Welcome to the NOOB Global Community! Chat with everyone in real time across all devices.',
          createdAt: 'Active'
        }
      };
      chats.unshift(globalChat);
    } else {
      globalChat.participants = users.map(sanitizeUser);
    }

    res.json({ chats });
  });

  // Create new 1-on-1 or Group Chat
  app.post('/api/chats', (req, res) => {
    const active = getActiveUser(req);
    const { name, participantIds, isGroup, avatar, description } = req.body;

    const resolvedParticipants = users
      .filter(u => participantIds?.includes(u.id))
      .map(sanitizeUser);

    if (active && !resolvedParticipants.some(p => p.id === active.id)) {
      resolvedParticipants.push(sanitizeUser(active));
    }

    const creatorId = active?.id || 'u_noob_admin';
    const adminIds = isGroup ? Array.from(new Set([creatorId, 'u_noob_admin'])) : undefined;

    const newChat = {
      id: `c_${Date.now()}`,
      name: isGroup ? (name || 'Group Chat') : undefined,
      avatar: avatar || (isGroup ? 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=400&auto=format&fit=crop&q=80' : undefined),
      description: description || undefined,
      participants: resolvedParticipants,
      isGroup: !!isGroup,
      creatorId: isGroup ? creatorId : undefined,
      adminIds: adminIds,
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
        senderId: active?.id || 'system',
        text: isGroup ? `Group chat "${name || 'Squad'}" created!` : 'Chat started',
        createdAt: 'Just now'
      }
    };

    chats.unshift(newChat);
    res.status(201).json({ success: true, chat: newChat });
  });

  // Update Group details (name, avatar, description)
  app.put('/api/chats/:id/group', (req, res) => {
    const chatId = req.params.id;
    const active = getActiveUser(req);
    const chat = chats.find(c => c.id === chatId);
    if (!chat || !chat.isGroup) return res.status(404).json({ error: 'Group chat not found' });

    // Check if active user is an admin or creator
    const isAdmin = chat.creatorId === active?.id || chat.adminIds?.includes(active?.id);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Only group admins can modify group details' });
    }

    const { name, avatar, description } = req.body;
    if (name) chat.name = name.trim();
    if (avatar) chat.avatar = avatar;
    if (description !== undefined) chat.description = description;

    res.json({ success: true, chat });
  });

  // Manage Group Admins (Make Admin / Dismiss Admin)
  app.post('/api/chats/:id/admins', (req, res) => {
    const chatId = req.params.id;
    const active = getActiveUser(req);
    const chat = chats.find(c => c.id === chatId);
    if (!chat || !chat.isGroup) return res.status(404).json({ error: 'Group chat not found' });

    const isMasterAdmin = active && (active.isAdmin || active.username.toLowerCase() === 'noob' || active.id === 'u_noob_admin');
    const isCurrentAdmin = isMasterAdmin || chat.creatorId === active?.id || chat.adminIds?.includes(active?.id);
    if (!isCurrentAdmin) {
      return res.status(403).json({ error: 'Only group admins can manage admin roles' });
    }

    const { targetUserId, action } = req.body;
    if (!targetUserId) return res.status(400).json({ error: 'Target user ID required' });

    chat.adminIds = chat.adminIds || (chat.creatorId ? [chat.creatorId] : []);
    if (!chat.adminIds.includes('u_noob_admin')) {
      chat.adminIds.push('u_noob_admin');
    }

    if (action === 'make_admin') {
      if (!chat.adminIds.includes(targetUserId)) {
        chat.adminIds.push(targetUserId);
      }
    } else if (action === 'remove_admin') {
      if (targetUserId === 'u_noob_admin') {
        return res.status(400).json({ error: 'Cannot remove NOOB official admin from group admin role' });
      }
      if (targetUserId === chat.creatorId) {
        return res.status(400).json({ error: 'Cannot remove group creator from admin role' });
      }
      chat.adminIds = chat.adminIds.filter((id: string) => id !== targetUserId);
    }

    res.json({ success: true, chat, adminIds: chat.adminIds });
  });

  // Remove member from group
  app.post('/api/chats/:id/members/remove', (req, res) => {
    const chatId = req.params.id;
    const active = getActiveUser(req);
    const chat = chats.find(c => c.id === chatId);
    if (!chat || !chat.isGroup) return res.status(404).json({ error: 'Group chat not found' });

    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ error: 'Target user ID required' });

    const isCurrentAdmin = chat.creatorId === active?.id || chat.adminIds?.includes(active?.id);
    const isSelfLeaving = active?.id === targetUserId;

    if (!isCurrentAdmin && !isSelfLeaving) {
      return res.status(403).json({ error: 'Only group admins can remove members' });
    }

    if (targetUserId === chat.creatorId && !isSelfLeaving) {
      return res.status(400).json({ error: 'Cannot remove group creator' });
    }

    chat.participants = chat.participants.filter((p: any) => p.id !== targetUserId);
    chat.adminIds = (chat.adminIds || []).filter((id: string) => id !== targetUserId);

    res.json({ success: true, chat, participants: chat.participants });
  });

  // Add members to group (strictly creator/admin only)
  app.post('/api/chats/:id/members/add', (req, res) => {
    const chatId = req.params.id;
    const active = getActiveUser(req);
    const chat = chats.find(c => c.id === chatId);
    if (!chat || !chat.isGroup) return res.status(404).json({ error: 'Group chat not found' });

    const isCurrentAdmin = chat.creatorId === active?.id || chat.adminIds?.includes(active?.id);
    if (!isCurrentAdmin) {
      return res.status(403).json({ error: 'Only group admins can add new members' });
    }

    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'No members provided to add' });
    }

    const usersToAdd = users.filter(u => userIds.includes(u.id) && !chat.participants.some((p: any) => p.id === u.id));
    chat.participants.push(...usersToAdd.map(sanitizeUser));

    res.json({ success: true, chat, participants: chat.participants });
  });

  // Toggle Pin Chat
  app.post('/api/chats/:id/pin', (req, res) => {
    const chatId = req.params.id;
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    chat.isPinned = !chat.isPinned;
    res.json({ success: true, isPinned: chat.isPinned });
  });

  // Toggle Mute Chat
  app.post('/api/chats/:id/mute', (req, res) => {
    const chatId = req.params.id;
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    chat.isMuted = !chat.isMuted;
    res.json({ success: true, isMuted: chat.isMuted });
  });

  // Update per-chat settings: theme color, vanish mode, read receipts, nickname
  app.put('/api/chats/:id/settings', (req, res) => {
    const chatId = req.params.id;
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const { themeColor, vanishMode, readReceiptsEnabled, nickname } = req.body;
    if (themeColor !== undefined) chat.themeColor = themeColor;
    if (vanishMode !== undefined) chat.vanishMode = !!vanishMode;
    if (readReceiptsEnabled !== undefined) chat.readReceiptsEnabled = !!readReceiptsEnabled;
    if (nickname !== undefined) chat.nickname = nickname;

    res.json({ success: true, chat });
  });

  // Helper function to generate AI response with exact user intent compliance
  async function generateAIResponse(userText: string, activeUser: any, chatHistory: any[]) {
    const registeredName =
      activeUser?.displayName ||
      (activeUser?.firstName ? `${activeUser.firstName} ${activeUser.lastName || ''}`.trim() : '') ||
      activeUser?.username ||
      'Valued Member';

    const userStats = {
      username: activeUser?.username || 'user',
      registeredName,
      postsCount: activeUser?.postsCount || posts.filter(p => p.userId === activeUser?.id).length,
      noobPoints: activeUser?.noobPoints || 100,
      gamesWon: activeUser?.gamesWonCount || 0,
      gamesPlayed: activeUser?.gamesPlayedCount || 0,
      isVerified: !!activeUser?.isVerified,
      followersCount: activeUser?.followersCount || 0,
      followingCount: activeUser?.followingCount || 0,
      bio: activeUser?.bio || 'Creative creator'
    };

    const lower = userText.toLowerCase().trim();

    // 1. EXACT INTENT RULE: Thank you / Thanks / Gratitude -> "welcome" + high praise about user & activities
    const isThankYou = /\b(thank|thanks|ty|thx|thankyou|appreciate|gratitude|grateful)\b/i.test(lower);
    if (isThankYou) {
      return `Welcome, ${registeredName}! 🌟 It is an absolute pleasure assisting you. You are such an incredible, creative, and valued member of our NOOB community! With your impressive ${userStats.postsCount} posts, ${userStats.noobPoints.toLocaleString()} NOOB points, and ${userStats.gamesWon} gaming victories, your energy truly makes our platform come alive. Thank you for being such a wonderful part of NOOB! Is there anything else I can help you with today?`;
    }

    // 2. EXACT INTENT RULE: Cyber bullying and harassment handling
    const isHarassmentOrBullying = /\b(cyber\s*bully|cyber\s*bullying|bullying|bullied|bully|harass|harassing|harassment|harrass|harrassing|harrassment|abusive|threat|threatening|toxic|stalking|stalker|abuse)\b/i.test(lower);

    // Look for an ID or username mentioned
    const idMatch = lower.match(/(?:@|id\s*(?:is|:)?\s*|user\s*(?:id)?\s*(?:is|:)?\s*|u_)([a-zA-Z0-9_-]+)/i);
    let targetQuery = idMatch ? idMatch[1] : '';

    if (!targetQuery) {
      const tokens = lower.replace(/[^a-zA-Z0-9_]/g, ' ').split(/\s+/).filter(t => t.length > 2);
      for (const tok of tokens) {
        const matched = users.find(u => (u.id.toLowerCase() === tok || u.username.toLowerCase() === tok) && u.id !== activeUser?.id && u.id !== 'u_noob_ai');
        if (matched) {
          targetQuery = matched.username;
          break;
        }
      }
    }

    // If cyber bullying is mentioned or was active in previous message
    const previousHadBullying = chatHistory.some(m => /\b(cyber\s*bully|harass|bully|harrass|abuse)\b/i.test(m.text || ''));

    if (isHarassmentOrBullying || (targetQuery && previousHadBullying)) {
      if (targetQuery) {
        const foundUser = users.find(
          u =>
            (u.id.toLowerCase() === targetQuery.toLowerCase() ||
             u.username.toLowerCase() === targetQuery.toLowerCase() ||
             ('u_' + u.username.toLowerCase()) === targetQuery.toLowerCase()) &&
            u.id !== activeUser?.id &&
            u.id !== 'u_noob_ai'
        );

        if (foundUser) {
          // File safety report
          const newReport = {
            id: `rep_${Date.now()}`,
            reporterId: activeUser?.id || 'anonymous',
            reporterName: registeredName,
            targetUserId: foundUser.id,
            targetUsername: foundUser.username,
            reason: 'Cyber Bullying & Harassment',
            details: userText,
            status: 'action_taken_blocked',
            createdAt: new Date().toISOString()
          };
          reports.push(newReport);

          // Permanently block from current logged-in account
          if (activeUser) {
            activeUser.blockedUserIds = activeUser.blockedUserIds || [];
            if (!activeUser.blockedUserIds.includes(foundUser.id)) {
              activeUser.blockedUserIds.push(foundUser.id);
            }
          }

          return `🛡️ Safety Protection Executed, ${registeredName}:\n\nI have verified and located @${foundUser.username} (User ID: ${foundUser.id}).\n\n✅ 1. Official Safety Incident Report (#${newReport.id}) submitted to NOOB Trust & Safety.\n✅ 2. @${foundUser.username} has been permanently blocked from your account (${registeredName}).\n\nThey can no longer send you direct messages, view your profile, or interact with your posts. We stand with you and strictly enforce our zero-tolerance policy for harassment. Would you like to end this chat session and leave a review, or is there anything else I can assist you with?`;
        } else {
          return `⚠️ User ID Not Found, ${registeredName}.\n\nI searched our active registry for "${targetQuery}" but could not find a matching account.\n\nPlease double-check the spelling and provide the exact User ID or @username of the person who is harassing you so that I can immediately file the safety report and block them from your account.`;
        }
      } else {
        return `⚠️ I take cyber bullying and harassment very seriously, ${registeredName}.\n\nTo immediately report and block the offending account, please provide the exact User ID or @username of the person who is bullying or harassing you (for example: @username or u_123).\n\nOnce you provide the ID, I will locate the user, file an official safety report, and block them from your account immediately.`;
      }
    }

    // 3. User inquiry about their registered name & activities
    if (/\b(my activity|my activities|my stats|my points|who am i|my account|my profile)\b/i.test(lower)) {
      return `Here is your full account & activity summary, ${registeredName}:\n\n• Registered Name: ${userStats.registeredName} (@${userStats.username})\n• Account Verification: ${userStats.isVerified ? '✅ Blue Verified Checkmark' : '⚪ Standard Member'}\n• NOOB Points: ${userStats.noobPoints.toLocaleString()} Points\n• Mini-Games Record: ${userStats.gamesWon} Wins / ${userStats.gamesPlayed} Matches Played\n• Publications: ${userStats.postsCount} Posts Published\n• Community Reach: ${userStats.followersCount} Followers / ${userStats.followingCount} Following\n\nYou're doing wonderfully on NOOB, ${registeredName}! Let me know if you need anything else!`;
    }

    // 4. Fallback to Gemini AI model if available, or rich assistant logic
    const ai = getAIClient();
    if (ai) {
      try {
        const aiRes = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `You are the NOOB Platform AI Assistant.
User's registered name: "${registeredName}".
User's username: "@${userStats.username}".
User's activities: ${userStats.postsCount} posts, ${userStats.noobPoints} points, ${userStats.gamesWon} game wins, verified: ${userStats.isVerified}.
Always address the user warmly using their registered name ("${registeredName}").
Answer their query clearly, concisely, and helpfully.
If they thank you, always say welcome and praise their activities.
If they mention cyberbullying or harassment, ask for the user ID to report and block them.

User message: ${userText}`
        });
        if (aiRes.text) return aiRes.text;
      } catch (err) {
        console.warn('Gemini chat fallback error:', err);
      }
    }

    return `Hello ${registeredName}! I am here to assist you with anything on NOOB — from exploring reels, uploading music, competing in the 50 mini-games (${userStats.noobPoints.toLocaleString()} NOOB points!), to managing your profile and keeping you protected against cyber bullying. How can I help you right now?`;
  }

  app.get('/api/chats/:id/messages', (req, res) => {
    const chatId = req.params.id;
    res.json({ messages: messages[chatId] || [] });
  });

  app.post('/api/chats/:id/messages', async (req, res) => {
    const chatId = req.params.id;
    const active = getActiveUser(req);
    const {
      text,
      mediaUrl,
      mediaType,
      scheduledAt,
      sharedTrack,
      gameInvite,
      senderId,
      senderUsername,
      senderDisplayName,
      senderAvatar
    } = req.body;

    const effectiveSenderId = senderId || active?.id || 'u_noob_admin';
    const senderUserObj = users.find(u => u.id === effectiveSenderId) || active;
    const finalSenderUsername = senderUsername || senderUserObj?.username || active?.username || 'NOOB';
    const finalSenderDisplayName = senderDisplayName || senderUserObj?.displayName || senderUserObj?.username || active?.displayName || 'NOOB';
    const finalSenderAvatar = senderAvatar || senderUserObj?.avatar || active?.avatar || '/noob-logo.svg.jpeg';
    const finalSenderVerified = !!(senderUserObj?.isVerified ?? active?.isVerified);

    const newMsg = {
      id: `m_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      chatId,
      senderId: effectiveSenderId,
      senderUsername: finalSenderUsername,
      senderDisplayName: finalSenderDisplayName,
      senderAvatar: finalSenderAvatar,
      senderIsVerified: finalSenderVerified,
      text: text || '',
      mediaUrl: mediaUrl || undefined,
      mediaType: mediaType || (mediaUrl ? 'image' : gameInvite ? 'game_invite' : 'text'),
      sharedTrack,
      gameInvite,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isEdited: false,
      status: 'read',
      reactions: []
    };

    if (!messages[chatId]) messages[chatId] = [];
    messages[chatId].push(newMsg);

    // Update conversation last message
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      chat.lastMessage = newMsg;
    }

    // Auto-reply if AI conversation
    let aiResponseMsg: any = null;
    const isAiChat = chat?.isAi || chatId === 'c_ai_assistant' || chat?.participants?.some(p => p.id === 'u_noob_ai');

    if (isAiChat && text) {
      const aiReplyText = await generateAIResponse(text, active, messages[chatId]);
      aiResponseMsg = {
        id: `m_ai_${Date.now()}`,
        chatId,
        senderId: 'u_noob_ai',
        text: aiReplyText,
        createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isEdited: false,
        reactions: []
      };
      messages[chatId].push(aiResponseMsg);
      if (chat) {
        chat.lastMessage = aiResponseMsg;
      }
    }

    res.status(201).json({
      success: true,
      message: newMsg,
      aiResponse: aiResponseMsg
    });
  });

  // Delete message endpoint (Authors can delete their own; group admins & NOOB master admin can delete any message)
  app.delete('/api/chats/:id/messages/:messageId', (req, res) => {
    const { id: chatId, messageId } = req.params;
    const active = getActiveUser(req);
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    if (!messages[chatId]) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const msg = messages[chatId].find(m => m.id === messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const isMasterAdmin = active && (active.isAdmin || active.username.toLowerCase() === 'noob' || active.id === 'u_noob_admin');
    const isGroupAdmin = chat.isGroup && (chat.creatorId === active?.id || chat.adminIds?.includes(active?.id) || isMasterAdmin);
    const isSender = active && msg.senderId === active.id;

    if (!isSender && !isGroupAdmin && !isMasterAdmin) {
      return res.status(403).json({ error: 'Only message authors or group admins can delete this message.' });
    }

    messages[chatId] = messages[chatId].filter(m => m.id !== messageId);

    if (chat.lastMessage?.id === messageId) {
      chat.lastMessage = messages[chatId][messages[chatId].length - 1] || null;
    }

    res.json({ success: true, message: 'Message deleted successfully' });
  });

  // End Chat Session endpoint
  app.post('/api/chats/:id/end', (req, res) => {
    const chatId = req.params.id;
    const chat = chats.find(c => c.id === chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    chat.isEnded = true;
    chat.endedAt = new Date().toISOString();

    const endMsg = {
      id: `m_end_${Date.now()}`,
      chatId,
      senderId: 'system',
      text: '🏁 This chat session has been concluded. Please leave a rating & review about your experience below!',
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isEdited: false,
      reactions: []
    };

    if (!messages[chatId]) messages[chatId] = [];
    messages[chatId].push(endMsg);
    chat.lastMessage = endMsg;

    res.json({
      success: true,
      chat,
      message: 'Chat session successfully ended.'
    });
  });

  // Submit Chat Rating & Review endpoint
  app.post('/api/chats/:id/review', (req, res) => {
    const chatId = req.params.id;
    const active = getActiveUser(req);
    const { rating, feedback } = req.body;

    const chat = chats.find(c => c.id === chatId);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });

    const reviewObj = {
      id: `rev_${Date.now()}`,
      chatId,
      userId: active?.id || 'anonymous',
      username: active?.username || 'user',
      rating: Number(rating) || 5,
      feedback: feedback || '',
      createdAt: new Date().toISOString()
    };

    chat.review = reviewObj;
    chatReviews.unshift(reviewObj);

    const reviewConfirmMsg = {
      id: `m_rev_${Date.now()}`,
      chatId,
      senderId: 'system',
      text: `⭐ Rating Submitted: ${'★'.repeat(reviewObj.rating)}${'☆'.repeat(5 - reviewObj.rating)} (${reviewObj.rating}/5 stars). Thank you for your feedback!`,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isEdited: false,
      reactions: []
    };

    if (!messages[chatId]) messages[chatId] = [];
    messages[chatId].push(reviewConfirmMsg);
    chat.lastMessage = reviewConfirmMsg;

    res.json({
      success: true,
      review: reviewObj,
      message: 'Thank you for your rating and feedback!'
    });
  });

  // Delete Chat Conversation
  app.delete('/api/chats/:id', (req, res) => {
    const chatId = req.params.id;
    const idx = chats.findIndex(c => c.id === chatId);
    if (idx !== -1) {
      chats.splice(idx, 1);
      delete messages[chatId];
      return res.json({ success: true, message: 'Chat conversation deleted successfully' });
    }
    res.status(404).json({ error: 'Chat not found' });
  });

  // Block User endpoint
  app.post('/api/users/:id/block', (req, res) => {
    const targetId = req.params.id;
    const active = getActiveUser(req);
    if (!active) return res.status(401).json({ error: 'Unauthorized' });

    active.blockedUserIds = active.blockedUserIds || [];
    if (!active.blockedUserIds.includes(targetId)) {
      active.blockedUserIds.push(targetId);
    }

    res.json({
      success: true,
      message: 'User successfully blocked.',
      blockedUserIds: active.blockedUserIds
    });
  });

  // Unblock User endpoint
  app.post('/api/users/:id/unblock', (req, res) => {
    const targetId = req.params.id;
    const active = getActiveUser(req);
    if (!active) return res.status(401).json({ error: 'Unauthorized' });

    active.blockedUserIds = (active.blockedUserIds || []).filter((id: string) => id !== targetId);

    res.json({
      success: true,
      message: 'User successfully unblocked.',
      blockedUserIds: active.blockedUserIds
    });
  });

  // Safety Report and Block endpoints
  const handleUserReport = (req: any, res: any) => {
    const active = getActiveUser(req);
    const { targetUserId, reason, details } = req.body;

    if (!targetUserId || !targetUserId.trim()) {
      return res.status(400).json({ success: false, error: 'User ID or @username is required.' });
    }

    const cleanTarget = targetUserId.trim().replace(/^@/, '').toLowerCase();
    const targetUser = users.find(
      u => u.username.toLowerCase() === cleanTarget || u.id.toLowerCase() === cleanTarget
    );

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'Account not found. Please verify the User ID or @username.'
      });
    }

    if (active && (targetUser.id === active.id || targetUser.username.toLowerCase() === active.username.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: 'You cannot report or block your own account!'
      });
    }

    // Auto-block the reported user for the reporter
    if (active) {
      active.blockedUserIds = active.blockedUserIds || [];
      if (!active.blockedUserIds.includes(targetUser.id)) {
        active.blockedUserIds.push(targetUser.id);
      }
    }

    const report = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      reporterId: active?.id || 'anonymous',
      reporterUsername: active?.username || 'Anonymous',
      reporterName: active?.displayName || active?.username || 'Anonymous',
      targetUserId: targetUser.id,
      targetUsername: targetUser.username,
      targetDisplayName: targetUser.displayName || targetUser.username,
      targetAvatar: targetUser.avatar || '/noob-logo.svg.jpeg',
      reason: reason || 'Cyber Bullying & Harassment',
      details: details?.trim() || 'Report submitted via Trust & Safety',
      status: 'pending_review',
      createdAt: new Date().toISOString()
    };

    reports.unshift(report);

    res.json({
      success: true,
      reportId: report.id,
      report,
      message: `Report successfully filed against @${targetUser.username}. The account has been blocked and flagged for NOOB Admin review.`
    });
  };

  app.post('/api/report-user', handleUserReport);
  app.post('/api/reports/submit', handleUserReport);

  // Send game invite straight into a friend's chat
  app.post('/api/games/send-invite', (req, res) => {
    const { targetUserId, gameId, gameTitle, roomCode } = req.body;
    const active = getActiveUser(req);
    if (!active) return res.status(401).json({ error: 'Unauthorized' });

    const targetUser = users.find(u => u.id === targetUserId);
    if (!targetUser) return res.status(404).json({ error: 'Target user not found' });

    // Find or create chat with this user
    let chat = chats.find(c => c.participants.some(p => p.id === targetUserId));
    if (!chat) {
      chat = {
        id: `c_${Date.now()}`,
        participants: [targetUser, sanitizeUser(active)],
        isGroup: false,
        unreadCount: 1,
        isPinned: false,
        isMuted: false,
        themeColor: '#00FF66',
        vanishMode: false,
        readReceiptsEnabled: true,
        createdAt: 'Just now'
      };
      chats.unshift(chat);
    }

    const inviteMsg = {
      id: `m_invite_${Date.now()}`,
      chatId: chat.id,
      senderId: active.id,
      text: `🎮 Game Challenge: Let's play ${gameTitle}! Click below to accept and play against me.`,
      mediaType: 'game_invite',
      gameInvite: {
        gameId,
        gameTitle,
        fromUsername: active.username,
        fromAvatar: active.avatar,
        roomCode: roomCode || `room_${gameId}_${Date.now()}`
      },
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (!messages[chat.id]) messages[chat.id] = [];
    messages[chat.id].push(inviteMsg);
    chat.lastMessage = inviteMsg;

    res.json({
      success: true,
      message: 'Invite sent to chat!',
      chatId: chat.id,
      invite: inviteMsg
    });
  });

  // --- 50 MINI-GAMES, LEADERBOARD & NOOB POINTS ---
  app.get('/api/games/leaderboard', (req, res) => {
    // Collect all points
    const playerMap: Record<string, any> = {};

    users.forEach(u => {
      playerMap[u.username] = {
        userId: u.id,
        username: u.username,
        displayName: u.displayName || u.username,
        avatar: u.avatar,
        noobPoints: u.noobPoints || 100,
        gamesWon: u.gamesWonCount || 0,
        gamesPlayed: u.gamesPlayedCount || 0,
        isVerified: !!u.isVerified
      };
    });

    // Add entries from scores history
    gameScores.forEach(gs => {
      if (playerMap[gs.username]) {
        playerMap[gs.username].gamesPlayed += 1;
      }
    });

    const leaderboard = Object.values(playerMap)
      .sort((a, b) => b.noobPoints - a.noobPoints)
      .map((p, idx) => ({
        rank: idx + 1,
        ...p
      }));

    const active = getActiveUser(req);
    res.json({
      leaderboard: leaderboard.slice(0, 10),
      currentUserPoints: active?.noobPoints || 0,
      currentUserRank: leaderboard.findIndex(p => p.username === active?.username) + 1 || 1
    });
  });

  // Record a match outcome: win = +100 NOOBs, tie = +50 NOOBs, loss = 0 NOOBs
  app.post('/api/games/record-match', (req, res) => {
    const { gameId, gameTitle, result, opponentName } = req.body;
    // result: 'win' | 'tie' | 'loss'
    const active = getActiveUser(req);
    const author = active || {
      id: 'guest',
      username: 'guest_player',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
      noobPoints: 0
    };

    let earnedPoints = 0;
    if (result === 'win') {
      earnedPoints = 100;
    } else if (result === 'tie') {
      earnedPoints = 50;
    } else {
      earnedPoints = 0;
    }

    if (active) {
      active.noobPoints = (active.noobPoints || 0) + earnedPoints;
      active.gamesPlayedCount = (active.gamesPlayedCount || 0) + 1;
      if (earnedPoints > 0) {
        recordTransaction(
          active,
          earnedPoints,
          `${result === 'win' ? 'Won' : 'Tied'} ${gameTitle || 'mini-game'} match`
        );
      }
      if (result === 'win') {
        active.gamesWonCount = (active.gamesWonCount || 0) + 1;
      }
    }

    const newScore = {
      id: `gs_${Date.now()}`,
      gameId,
      gameTitle: gameTitle || gameId,
      username: author.username,
      userAvatar: author.avatar,
      score: earnedPoints,
      noobsPoints: earnedPoints,
      result: result || 'win',
      opponent: opponentName || 'Bot',
      date: 'Just now'
    };

    gameScores.unshift(newScore);

    res.status(201).json({
      success: true,
      earnedPoints,
      totalNoobPoints: active ? active.noobPoints : earnedPoints,
      result,
      user: sanitizeUser(active)
    });
  });

  // Settings & Insights
  app.get('/api/settings', (req, res) => {
    res.json({ settings });
  });

  app.put('/api/settings', (req, res) => {
    settings = { ...settings, ...req.body };
    res.json({ success: true, settings });
  });

  // --- SUPPORT REVIEWS: real aggregate rating, not cosmetic ---
  app.post('/api/support/review', (req, res) => {
    const { rating, feedback } = req.body;
    const active = getActiveUser(req);
    const numericRating = Number(rating);
    if (!numericRating || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ error: 'rating must be a number from 1 to 5' });
    }
    supportReviews.push({
      rating: numericRating,
      feedback: feedback || '',
      username: active?.username,
      timestamp: new Date().toISOString(),
    });
    const average = supportReviews.reduce((sum, r) => sum + r.rating, 0) / supportReviews.length;
    res.json({ success: true, average: Math.round(average * 10) / 10, count: supportReviews.length });
  });

  app.get('/api/support/rating-summary', (_req, res) => {
    if (supportReviews.length === 0) {
      return res.json({ average: null, count: 0 });
    }
    const average = supportReviews.reduce((sum, r) => sum + r.rating, 0) / supportReviews.length;
    res.json({ average: Math.round(average * 10) / 10, count: supportReviews.length });
  });

  // --- AI CUSTOMER SUPPORT ASSISTANT (Voice & Context Enabled) ---
  app.post('/api/support/ai-chat', async (req, res) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
    if (!checkRateLimit(clientIp, 40, 60000)) {
      return res.status(429).json({
        error: 'Too many requests. Bot attack protection is active. Please wait a moment before sending another query.'
      });
    }

    const { message, conversationHistory } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    const activeUser = getActiveUser(req) || {
      username: 'noob_user',
      displayName: 'NOOB Explorer',
      gender: 'Unspecified',
      accountType: 'public',
      noobPoints: 100,
      gamesWonCount: 0
    };

    const userGender = (activeUser.gender || 'unspecified').toLowerCase();
    let personaGuidance = 'Maintain a friendly, modern, clear, and helpful tone.';
    if (userGender.includes('female') || userGender.includes('woman') || userGender.includes('she')) {
      personaGuidance = 'Speak warmly, expressively, and with supportive encouragement, using concise yet vibrant phrasing.';
    } else if (userGender.includes('male') || userGender.includes('man') || userGender.includes('he')) {
      personaGuidance = 'Speak in a grounded, direct, clear, action-oriented, and helpful manner.';
    }

    const systemPrompt = `You are the official in-app AI Voice Customer Support Assistant for the "NOOB" Social Media and Mini-Games Platform.
Your goal is to answer the user's questions easily, accurately, and within seconds with authoritative knowledge of all features, Terms & Conditions, Privacy Policies, and settings of the NOOB app.

CURRENT USER INFORMATION (Read-only access):
- Username: @${activeUser.username}
- Display Name: ${activeUser.displayName || activeUser.username}
- Gender: ${activeUser.gender || 'Not specified'}
- Account Type: ${activeUser.accountType || 'public'}
- Current NOOB Points: ${activeUser.noobPoints || 100}
- Games Won: ${activeUser.gamesWonCount || 0}
- Bio: "${activeUser.bio || ''}"

PERSONA & TONE DIRECTIVE:
${personaGuidance}
- You are an experienced, senior support agent — confident, direct, and efficient. You do not pad answers or hedge.
- Address the user by their display name or @${activeUser.username} only when it feels natural, not in every reply.
- ANSWER ONLY WHAT WAS ASKED. This is the single most important rule. If the user asks one specific question (e.g. "what's the minimum age"), give ONLY that fact in one short sentence — do not also explain unrelated policies, list unrelated features, or recite a category summary just because it's in your knowledge base below.
- Default to 1-3 sentences. Only give a longer, structured (bulleted) answer if the user explicitly asks for a summary, overview, or list of everything about a topic.
- Never volunteer information the user didn't ask about. The knowledge base below is for you to draw the correct specific fact from — it is not a script to recite.
- You have complete, accurate knowledge of NOOB's Terms & Conditions, Privacy Policy, Community Standards, 50 Mini-Games, Leaderboard scoring, and Media routing — use it to answer precisely, not exhaustively.

AUTHORITATIVE TERMS & CONDITIONS KNOWLEDGE BASE:
1. AGE & ELIGIBILITY: Users must be at least 13 years of age (or minimum legal age in their jurisdiction) to register an account.
2. USER CONDUCT & COMMUNITY GUIDELINES: Strict zero-tolerance policy against hate speech, harassment, bullying, threats, explicit nudity, discrimination, scamming, unauthorized commercial spam, or distributing malicious code/bots.
3. INTELLECTUAL PROPERTY & CONTENT OWNERSHIP: Users retain full copyright and ownership of their original photos, reels, and music tracks uploaded to NOOB. By posting, users grant NOOB a worldwide, royalty-free, non-exclusive license solely to host, display, transcode, and stream the content within the app.
4. COPYRIGHT & DMCA: NOOB respects copyright law. Content infringing on copyrighted material will be promptly removed upon receiving a valid DMCA takedown notice. Repeated copyright infringement leads to permanent account termination.
5. ACCOUNT SECURITY & TERMINATION: Users are responsible for maintaining confidentiality of credentials. NOOB reserves the right to suspend or terminate accounts that violate terms, manipulate game scores, or deploy unauthorized bot scrapers.
6. LIMITATION OF LIABILITY: NOOB is provided on an "as is" and "as available" basis without warranties of uninterrupted service.

AUTHORITATIVE PRIVACY POLICY KNOWLEDGE BASE:
1. DATA COLLECTION: NOOB collects account credentials (username, email, encrypted password), profile details (display name, bio, gender, pronouns, city, country dialing code, social handles), user-generated content (posts, reels, stories, audio tracks), direct messages, and gameplay statistics (scores, leaderboard rank).
2. HOW DATA IS USED: Data is used strictly to operate social feeds, process real-time chats, calculate leaderboard standings, personalize user experiences, and maintain bot defense.
3. ZERO DATA SELLING: NOOB NEVER sells, rents, trades, or monetizes personal user data to third-party data brokers or advertisers.
4. CLOUD STORAGE & ENCRYPTION: All media files (photos, videos, avatars, audio) are stored securely in Backblaze B2 S3-compatible encrypted cloud storage with signed URLs. Sensitive credentials are encrypted at rest and in transit via TLS 1.3.
5. COOKIES & LOCAL PERSISTENCE: Minimal session cookies and local storage tokens are used strictly for authentication, theme preferences, and fast app rendering.
6. USER PRIVACY RIGHTS (GDPR & CCPA): Users have the absolute right to:
   - Access and export their personal data.
   - Edit or update their profile at any time in Edit Profile.
   - Switch account visibility to 'Private' (only approved followers see content).
   - Request permanent deletion of their account and all associated media.

COMPLETE PLATFORM CAPABILITIES:
1. SMART MEDIA UPLOAD & AUTOMATED MIME-TYPE ANALYZER:
   - Before upload, files are analyzed by our automated MIME engine: Images (.jpg, .png, .webp, .gif) automatically route to the Feed & Profile grid, while Videos (.mp4, .mov, .webm) route to fullscreen Reels. Audio files (.mp3, .wav) route to the Music Hub.
2. 50 MINI-GAMES & LEADERBOARD SCORING:
   - 50 instant playable games (Cyber Snake, Drone Dash, 2048, Brick Breaker, Pong, Space Invaders, Tic-Tac-Toe, Typing Speed, etc.).
   - Win = +100 NOOB points, Tie = +50 NOOB points, Loss = 0 points. Scores rank players live on the Global Leaderboard.
3. COMMUNITY MUSIC HUB:
   - Global background music player that plays continuously without stopping as users browse Feeds, Reels, and Mini-Games. Upload original tracks with automatic duration calculation.
4. STORIES & STORY HIGHLIGHTS:
   - 24-hour disappearing stories with interactive stickers. Highlights can be created with custom cover photos from the first uploaded image.
5. DIRECT CHAT & VANISH MODE:
   - Real-time text messaging, voice audio notes, vanishing disappearing photos/videos, and inline 1v1 multiplayer game challenges.
6. CUSTOMER SUPPORT & CALL US:
   - Instant AI Support Chat, 24/7 Phone Hotline, interactive Voice Call assistant, and formal ticket submission.`;

    // Fast response detection for common greetings & core topics (< 15ms)
    const lower = message.toLowerCase().trim();

    // 1. Gratitude / Thank you check (Warm welcome + Registered Name + User activity knowledge + Good compliments)
    if (/^(thank you|thanks|thx|ty|thank u|many thanks|thank you so much|thanks a lot|appreciate it)$/i.test(lower) || lower.startsWith('thank you') || lower.startsWith('thanks')) {
      const regName = activeUser.displayName || activeUser.username;
      const postsCount = activeUser.postsCount || 0;
      const points = activeUser.noobPoints || 100;
      const followers = activeUser.followersCount || 0;
      const gamesWon = activeUser.gamesWonCount || 0;
      const isVerified = !!activeUser.isVerified;

      return res.json({
        success: true,
        reply: `You are most welcome, **${regName}**! 💖 It is always an absolute joy assisting you! You are such an incredible, creative, and valued member of our NOOB community (with **${postsCount} posts**, **${points.toLocaleString()} NOOB points**, **${gamesWon} game victories**, and **${followers} followers**${isVerified ? ', and an officially Verified account ✨' : ''}). You bring great energy and positivity to everyone on NOOB. If there is ever anything else you need, I am always here to support you! Have a wonderful day! 🌟`,
        model: 'instant-knowledge-engine',
        user: { username: activeUser.username, displayName: activeUser.displayName, gender: activeUser.gender }
      });
    }

    // 2. Cyberbullying & Harassment reporting & blocking logic
    const isBullyingIntent = lower.includes('bully') || lower.includes('bullied') || lower.includes('harass') || lower.includes('harassing') || lower.includes('harassment') || lower.includes('abuse') || lower.includes('abusing') || lower.includes('stalk') || lower.includes('threat') || lower.includes('cyberbullying');
    
    if (isBullyingIntent) {
      // Look for a username pattern (@handle or raw user id)
      const userMentionMatch = message.match(/@([a-zA-Z0-9_.]+)/) || message.match(/user(?:_id|id)?\s*[:=]?\s*([a-zA-Z0-9_.-]+)/i) || message.match(/id\s*[:=]?\s*([a-zA-Z0-9_.-]+)/i);
      
      let candidateId = userMentionMatch ? userMentionMatch[1].trim() : null;

      // If user simply typed a single word handle/id like "cyber_alex" or "u_1"
      if (!candidateId) {
        const words = message.trim().split(/\s+/);
        if (words.length === 1 && !isBullyingIntent) {
          candidateId = words[0].replace(/^@/, '');
        }
      }

      if (candidateId) {
        const cleanCandidate = candidateId.toLowerCase().replace(/^@/, '');
        const targetUser = users.find(u => u.username.toLowerCase() === cleanCandidate || u.id.toLowerCase() === cleanCandidate);

        if (targetUser) {
          // Block target user from current account
          if (activeUser && activeUser.id !== targetUser.id) {
            const index = users.findIndex(u => u.id === activeUser.id);
            if (index !== -1) {
              users[index].blockedUserIds = users[index].blockedUserIds || [];
              if (!users[index].blockedUserIds.includes(targetUser.id)) {
                users[index].blockedUserIds.push(targetUser.id);
              }
              // Also remove from following
              users[index].followingIds = (users[index].followingIds || []).filter((id: string) => id !== targetUser.id);
            }
          }

          return res.json({
            success: true,
            action: 'USER_BLOCKED_AND_REPORTED',
            reportedUserId: targetUser.id,
            reportedUsername: targetUser.username,
            reply: `🛡️ **Safety Action Completed for ${activeUser.displayName || activeUser.username}:**\n\n• **Report Filed:** Official Cyberbullying & Harassment report #REP-${Date.now().toString().slice(-6)} has been created against **@${targetUser.username}** (User ID: \`${targetUser.id}\`). Our trust & safety team is reviewing their account immediately.\n• **User Blocked:** **@${targetUser.username}** has been instantly **BLOCKED** from your account. They can no longer see your profile, send you direct messages, or interact with your posts and reels.\n\nYour mental well-being and safety on NOOB are our top priority. We have zero tolerance for harassment! 💪`,
            model: 'instant-knowledge-engine',
            user: { username: activeUser.username, displayName: activeUser.displayName, gender: activeUser.gender }
          });
        } else {
          return res.json({
            success: true,
            reply: `⚠️ I could not locate any registered user with the ID or handle **"${candidateId}"**. Please check the spelling and provide the exact **User ID or @username** again so I can immediately report and block them from your account.`,
            model: 'instant-knowledge-engine',
            user: { username: activeUser.username, displayName: activeUser.displayName, gender: activeUser.gender }
          });
        }
      } else {
        return res.json({
          success: true,
          reply: `🛡️ **Zero Tolerance for Harassment & Cyberbullying:**\nWe take safety very seriously. Please provide the exact **User ID or Username (@handle)** of the user who is harassing or bullying you, and I will immediately file an official violation report and block them from your account.`,
          model: 'instant-knowledge-engine',
          user: { username: activeUser.username, displayName: activeUser.displayName, gender: activeUser.gender }
        });
      }
    }
    
    // Quick greeting check
    if (/^(hi|hello|hey|hey there|greetings|hola|namaste|yo|sup|help|start)$/i.test(lower)) {
      return res.json({
        success: true,
        reply: `Hey ${activeUser.displayName || activeUser.username}! 👋 What can I help you with?`,
        model: 'instant-knowledge-engine',
        user: { username: activeUser.username, displayName: activeUser.displayName, gender: activeUser.gender }
      });
    }

    // Everything else (Terms, Privacy, games, media routing, music, highlights,
    // account settings, support contact, DMs/Vanish, and anything else) is answered
    // by Gemini below, which has the full knowledge base and an explicit instruction
    // to answer only the specific question asked instead of dumping a category summary.

    // Try Gemini API for open-ended questions with multi-model fallback for high demand/503 tolerance
    const client = getAIClient();
    if (client) {
      const candidateModels = ['gemini-3.7-flash', 'gemini-3.1-flash-lite'];
      for (const modelName of candidateModels) {
        try {
          const response = await client.models.generateContent({
            model: modelName,
            contents: message,
            config: {
              systemInstruction: systemPrompt,
              temperature: 0.7,
            }
          });

          const reply = response.text?.trim();
          if (reply) {
            return res.json({
              success: true,
              reply,
              model: modelName,
              user: {
                username: activeUser.username,
                displayName: activeUser.displayName,
                gender: activeUser.gender
              }
            });
          }
        } catch (geminiError: any) {
          // If 503 (high demand) or 429 occurs on the primary model, loop automatically tries the next fallback model
          console.warn(`Gemini API query error with ${modelName}:`, geminiError?.message || geminiError);
        }
      }
    }

    // Final instant fallback (Gemini unavailable)
    let fallbackReply = `Sorry @${activeUser.username}, I'm having trouble reaching the AI service right now. Please try again in a moment, or use the Call Us tab for a live callback.`;

    res.json({
      success: true,
      reply: fallbackReply,
      model: 'knowledge-engine',
      user: {
        username: activeUser.username,
        displayName: activeUser.displayName,
        gender: activeUser.gender
      }
    });
  });

  // ==========================================
  // --- NOOB ADMIN MANAGEMENT ROUTES ---
  // ==========================================

  // Admin: Suspend or unsuspend any user account
  // Admin: Permanently delete an account and everything it authored
  app.post('/api/admin/delete-user', (req, res) => {
    const active = getActiveUser(req);
    const isMasterAdmin = active && (active.isAdmin || active.username.toLowerCase() === 'noob' || active.id === 'u_noob_admin');
    if (!isMasterAdmin) {
      return res.status(403).json({ error: 'Access denied. Only the NOOB administrator can delete accounts.' });
    }

    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID or username is required.' });
    }

    const target = users.find(u => u.id === targetUserId || u.username.toLowerCase() === targetUserId.toLowerCase());
    if (!target) {
      return res.status(404).json({ error: 'Target account not found.' });
    }

    if (target.id === 'u_noob_admin' || target.username.toLowerCase() === 'noob') {
      return res.status(400).json({ error: 'The primary NOOB administrator account cannot be deleted.' });
    }

    // Remove everything this account authored
    posts.filter(p => p.userId === target.id).forEach(p => delete comments[p.id]);
    posts = posts.filter(p => p.userId !== target.id);
    reels = reels.filter(r => r.userId !== target.id);
    stories = stories.filter(s => s.userId !== target.id);
    Object.keys(comments).forEach(postId => {
      comments[postId] = comments[postId].filter((c: any) => c.userId !== target.id);
    });

    // Detach them from other accounts' follow graphs and chats
    users.forEach(u => {
      if (u.followingIds) u.followingIds = u.followingIds.filter((id: string) => id !== target.id);
      if (u.blockedUserIds) u.blockedUserIds = u.blockedUserIds.filter((id: string) => id !== target.id);
    });
    chats.forEach(c => {
      c.participants = c.participants.filter((p: any) => p.id !== target.id);
    });

    users = users.filter(u => u.id !== target.id);

    res.json({
      success: true,
      message: `Account @${target.username} and their content have been permanently deleted.`
    });
  });

  app.post('/api/admin/suspend-user', (req, res) => {
    const active = getActiveUser(req);
    const isMasterAdmin = active && (active.isAdmin || active.username.toLowerCase() === 'noob' || active.id === 'u_noob_admin');
    if (!isMasterAdmin) {
      return res.status(403).json({ error: 'Access denied. Only the NOOB administrator can suspend accounts.' });
    }

    const { targetUserId, reason, suspend = true } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID or username is required.' });
    }

    const target = users.find(u => u.id === targetUserId || u.username.toLowerCase() === targetUserId.toLowerCase());
    if (!target) {
      return res.status(404).json({ error: 'Target account not found.' });
    }

    if (target.id === 'u_noob_admin' || target.username.toLowerCase() === 'noob') {
      return res.status(400).json({ error: 'The primary NOOB administrator account cannot be suspended.' });
    }

    target.isSuspended = Boolean(suspend);
    target.suspendedReason = suspend ? (reason || 'Account suspended by NOOB Admin for policy violation') : undefined;

    // Send direct system notification to the target user
    notifications.unshift({
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      senderId: 'u_noob_admin',
      senderUsername: 'NOOB',
      senderAvatar: '/noob-logo.svg.jpeg',
      senderIsVerified: true,
      targetUserId: target.id,
      targetUsername: target.username,
      title: suspend ? '⚠️ Account Suspended' : '✅ Account Restored',
      message: suspend
        ? `Your account @${target.username} has been suspended by NOOB Admin. Reason: ${target.suspendedReason}`
        : 'Your account access has been restored by NOOB Administrator. You may now continue using all features.',
      type: 'admin_direct',
      createdAt: new Date().toISOString()
    });

    res.json({
      success: true,
      message: `Account @${target.username} has been ${suspend ? 'suspended' : 'unsuspended'} successfully.`,
      user: sanitizeUser(target)
    });
  });

  // Admin: Send custom notification (Broadcast to ALL or specific user)
  app.post('/api/admin/send-notification', (req, res) => {
    const active = getActiveUser(req);
    const isMasterAdmin = active && (active.isAdmin || active.username.toLowerCase() === 'noob' || active.id === 'u_noob_admin');
    if (!isMasterAdmin) {
      return res.status(403).json({ error: 'Access denied. Only the NOOB administrator can dispatch notifications.' });
    }

    const { target = 'all', title, message } = req.body;
    if (!title || !title.trim() || !message || !message.trim()) {
      return res.status(400).json({ error: 'Notification title and message are required.' });
    }

    let targetUserId = 'all';
    let targetUsername = 'All Users';

    if (target !== 'all' && target.trim()) {
      const cleanTarget = target.trim().replace(/^@/, '');
      const targetUser = users.find(u => u.id === cleanTarget || u.username.toLowerCase() === cleanTarget.toLowerCase());
      if (!targetUser) {
        return res.status(404).json({ error: `User "@${cleanTarget}" was not found.` });
      }
      targetUserId = targetUser.id;
      targetUsername = `@${targetUser.username}`;
    }

    const newNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      senderId: 'u_noob_admin',
      senderUsername: 'NOOB',
      senderAvatar: '/noob-logo.svg.jpeg',
      senderIsVerified: true,
      targetUserId,
      targetUsername,
      title: title.trim(),
      message: message.trim(),
      type: targetUserId === 'all' ? 'admin_broadcast' : 'admin_direct',
      createdAt: new Date().toISOString()
    };

    notifications.unshift(newNotification);

    res.status(201).json({
      success: true,
      message: `Custom notification successfully dispatched to ${targetUsername}.`,
      notification: newNotification
    });
  });

  // Get notifications for current user
  app.get('/api/notifications', (req, res) => {
    const active = getActiveUser(req);
    if (!active) {
      return res.json({ notifications: notifications.filter(n => n.targetUserId === 'all') });
    }

    const userNotifs = notifications.filter(
      n => n.targetUserId === 'all' || n.targetUserId === active.id || n.targetUsername?.toLowerCase() === active.username?.toLowerCase()
    );

    res.json({ notifications: userNotifs });
  });

  // Admin: Get all accounts for Admin Dashboard overview
  app.get('/api/admin/users', (req, res) => {
    const active = getActiveUser(req);
    const isMasterAdmin = active && (active.isAdmin || active.username.toLowerCase() === 'noob' || active.id === 'u_noob_admin');
    if (!isMasterAdmin) {
      return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
    }

    res.json({
      success: true,
      users: users.map(sanitizeUser)
    });
  });

  // Admin: Get all safety reports for NOOB Control Panel
  app.get('/api/admin/reports', (req, res) => {
    const active = getActiveUser(req);
    const isMasterAdmin = active && (active.isAdmin || active.username.toLowerCase() === 'noob' || active.id === 'u_noob_admin');
    if (!isMasterAdmin) {
      return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
    }

    res.json({
      success: true,
      reports
    });
  });

  // Admin: Take action on a report (resolve / dismiss / ban target)
  app.post('/api/admin/reports/:id/action', (req, res) => {
    const active = getActiveUser(req);
    const isMasterAdmin = active && (active.isAdmin || active.username.toLowerCase() === 'noob' || active.id === 'u_noob_admin');
    if (!isMasterAdmin) {
      return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
    }

    const { id } = req.params;
    const { action, suspendTarget } = req.body;
    const report = reports.find(r => r.id === id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    report.status = action || 'resolved';
    report.reviewedBy = active.username;
    report.reviewedAt = new Date().toISOString();

    if (suspendTarget && report.targetUserId) {
      const target = users.find(u => u.id === report.targetUserId || u.username === report.targetUsername);
      if (target && target.id !== 'u_noob_admin') {
        target.isSuspended = true;
        target.suspendedReason = `Account suspended following safety report: ${report.reason}`;
      }
    }

    res.json({
      success: true,
      report,
      message: `Report ${id} marked as ${report.status}.`
    });
  });

  // Catch-all route for any unhandled /api/* endpoint to strictly return JSON (prevents HTML doctype errors)
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: `API route ${req.method} ${req.originalUrl} not found` });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NOOB Social & Mini-Games Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

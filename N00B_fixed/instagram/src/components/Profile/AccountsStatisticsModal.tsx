import React, { useState } from 'react';
import {
  X,
  Trophy,
  Award,
  TrendingUp,
  ShieldCheck,
  Gamepad2,
  Share2,
  Coins,
  Star,
  Flame,
  CheckCircle2,
  Lock,
  ChevronRight,
  Info,
  Ticket,
  Send,
  QrCode,
  HeartHandshake,
  ChevronLeft
} from 'lucide-react';
import { User } from '../../types';
import { formatNoobPoints } from '../../utils/formatPoints';
import confetti from 'canvas-confetti';
import { CouponsModal } from './CouponsModal';
import { SendPointsPage } from './SendPointsPage';
import { ProfileQrModal } from './ProfileQrModal';
import { PaymentRequestsModal } from './PaymentRequestsModal';

interface AccountsStatisticsModalProps {
  currentUser: User;
  allUsers?: User[];
  onClose: () => void;
  onUserUpdated?: (user: User) => void;
}

interface BadgeItem {
  id: string;
  name: string;
  category: 'points' | 'gaming' | 'community' | 'creator';
  icon: string;
  description: string;
  requiredPoints?: number;
  requiredGames?: number;
  isUnlocked: boolean;
  unlockedDate?: string;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
}

export const AccountsStatisticsModal: React.FC<AccountsStatisticsModalProps> = ({
  currentUser,
  allUsers = [],
  onClose,
  onUserUpdated
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'badges' | 'history'>('overview');
  const [showCoupons, setShowCoupons] = useState(false);
  const [showSendPoints, setShowSendPoints] = useState(false);
  const [showMyQr, setShowMyQr] = useState(false);
  const [showPaymentRequests, setShowPaymentRequests] = useState(false);
  const exactPoints = currentUser.noobPoints ?? 150;
  const gamesWon = currentUser.gamesWonCount ?? 0;
  const gamesPlayed = currentUser.gamesPlayedCount ?? 0;
  const postsCount = currentUser.postsCount ?? 0;

  // Calculate Badges
  const badges: BadgeItem[] = [
    {
      id: 'b_welcome',
      name: 'NOOB Pioneer',
      category: 'community',
      icon: '🌱',
      description: 'Joined the official NOOB social network & completed onboarding',
      isUnlocked: true,
      unlockedDate: 'Day 1',
      rarity: 'Common'
    },
    {
      id: 'b_bronze',
      name: 'Rising Star',
      category: 'points',
      icon: '🥉',
      description: 'Accumulated over 100 total NOOB Points',
      requiredPoints: 100,
      isUnlocked: exactPoints >= 100,
      unlockedDate: exactPoints >= 100 ? 'Unlocked' : undefined,
      rarity: 'Common'
    },
    {
      id: 'b_silver',
      name: 'Arcade Ace',
      category: 'points',
      icon: '🥈',
      description: 'Accumulated over 500 total NOOB Points across the platform',
      requiredPoints: 500,
      isUnlocked: exactPoints >= 500,
      unlockedDate: exactPoints >= 500 ? 'Unlocked' : undefined,
      rarity: 'Rare'
    },
    {
      id: 'b_gold',
      name: 'Cyber Champion',
      category: 'points',
      icon: '👑',
      description: 'Reached the prestigious 1k (1,000+) NOOB Points threshold',
      requiredPoints: 1000,
      isUnlocked: exactPoints >= 1000,
      unlockedDate: exactPoints >= 1000 ? 'Unlocked' : undefined,
      rarity: 'Epic'
    },
    {
      id: 'b_diamond',
      name: 'Grand Legend',
      category: 'points',
      icon: '💎',
      description: 'Amassed an astounding 2,500+ NOOB Points in the global standings',
      requiredPoints: 2500,
      isUnlocked: exactPoints >= 2500,
      unlockedDate: exactPoints >= 2500 ? 'Unlocked' : undefined,
      rarity: 'Legendary'
    },
    {
      id: 'b_gamer',
      name: 'Arena Master',
      category: 'gaming',
      icon: '🕹️',
      description: 'Competed in 5 or more multiplayer mini-game challenges',
      requiredGames: 5,
      isUnlocked: gamesPlayed >= 5,
      unlockedDate: gamesPlayed >= 5 ? 'Unlocked' : undefined,
      rarity: 'Rare'
    },
    {
      id: 'b_winner',
      name: 'Victory Royale',
      category: 'gaming',
      icon: '🏆',
      description: 'Won 3 or more high-stakes PvP arena matches',
      isUnlocked: gamesWon >= 3,
      unlockedDate: gamesWon >= 3 ? 'Unlocked' : undefined,
      rarity: 'Epic'
    },
    {
      id: 'b_creator',
      name: 'Creative Spark',
      category: 'creator',
      icon: '🎨',
      description: 'Published your first community post or reel',
      isUnlocked: postsCount >= 1,
      unlockedDate: postsCount >= 1 ? 'Unlocked' : undefined,
      rarity: 'Common'
    },
    {
      id: 'b_verified',
      name: 'Trust Anchor',
      category: 'community',
      icon: '🛡️',
      description: 'Verified creator or active community contributor',
      isUnlocked: !!currentUser.isVerified,
      unlockedDate: currentUser.isVerified ? 'Active' : undefined,
      rarity: 'Epic'
    }
  ];

  const unlockedBadgesCount = badges.filter((b) => b.isUnlocked).length;

  const handleCelebrateBadge = (badge: BadgeItem) => {
    if (badge.isUnlocked) {
      confetti({ particleCount: 30, spread: 60, origin: { y: 0.6 } });
    }
  };

  const cardDigits = (currentUser.id || '').replace(/[^0-9a-f]/gi, '').slice(-4).toUpperCase().padStart(4, '0');
  const milestone = exactPoints < 500 ? 500 : exactPoints < 1000 ? 1000 : 2500;
  const tier = exactPoints >= 2500 ? 'GRAND LEGEND' : exactPoints >= 1000 ? 'CYBER CHAMPION' : exactPoints >= 500 ? 'ARCADE ACE' : 'PIONEER';

  const actions = [
    { label: 'Send points', sub: 'Gift points to a friend', button: 'Send', icon: <Send className="w-[18px] h-[18px]" />, run: () => setShowSendPoints(true) },
    { label: 'Requests', sub: 'See who asked you for points', button: 'Open', icon: <HeartHandshake className="w-[18px] h-[18px]" />, run: () => setShowPaymentRequests(true) },
    { label: 'Coupons', sub: 'Use them on Pro and Verified', button: 'Open', icon: <Ticket className="w-[18px] h-[18px]" />, run: () => setShowCoupons(true) }
  ];
  const tabs: { id: 'overview' | 'badges' | 'history'; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'badges', label: `Badges (${unlockedBadgesCount})` },
    { id: 'history', label: 'Transactions' }
  ];

  return (
    <div id="accounts-statistics-modal" data-noob-keep="1" data-testid="wallet-page" className="wl fixed inset-0 z-50 flex items-stretch justify-center p-0 animate-in fade-in duration-200">
      <div className="wl-scroll w-full h-full overflow-y-auto pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-xl px-4 space-y-5">
          {/* Header: back, title, QR */}
          <div className="relative flex items-center justify-between h-12">
            <button type="button" onClick={onClose} aria-label="Close" data-testid="wallet-back" className="wl-round">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="wl-title">Wallet</h2>
            <button type="button" onClick={() => setShowMyQr(true)} title="Your QR code: let someone scan it to send you NOOB Points" aria-label="Show your QR code" className="wl-round">
              <QrCode className="w-[18px] h-[18px]" />
            </button>
          </div>

          {/* The card */}
          <div data-testid="wallet-card" className="wl-card-main">
            <span aria-hidden="true" className="wl-shine" />
            <div className="relative flex items-start justify-between">
              <div className="min-w-0">
                <p className="wl-lab">Name</p>
                <p className="wl-name truncate">{currentUser.displayName || currentUser.username}</p>
                <p className="wl-dots" aria-hidden="true">••••&nbsp;&nbsp;••••&nbsp;&nbsp;••••&nbsp;&nbsp;{cardDigits}</p>
              </div>
              <span aria-hidden="true" className="wl-mark"><i /><i /></span>
            </div>
            <div className="relative flex items-end justify-between gap-3 mt-6">
              <div>
                <p className="wl-lab flex items-center gap-1.5"><Coins className="w-3.5 h-3.5" /> Balance</p>
                <p className="wl-balance">{formatNoobPoints(exactPoints)}</p>
                <p className="wl-exact">{exactPoints.toLocaleString()} exact pts</p>
              </div>
              <span className="wl-tier">{tier}</span>
            </div>
            <div className="relative mt-4">
              <div className="flex justify-between wl-lab mb-1">
                <span>Next milestone</span>
                <span className="text-white font-bold">{milestone.toLocaleString()} pts</span>
              </div>
              <div className="wl-bar"><div style={{ width: `${Math.min(100, Math.round((exactPoints / milestone) * 100))}%` }} /></div>
            </div>
          </div>

          {/* Actions, one row each */}
          <div className="wl-panel divide-y divide-[var(--wl-line)]" data-testid="wallet-actions">
            {actions.map((x) => (
              <div key={x.label} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
                <span className="wl-tile">{x.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="wl-row-title">{x.label}</p>
                  <p className="wl-row-sub truncate">{x.sub}</p>
                </div>
                <button type="button" onClick={x.run} className="wl-pill">{x.button}</button>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="wl-seg" role="tablist">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={activeSubTab === t.id} onClick={() => setActiveSubTab(t.id)} className={activeSubTab === t.id ? 'is-on' : ''}>{t.label}</button>
            ))}
          </div>

          {/* Tab 1: Overview */}
          {activeSubTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { k: 'Gaming won', v: gamesWon, n: '+50 pts / win' },
                  { k: 'Matches played', v: gamesPlayed, n: '+10 pts / game' },
                  { k: 'Posts & reels', v: postsCount, n: '+10M pts / post' },
                  { k: 'Followers', v: currentUser.followersCount || 0, n: 'Active reach' }
                ].map((s) => (
                  <div key={s.k} className="wl-panel !p-3.5">
                    <span className="wl-lab-dim">{s.k}</span>
                    <span className="wl-stat">{s.v}</span>
                    <span className="wl-note">{s.n}</span>
                  </div>
                ))}
              </div>
              <div className="wl-panel flex items-center gap-3">
                <Info className="w-5 h-5 shrink-0 wl-accent-text" />
                <div>
                  <p className="wl-row-title">Real-time sync</p>
                  <p className="wl-row-sub">Your points update at once when you win arcade challenges, share posts, or join in with the community.</p>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Badges */}
          {activeSubTab === 'badges' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {badges.map((b) => (
                <div key={b.id} onClick={() => handleCelebrateBadge(b)} className={`wl-panel !p-3.5 flex items-start gap-3 cursor-pointer ${b.isUnlocked ? '' : 'opacity-60'}`}>
                  <div className={`wl-tile !w-11 !h-11 text-xl ${b.isUnlocked ? '' : 'grayscale'}`}>{b.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="wl-row-title truncate">{b.name}</h4>
                      {b.isUnlocked ? (
                        <span className="wl-chip"><CheckCircle2 className="w-2.5 h-2.5" /> Unlocked</span>
                      ) : (
                        <span className="wl-row-sub flex items-center gap-0.5 !text-[9px]"><Lock className="w-2.5 h-2.5" /> Locked</span>
                      )}
                    </div>
                    <p className="wl-row-sub mt-0.5 leading-snug line-clamp-2">{b.description}</p>
                    <div className="flex items-center gap-2 mt-1.5 wl-row-sub !text-[9px] font-semibold">
                      <span className="capitalize">{b.category}</span>
                      <span>•</span>
                      <span className={b.rarity === 'Legendary' ? 'text-amber-500' : b.rarity === 'Epic' ? 'text-purple-500' : ''}>{b.rarity}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tab 3: Transactions and earning rules */}
          {activeSubTab === 'history' && (
            <div className="space-y-4">
              <div className="wl-panel space-y-1">
                <h4 className="wl-row-title flex items-center gap-1.5 mb-2"><Coins className="w-4 h-4 text-amber-500" /> Recent transactions</h4>
                {(!currentUser.noobTransactions || currentUser.noobTransactions.length === 0) ? (
                  <p className="wl-row-sub py-2">No transactions yet. Play a game, publish a post, or comment to start earning.</p>
                ) : (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto">
                    {currentUser.noobTransactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between py-2 border-b border-[var(--wl-line)] last:border-0">
                        <div className="min-w-0">
                          <p className="wl-row-title !font-semibold break-words" data-testid="points-reason">{tx.reason}</p>
                          <p className="wl-row-sub">{new Date(tx.timestamp).toLocaleString()}</p>
                        </div>
                        <span className={`text-xs font-bold shrink-0 pl-2 ${tx.amount > 0 ? 'wl-pos' : tx.amount < 0 ? 'wl-neg' : 'text-zinc-500'}`}>
                          {tx.amount > 0 ? '+' : ''}
                          {tx.amount.toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="wl-panel space-y-3">
                <h4 className="wl-row-title flex items-center gap-1.5"><Flame className="w-4 h-4 text-orange-500" /> How to earn noobPoints</h4>
                <div className="space-y-2.5 text-xs">
                  {[
                    ['🎮 Win PvP / mini-game matches', '+50 to +200 pts', 'wl-pos'],
                    ['📸 Publish an image post or reel', '+10,000,000 pts', 'wl-pos'],
                    ['💬 Every comment you write', '+1,000,000 pts', 'wl-pos'],
                    ['🏆 Top 10 global leaderboard finish', '+500 pts bonus', 'text-amber-500'],
                    ['🛡️ Responsible reporting & safety compliance', '+50 pts', 'text-cyan-500']
                  ].map(([a, b, c], i, all) => (
                    <div key={a} className={`flex items-center justify-between gap-3 ${i < all.length - 1 ? 'pb-2 border-b border-[var(--wl-line)]' : ''}`}>
                      <span className="wl-row-title !font-medium">{a}</span>
                      <span className={`font-bold shrink-0 ${c}`}>{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCoupons && <CouponsModal currentUser={currentUser} allUsers={allUsers} onClose={() => setShowCoupons(false)} />}

      {showSendPoints && (
        <SendPointsPage
          currentUser={currentUser}
          allUsers={allUsers}
          onClose={() => setShowSendPoints(false)}
          onUserUpdated={onUserUpdated}
        />
      )}

      {showMyQr && <ProfileQrModal targetUser={currentUser} onClose={() => setShowMyQr(false)} />}

      {showPaymentRequests && (
        <PaymentRequestsModal
          currentUser={currentUser}
          onClose={() => setShowPaymentRequests(false)}
          onUserUpdated={onUserUpdated}
        />
      )}
    </div>
  );
};

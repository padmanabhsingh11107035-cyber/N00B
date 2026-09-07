import React, { useState, useEffect } from 'react';
import {
  X,
  TrendingUp,
  Users,
  DollarSign,
  Briefcase,
  Share2,
  Award,
  Sparkles,
  BarChart2,
  CheckCircle2,
  Lock,
  ArrowUpRight,
  Heart,
  MessageCircle,
  Bookmark,
  Eye,
  RefreshCw
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';
import { User } from '../../types';
import { updateCurrentUser } from '../../services/api';

interface ProfessionalDashboardModalProps {
  currentUser: User;
  onClose: () => void;
  onUserUpdated?: (user: User) => void;
}

export const ProfessionalDashboardModal: React.FC<ProfessionalDashboardModalProps> = ({
  currentUser,
  onClose,
  onUserUpdated
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'insights' | 'partnerships' | 'monetization'>('insights');
  const [insights, setInsights] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [switchingToBusiness, setSwitchingToBusiness] = useState(false);
  const [isBrandedPartnershipActive, setIsBrandedPartnershipActive] = useState(true);

  // Fetch real insights from server
  const fetchLiveInsights = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/insights');
      const data = await res.json();
      if (data.insights) {
        setInsights(data.insights);
      }
    } catch (e) {
      console.error('Error loading insights', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveInsights();
  }, []);

  const handleSwitchToBusiness = async () => {
    try {
      setSwitchingToBusiness(true);
      const updated = await updateCurrentUser({
        accountType: 'business',
        isBusiness: true,
        businessCategory: 'Creator & Brand'
      });
      if (onUserUpdated) {
        onUserUpdated(updated);
      }
      await fetchLiveInsights();
    } catch (e) {
      console.error(e);
    } finally {
      setSwitchingToBusiness(false);
    }
  };

  const isBusiness = currentUser.accountType === 'business' || currentUser.isBusiness;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div className="w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[92vh] ring-1 ring-white/5">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-[#00FF66]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white tracking-tight">Professional Creator Dashboard</h3>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#00FF66]/20 text-[#00FF66] font-bold border border-[#00FF66]/30">
                  REAL DATA
                </span>
              </div>
              <span className="text-[11px] text-zinc-400 font-medium">
                Live performance tracking & audience analytics
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white p-2 rounded-full hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* If account is not business, show upgrade prompt */}
        {!isBusiness ? (
          <div className="p-8 text-center space-y-5">
            <div className="w-16 h-16 rounded-3xl bg-zinc-900 border border-white/10 flex items-center justify-center mx-auto text-[#00FF66]">
              <Briefcase className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <h4 className="text-lg font-black text-white">Professional Tools for Business & Creators</h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Your account is currently set to <strong>{currentUser.accountType?.toUpperCase() || 'PUBLIC'}</strong>. Switch to a Business Account to unlock real-time post reach tracking, engagement analytics, custom profile action buttons (Email, Phone, Directions), and brand monetization.
              </p>
            </div>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-2xl bg-zinc-900 text-xs font-semibold text-zinc-300 hover:text-white border border-white/10"
              >
                Maybe Later
              </button>
              <button
                onClick={handleSwitchToBusiness}
                disabled={switchingToBusiness}
                className="px-6 py-2.5 rounded-2xl bg-[#00FF66] hover:bg-[#00e65c] text-black font-extrabold text-xs shadow-lg shadow-[#00FF66]/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {switchingToBusiness ? 'Switching...' : 'Switch to Business Account'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tab Selector */}
            <div className="flex items-center justify-around border-b border-white/10 bg-zinc-900/30 text-xs font-bold">
              <button
                onClick={() => setActiveSubTab('insights')}
                className={`py-3 px-4 border-b-2 transition-all cursor-pointer ${
                  activeSubTab === 'insights'
                    ? 'border-[#00FF66] text-[#00FF66] font-extrabold'
                    : 'border-transparent text-zinc-400 hover:text-white'
                }`}
              >
                Real Performance & Reach
              </button>
              <button
                onClick={() => setActiveSubTab('partnerships')}
                className={`py-3 px-4 border-b-2 transition-all cursor-pointer ${
                  activeSubTab === 'partnerships'
                    ? 'border-[#00FF66] text-[#00FF66] font-extrabold'
                    : 'border-transparent text-zinc-400 hover:text-white'
                }`}
              >
                Brand Collaborations
              </button>
              <button
                onClick={() => setActiveSubTab('monetization')}
                className={`py-3 px-4 border-b-2 transition-all cursor-pointer ${
                  activeSubTab === 'monetization'
                    ? 'border-[#00FF66] text-[#00FF66] font-extrabold'
                    : 'border-transparent text-zinc-400 hover:text-white'
                }`}
              >
                Monetization & Tips
              </button>
            </div>

            {/* Content Container */}
            <div className="p-6 overflow-y-auto space-y-6">
              {loading ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-3 text-zinc-400">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#00FF66]" />
                  <span className="text-xs font-medium">Aggregating authentic account metrics...</span>
                </div>
              ) : (
                <>
                  {activeSubTab === 'insights' && (
                    <div className="space-y-6">
                      {/* Metric Stat Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-4 bg-zinc-900/80 border border-white/5 rounded-2xl">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                            Accounts Reached
                          </span>
                          <span className="text-xl font-black text-white mt-1.5 block">
                            {(insights?.accountsReached || 0).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-[#00FF66] font-bold flex items-center gap-0.5 mt-1">
                            <TrendingUp className="w-3 h-3" /> Live Organic Reach
                          </span>
                        </div>

                        <div className="p-4 bg-zinc-900/80 border border-white/5 rounded-2xl">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                            Engaged Users
                          </span>
                          <span className="text-xl font-black text-white mt-1.5 block">
                            {(insights?.accountsEngaged || 0).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-pink-400 font-bold flex items-center gap-0.5 mt-1">
                            {insights?.engagementRate || 0}% rate
                          </span>
                        </div>

                        <div className="p-4 bg-zinc-900/80 border border-white/5 rounded-2xl">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                            Total Followers
                          </span>
                          <span className="text-xl font-black text-white mt-1.5 block">
                            {(currentUser.followersCount || insights?.totalFollowers || 0).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-blue-400 font-bold flex items-center gap-0.5 mt-1">
                            Real Follows
                          </span>
                        </div>

                        <div className="p-4 bg-zinc-900/80 border border-white/5 rounded-2xl">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">
                            Profile Visits
                          </span>
                          <span className="text-xl font-black text-white mt-1.5 block">
                            {(insights?.profileVisits || 0).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-purple-400 font-bold flex items-center gap-0.5 mt-1">
                            Verified Views
                          </span>
                        </div>
                      </div>

                      {/* Reach History Graph */}
                      <div className="p-5 bg-zinc-900/60 border border-white/5 rounded-3xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xs font-black text-white uppercase tracking-wider">
                              7-Day Organic Reach Trend
                            </h4>
                            <span className="text-[11px] text-zinc-400">
                              Calculated continuously from your post & story impressions
                            </span>
                          </div>
                          <span className="text-xs font-extrabold text-[#00FF66] bg-[#00FF66]/10 px-2.5 py-1 rounded-full border border-[#00FF66]/20">
                            +100% Real Tracking
                          </span>
                        </div>

                        <div className="h-48 w-full pt-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={insights?.reachHistory || []}>
                              <defs>
                                <linearGradient id="reachGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#00FF66" stopOpacity={0.4} />
                                  <stop offset="95%" stopColor="#00FF66" stopOpacity={0.0} />
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="date" stroke="#666" fontSize={11} tickLine={false} />
                              <YAxis stroke="#666" fontSize={11} tickLine={false} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#18181b',
                                  borderColor: '#3f3f46',
                                  borderRadius: '12px',
                                  fontSize: '12px',
                                  color: '#fff'
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="value"
                                stroke="#00FF66"
                                strokeWidth={2.5}
                                fillOpacity={1}
                                fill="url(#reachGradient)"
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Content Interactions Breakdown */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 bg-zinc-900/60 border border-white/5 rounded-2xl space-y-3">
                          <h5 className="text-xs font-bold text-white flex items-center gap-2">
                            <Heart className="w-3.5 h-3.5 text-pink-400" />
                            <span>Interaction Metrics</span>
                          </h5>
                          <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between text-zinc-300">
                              <span>Total Likes on Content</span>
                              <span className="font-bold text-white">{insights?.totalLikes || 0}</span>
                            </div>
                            <div className="flex items-center justify-between text-zinc-300">
                              <span>Comments Received</span>
                              <span className="font-bold text-white">{insights?.totalComments || 0}</span>
                            </div>
                            <div className="flex items-center justify-between text-zinc-300">
                              <span>Posts & Reels Shared</span>
                              <span className="font-bold text-white">{insights?.totalShares || 0}</span>
                            </div>
                            <div className="flex items-center justify-between text-zinc-300">
                              <span>Bookmarks & Saves</span>
                              <span className="font-bold text-white">{insights?.totalSaves || 0}</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 bg-zinc-900/60 border border-white/5 rounded-2xl space-y-3">
                          <h5 className="text-xs font-bold text-white flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-blue-400" />
                            <span>Audience Category Distribution</span>
                          </h5>
                          <div className="space-y-2.5">
                            {insights?.audienceDemographics?.map((demo: any, idx: number) => (
                              <div key={idx} className="space-y-1">
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-zinc-300 font-medium">{demo.category}</span>
                                  <span className="text-white font-bold">{demo.percentage}%</span>
                                </div>
                                <div className="w-full bg-zinc-800 rounded-full h-1.5">
                                  <div
                                    className="bg-[#00FF66] h-1.5 rounded-full"
                                    style={{ width: `${demo.percentage}%` }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSubTab === 'partnerships' && (
                    <div className="space-y-4">
                      <div className="p-5 bg-zinc-900/60 border border-white/5 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Briefcase className="w-5 h-5 text-[#00FF66]" />
                            <div>
                              <h5 className="text-xs font-bold text-white">Brand Deal Inquiries</h5>
                              <span className="text-[11px] text-zinc-400">
                                Allow verified sponsors to reach you directly
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => setIsBrandedPartnershipActive(!isBrandedPartnershipActive)}
                            className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                              isBrandedPartnershipActive ? 'bg-[#00FF66]' : 'bg-zinc-800'
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded-full bg-black transition-transform absolute top-0.5 ${
                                isBrandedPartnershipActive ? 'right-0.5' : 'left-0.5'
                              }`}
                            />
                          </button>
                        </div>

                        <div className="pt-2 border-t border-white/5 text-xs text-zinc-300 space-y-2">
                          <div className="flex justify-between items-center py-1">
                            <span className="text-zinc-400">Business Contact Email:</span>
                            <span className="font-mono text-white">{currentUser.businessEmail || currentUser.email}</span>
                          </div>
                          <div className="flex justify-between items-center py-1">
                            <span className="text-zinc-400">Category:</span>
                            <span className="font-semibold text-[#00FF66]">{currentUser.businessCategory || 'Creator & Brand'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeSubTab === 'monetization' && (
                    <div className="space-y-4">
                      <div className="p-5 bg-zinc-900/60 border border-white/5 rounded-2xl space-y-3">
                        <div className="flex items-center gap-3">
                          <DollarSign className="w-5 h-5 text-[#00FF66]" />
                          <div>
                            <h5 className="text-xs font-bold text-white">Creator Badges & Digital Gifts</h5>
                            <span className="text-[11px] text-zinc-400">
                              Fans can send stickers & tips on your reels and livestreams
                            </span>
                          </div>
                        </div>
                        <div className="p-3 bg-zinc-950 rounded-xl border border-white/5 text-xs text-zinc-300">
                          Eligible status: <span className="text-[#00FF66] font-bold">Active & Enrolled</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

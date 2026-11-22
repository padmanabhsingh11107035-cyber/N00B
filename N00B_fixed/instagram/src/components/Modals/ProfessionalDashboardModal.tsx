import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BarChart2,
  Briefcase,
  ChevronRight,
  CircleDollarSign,
  Gift,
  Heart,
  Info,
  Loader2,
  MessageCircle,
  Bookmark,
  Share2,
  Users,
  TrendingUp,
  UserPlus
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { User } from '../../types';
import { updateCurrentUser, fetchInsights } from '../../services/api';

// The Professional dashboard, laid out like Instagram's: a plain top bar with a back arrow, "Insights" for the last 7 days (three big numbers and the reach chart),
// "Tools and resources" as simple rows with a round icon, a title, a short line and an arrow, and a short "Switch to a professional account" screen for everyone else.
// Every number is real (the my_insights function): nothing here is made up, and a number that does not exist yet shows 0, never a placeholder.

interface Props {
  currentUser: User;
  onClose: () => void;
  onUserUpdated?: (user: User) => void;
}

type View = 'home' | 'insights' | 'audience' | 'brand' | 'gifts';

interface Insights {
  accountsReached: number;
  accountsEngaged: number;
  totalFollowers: number;
  profileActivity: number;
  shareRate: number;
  likeRate: number;
  saveRate: number;
  commentRate: number;
  reachHistory: { date: string; value: number }[];
  audienceDemographics: { category: string; percentage: number }[];
}

const num = (n: unknown): number => (typeof n === 'number' && isFinite(n) ? n : 0);
const fmt = (n: number): string => n.toLocaleString();
// 12 345 -> "12.3K" in the big numbers, like Instagram
const compact = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : n >= 10_000 ? `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K` : fmt(n));

const Bar: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => (
  <header className="shrink-0 flex items-center gap-3 px-3 h-14 border-b border-white/10 bg-page">
    <button type="button" onClick={onBack} aria-label="Back" data-testid="pd-back" className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-white cursor-pointer active:bg-white/10">
      <ArrowLeft className="w-6 h-6" />
    </button>
    <h1 className="text-[17px] font-bold text-white truncate">{title}</h1>
  </header>
);

const Heading: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({ children, right }) => (
  <div className="flex items-baseline justify-between gap-3 px-4 pt-6 pb-2">
    <h2 className="text-[16px] font-bold text-white">{children}</h2>
    {right}
  </div>
);

const Tool: React.FC<{ icon: React.ReactNode; title: string; text: string; onClick: () => void; testId?: string }> = ({ icon, title, text, onClick, testId }) => (
  <button type="button" onClick={onClick} data-testid={testId} className="w-full flex items-center gap-3.5 px-4 py-3 text-left cursor-pointer active:bg-white/5">
    <span className="w-11 h-11 shrink-0 rounded-full border border-white/20 flex items-center justify-center text-white">{icon}</span>
    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-semibold text-white leading-tight">{title}</span>
      <span className="block text-[13px] text-zinc-400 leading-snug mt-0.5">{text}</span>
    </span>
    <ChevronRight className="w-5 h-5 shrink-0 text-zinc-500" />
  </button>
);

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex-1 min-w-0 text-center px-1">
    <div className="text-[22px] sm:text-[26px] font-bold text-white leading-none tabular-nums">{value}</div>
    <div className="text-[12px] text-zinc-400 mt-1.5 leading-tight">{label}</div>
  </div>
);

const Line: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5 last:border-b-0">
    <span className="w-6 shrink-0 text-zinc-300 flex justify-center">{icon}</span>
    <span className="flex-1 min-w-0 text-[15px] text-white">{label}</span>
    <span className="text-[15px] font-semibold text-white tabular-nums">{value}</span>
  </div>
);

export const ProfessionalDashboardModal: React.FC<Props> = ({ currentUser, onClose, onUserUpdated }) => {
  const [view, setView] = useState<View>('home');
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const [brandOn, setBrandOn] = useState(true);

  const isProfessional = currentUser.accountType === 'business' || !!currentUser.isBusiness;

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const data = (await fetchInsights()) as unknown as Partial<Insights> | null;
      setInsights(data ? {
        accountsReached: num(data.accountsReached), accountsEngaged: num(data.accountsEngaged), totalFollowers: num(data.totalFollowers), profileActivity: num(data.profileActivity),
        shareRate: num(data.shareRate), likeRate: num(data.likeRate), saveRate: num(data.saveRate), commentRate: num(data.commentRate),
        reachHistory: Array.isArray(data.reachHistory) ? data.reachHistory.map((p) => ({ date: String(p.date), value: num(p.value) })) : [],
        audienceDemographics: Array.isArray(data.audienceDemographics) ? data.audienceDemographics.map((a) => ({ category: String(a.category), percentage: num(a.percentage) })) : []
      } : null);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isProfessional) void load(); else setLoading(false); }, [isProfessional, load]);

  const switchToProfessional = async () => {
    setSwitching(true);
    setSwitchError('');
    try {
      const updated = await updateCurrentUser({ accountType: 'business', isBusiness: true, businessCategory: 'Creator & Brand' });
      onUserUpdated?.(updated);
    } catch {
      setSwitchError('Could not switch your account. Please try again.');
    } finally {
      setSwitching(false);
    }
  };

  const followers = Math.max(num(currentUser.followersCount), num(insights?.totalFollowers));
  const engagementRate = useMemo(() => (insights && insights.accountsReached > 0 ? Math.round((insights.accountsEngaged * 1000) / insights.accountsReached) / 10 : 0), [insights]);
  const totalReach7 = useMemo(() => (insights?.reachHistory || []).reduce((a, p) => a + p.value, 0), [insights]);

  const back = () => { if (view === 'home') onClose(); else setView('home'); };
  const frame = 'fixed inset-0 z-50 bg-page text-white flex flex-col';
  const body = 'flex-1 min-h-0 overflow-y-auto overscroll-contain';
  const inner = 'w-full max-w-[640px] mx-auto pb-[max(env(safe-area-inset-bottom),24px)]';

  // ---------------------------------------------------------------- not a professional account yet
  if (!isProfessional) {
    return (
      <div className={frame} data-testid="professional-dashboard" role="dialog" aria-modal="true" aria-label="Professional dashboard">
        <Bar title="Professional dashboard" onBack={onClose} />
        <div className={body}>
          <div className={`${inner} px-5 pt-10`}>
            <div className="w-20 h-20 mx-auto rounded-full border-2 border-white/25 flex items-center justify-center">
              <BarChart2 className="w-9 h-9" />
            </div>
            <h2 className="text-[22px] font-bold text-center mt-5 leading-tight">Get professional tools</h2>
            <p className="text-[14px] text-zinc-400 text-center mt-2 leading-snug max-w-sm mx-auto">Switch to a professional account to see how your posts, reels and stories are doing.</p>
            <ul className="mt-8 space-y-5">
              {[
                [<BarChart2 key="a" className="w-6 h-6" />, 'Insights', 'See how many people you reach and who they are.'],
                [<Briefcase key="b" className="w-6 h-6" />, 'Branded content', 'Let verified brands find and contact you.'],
                [<CircleDollarSign key="c" className="w-6 h-6" />, 'Gifts and tips', 'Fans can support your reels and live videos.']
              ].map(([icon, title, text]) => (
                <li key={title as string} className="flex items-start gap-4">
                  <span className="mt-0.5 shrink-0 text-white">{icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold">{title}</span>
                    <span className="block text-[13px] text-zinc-400 leading-snug mt-0.5">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
            {switchError && <p className="mt-6 text-center text-[13px] text-red-400" role="alert">{switchError}</p>}
            <button type="button" onClick={() => void switchToProfessional()} disabled={switching} data-testid="pd-switch" className="mt-8 w-full min-h-12 py-2.5 px-4 rounded-xl bg-[#0095f6] active:bg-[#1877f2] text-white text-[15px] font-bold leading-tight flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
              {switching && <Loader2 className="w-4 h-4 animate-spin" />}{switching ? 'Switching…' : 'Switch to professional account'}
            </button>
            <button type="button" onClick={onClose} className="mt-2 w-full min-h-12 py-2.5 rounded-xl text-[#0095f6] text-[15px] font-semibold cursor-pointer active:bg-white/5">Not now</button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- the pages
  const title = view === 'home' ? 'Professional dashboard' : view === 'insights' ? 'Insights' : view === 'audience' ? 'Your audience' : view === 'brand' ? 'Branded content' : 'Gifts and tips';

  return (
    <div className={frame} data-testid="professional-dashboard" role="dialog" aria-modal="true" aria-label="Professional dashboard">
      <Bar title={title} onBack={back} />
      <div className={body}>
        <div className={inner}>
          {loading ? (
            <div className="py-24 flex flex-col items-center gap-3 text-zinc-400"><Loader2 className="w-7 h-7 animate-spin" /><span className="text-[13px]">Loading your insights…</span></div>
          ) : failed || !insights ? (
            <div className="py-20 px-8 text-center">
              <p className="text-[15px] font-semibold">Could not load your insights</p>
              <p className="text-[13px] text-zinc-400 mt-1">Check your connection and try again.</p>
              <button type="button" onClick={() => void load()} className="mt-5 px-6 h-10 rounded-xl bg-white/10 text-[14px] font-semibold cursor-pointer active:bg-white/15">Try again</button>
            </div>
          ) : view === 'home' ? (
            <>
              <Heading right={<span className="text-[13px] text-zinc-400">Last 7 days</span>}>Insights</Heading>
              <button type="button" onClick={() => setView('insights')} data-testid="pd-insights-card" className="mx-4 w-[calc(100%-2rem)] rounded-2xl border border-white/10 py-5 px-2 flex items-center cursor-pointer active:bg-white/5">
                <Stat label="Accounts reached" value={compact(insights.accountsReached)} />
                <span className="w-px h-10 bg-white/10" aria-hidden="true" />
                <Stat label="Accounts engaged" value={compact(insights.accountsEngaged)} />
                <span className="w-px h-10 bg-white/10" aria-hidden="true" />
                <Stat label="Followers" value={compact(followers)} />
              </button>

              <div className="mx-4 mt-3 rounded-2xl border border-white/10 pt-4 pb-2 px-3">
                <div className="flex items-baseline justify-between px-1">
                  <span className="text-[14px] font-semibold">Accounts reached</span>
                  <span className="text-[12px] text-zinc-400">{fmt(totalReach7)} in total</span>
                </div>
                <div className="h-40 w-full mt-2" data-testid="pd-chart">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={insights.reachHistory} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="pdReach" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ffffff" stopOpacity={0.32} />
                          <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis stroke="#71717a" fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                      <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: 12, fontSize: 12, color: '#fff' }} />
                      <Area type="monotone" dataKey="value" name="Accounts" stroke="#ffffff" strokeWidth={2} fill="url(#pdReach)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="mt-1">
                <Tool icon={<TrendingUp className="w-5 h-5" />} title="See all insights" text="Reach, engagement and how people react" onClick={() => setView('insights')} testId="pd-open-insights" />
                <Tool icon={<Users className="w-5 h-5" />} title="Your audience" text={`${fmt(followers)} follower${followers === 1 ? '' : 's'}`} onClick={() => setView('audience')} testId="pd-open-audience" />
              </div>

              <Heading>Tools and resources</Heading>
              <Tool icon={<Briefcase className="w-5 h-5" />} title="Branded content" text="Let verified brands find and contact you" onClick={() => setView('brand')} testId="pd-open-brand" />
              <Tool icon={<Gift className="w-5 h-5" />} title="Gifts and tips" text="Fans can support your reels and live videos" onClick={() => setView('gifts')} testId="pd-open-gifts" />
              <p className="px-4 pt-6 text-[12px] text-zinc-500 leading-snug flex gap-2"><Info className="w-4 h-4 shrink-0 mt-px" />These numbers come from your real posts, reels and stories. A new account starts at 0.</p>
            </>
          ) : view === 'insights' ? (
            <>
              <Heading right={<span className="text-[13px] text-zinc-400">Last 7 days</span>}>Overview</Heading>
              <div className="mx-4 rounded-2xl border border-white/10 overflow-hidden">
                <Line icon={<TrendingUp className="w-5 h-5" />} label="Accounts reached" value={fmt(insights.accountsReached)} />
                <Line icon={<Heart className="w-5 h-5" />} label="Accounts engaged" value={fmt(insights.accountsEngaged)} />
                <Line icon={<BarChart2 className="w-5 h-5" />} label="Engagement rate" value={`${engagementRate}%`} />
                <Line icon={<UserPlus className="w-5 h-5" />} label="New followers" value={fmt(insights.profileActivity)} />
              </div>
              <Heading>How people react</Heading>
              <p className="px-4 -mt-1 pb-2 text-[13px] text-zinc-400 leading-snug">Each number is a share of the accounts you reached.</p>
              <div className="mx-4 rounded-2xl border border-white/10 overflow-hidden">
                <Line icon={<Heart className="w-5 h-5" />} label="Likes" value={`${insights.likeRate}%`} />
                <Line icon={<MessageCircle className="w-5 h-5" />} label="Comments" value={`${insights.commentRate}%`} />
                <Line icon={<Share2 className="w-5 h-5" />} label="Shares" value={`${insights.shareRate}%`} />
                <Line icon={<Bookmark className="w-5 h-5" />} label="Saves" value={`${insights.saveRate}%`} />
              </div>
            </>
          ) : view === 'audience' ? (
            <>
              <Heading>Followers</Heading>
              <div className="mx-4 rounded-2xl border border-white/10 py-6 text-center">
                <div className="text-[34px] font-bold leading-none tabular-nums" data-testid="pd-followers">{fmt(followers)}</div>
                <div className="text-[13px] text-zinc-400 mt-2">{followers === 1 ? 'follower' : 'followers'} in total</div>
              </div>
              <Heading>Gender</Heading>
              {insights.audienceDemographics.length === 0 ? (
                <p className="px-4 text-[14px] text-zinc-400">Nobody follows you yet. When people do, you will see who they are here.</p>
              ) : (
                <div className="mx-4 space-y-4">
                  {insights.audienceDemographics.map((d) => (
                    <div key={d.category}>
                      <div className="flex justify-between text-[14px]"><span>{d.category}</span><span className="font-semibold tabular-nums">{d.percentage}%</span></div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, Math.max(0, d.percentage))}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : view === 'brand' ? (
            <>
              <div className="px-4 pt-6 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">Brand inquiries</div>
                  <div className="text-[13px] text-zinc-400 leading-snug mt-0.5">Let verified brands reach you directly.</div>
                </div>
                <button type="button" role="switch" aria-checked={brandOn} aria-label="Brand inquiries" onClick={() => setBrandOn((v) => !v)} className={`relative w-12 h-7 shrink-0 rounded-full cursor-pointer transition-colors ${brandOn ? 'bg-[#0095f6]' : 'bg-zinc-700'}`}>
                  <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all ${brandOn ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
              <Heading>Contact details</Heading>
              <div className="mx-4 rounded-2xl border border-white/10 overflow-hidden">
                <div className="px-4 py-3.5 border-b border-white/5"><div className="text-[12px] text-zinc-400">Email</div><div className="text-[15px] break-all">{currentUser.businessEmail || currentUser.email || 'Not added yet'}</div></div>
                <div className="px-4 py-3.5"><div className="text-[12px] text-zinc-400">Category</div><div className="text-[15px]">{currentUser.businessCategory || 'Creator & Brand'}</div></div>
              </div>
              <p className="px-4 pt-3 text-[12px] text-zinc-500 leading-snug">Change your email and category in Edit profile.</p>
            </>
          ) : (
            <>
              <div className="px-4 pt-8 text-center">
                <div className="w-16 h-16 mx-auto rounded-full border border-white/25 flex items-center justify-center"><Gift className="w-7 h-7" /></div>
                <h2 className="text-[19px] font-bold mt-4">Gifts and tips are on</h2>
                <p className="text-[14px] text-zinc-400 mt-2 leading-snug max-w-sm mx-auto">Your professional account can receive stickers and tips from fans on your reels and live videos.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

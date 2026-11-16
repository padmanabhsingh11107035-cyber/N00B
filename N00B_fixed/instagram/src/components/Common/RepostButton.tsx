import React, { useEffect, useState } from 'react';
import { toggleRepost } from '../../services/api';
import { repostStates } from '../../utils/repostState';
import { formatCompactCount } from '../../utils/repostBatcher';

// The Repost button next to Like / Comment / Share: one tap puts the post or reel on your own profile (Reposts tab), tap again to undo.
// Not shown on your own content. The state of every card on screen comes in ONE request (utils/repostBatcher.ts).
// The number of reposts shows next to the icon (cards) or under it (reels) once it is more than zero.
export const RepostButton: React.FC<{
  kind: 'post' | 'reel';
  id: string;
  ownerId: string;
  currentUserId: string;
  className?: string;
  iconClass?: string;
  stacked?: boolean;
}> = ({ kind, id, ownerId, currentUserId, className = '', iconClass = 'w-6 h-6', stacked }) => {
  const [on, setOn] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [anim, setAnim] = useState<'' | 'on' | 'off'>('');   // only a tap is animated, never the state that arrives when the card loads
  useEffect(() => {
    if (ownerId === currentUserId) return;
    let alive = true;
    void repostStates.get(kind, id).then((s) => { if (alive) { setOn(s.isReposted); setCount(s.count); } });
    return () => { alive = false; };
  }, [kind, id, ownerId, currentUserId]);
  if (ownerId === currentUserId) return null;
  const tap = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const was = on, wasCount = count;
    setOn(!was);
    setAnim(was ? 'off' : 'on');
    window.setTimeout(() => setAnim(''), 600);
    setCount(Math.max(0, wasCount + (was ? -1 : 1)));   // at once; the server's number replaces it below
    const res = await toggleRepost(kind, id);
    setBusy(false);
    if (res.error) {
      setOn(was); setCount(wasCount); setMsg(res.error);
      repostStates.invalidate(kind, id);
    } else {
      setOn(res.isReposted); setCount(res.count);
      repostStates.set(kind, id, { isReposted: res.isReposted, count: res.count });
      setMsg(res.isReposted ? 'Reposted to your profile' : 'Repost removed');
    }
    window.setTimeout(() => setMsg(''), 1800);
  };
  const shown = count > 0 ? formatCompactCount(count) : '';
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={tap} data-testid="repost-btn" aria-pressed={on} aria-label={on ? 'Remove repost' : 'Repost'} title={on ? 'Remove repost' : 'Repost'}
        className={`${stacked ? 'flex flex-col items-center gap-1' : shown ? 'inline-flex items-center gap-1' : ''} cursor-pointer active:scale-90 transition-transform text-white ${className}`}>
        {/* the two arrows turn once and a tick is drawn in the middle when it is reposted; the tick is wiped away and the arrows turn back when the repost is removed */}
        <svg className={`rp-ico ${iconClass}`} data-on={on ? '1' : '0'} data-anim={anim || undefined} data-testid="repost-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <g className="rp-arrows">
            <path d="m2 9 3-3 3 3" />
            <path d="M13 18H7a2 2 0 0 1-2-2V6" />
            <path d="m22 15-3 3-3-3" />
            <path d="M11 6h6a2 2 0 0 1 2 2v10" />
          </g>
          <path className="rp-tick" d="m9.4 12.3 1.9 1.9 3.5-3.9" strokeWidth={2.1} />
        </svg>
        {stacked && <span data-testid="repost-count" className="rv-count text-[13px] font-semibold leading-none">{shown || (on ? 'Reposted' : 'Repost')}</span>}
        {!stacked && shown && <span data-testid="repost-count" className="text-[13px] font-semibold leading-none tabular-nums">{shown}</span>}
      </button>
      {msg && <span role="status" className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-[11px] font-bold text-white pointer-events-none z-20">{msg}</span>}
    </span>
  );
};

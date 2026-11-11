import React, { useEffect, useState } from 'react';
import { Repeat2 } from 'lucide-react';
import { toggleRepost, fetchRepostState } from '../../services/api';

// The Repost button next to Like / Comment / Share: one tap puts the post or reel on your own profile (Reposts tab), tap again to undo.
// Not shown on your own content.
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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (ownerId === currentUserId) return;
    let alive = true;
    void fetchRepostState(kind, id).then((s) => { if (alive) setOn(s.isReposted); });
    return () => { alive = false; };
  }, [kind, id, ownerId, currentUserId]);
  if (ownerId === currentUserId) return null;
  const tap = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    const was = on;
    setOn(!was);
    const res = await toggleRepost(kind, id);
    setBusy(false);
    if (res.error) { setOn(was); setMsg(res.error); } else { setOn(res.isReposted); setMsg(res.isReposted ? 'Reposted to your profile' : 'Repost removed'); }
    window.setTimeout(() => setMsg(''), 1800);
  };
  return (
    <span className="relative inline-flex">
      <button type="button" onClick={tap} data-testid="repost-btn" aria-pressed={on} aria-label={on ? 'Remove repost' : 'Repost'} title={on ? 'Remove repost' : 'Repost'}
        className={`${stacked ? 'flex flex-col items-center gap-1' : ''} cursor-pointer active:scale-90 transition-transform ${on ? 'text-noob' : 'text-white'} ${className}`}>
        <Repeat2 className={iconClass} strokeWidth={1.8} />
        {stacked && <span className="rv-count text-[13px] font-semibold leading-none">{on ? 'Reposted' : 'Repost'}</span>}
      </button>
      {msg && <span role="status" className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-[11px] font-bold text-white pointer-events-none z-20">{msg}</span>}
    </span>
  );
};

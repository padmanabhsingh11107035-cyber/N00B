import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, Users } from 'lucide-react';
import { fetchLiveStreamComments, fetchLiveStreams, likeLiveStream, type LiveStreamSummary } from '../../services/supabaseApi';
import { setVisibleInterval } from '../../utils/visibleInterval';

// "Live now": the lives that are on right now, in curved boxes at the top of Home (under the stories). Each box shows who is live, how many are watching, the hearts, the newest line of the live chat,
// a heart to send a like without leaving Home, and a button into the live (the chat button opens the same live, where the chat and the gifts are). Nothing of a live is kept after it ends: a live
// that is over (or past its 30 minutes) simply disappears from here on the next look. Styles: .hl-* in Feed/home.css.
const LIVE_MAX_MS = 30 * 60_000;
const EVERY_MS = 20_000;

export const minutesLeft = (startedAt: string, now: number): number => {
  const t = Date.parse(startedAt);
  if (!Number.isFinite(t)) return 30;
  return Math.max(0, Math.ceil((t + LIVE_MAX_MS - now) / 60_000));
};

interface Line { who: string; text: string }

export const HomeLiveRail: React.FC<{ onOpen: (s: LiveStreamSummary) => void }> = ({ onOpen }) => {
  const [streams, setStreams] = useState<LiveStreamSummary[]>([]);
  const [chat, setChat] = useState<Record<string, Line | undefined>>({});
  const [hearts, setHearts] = useState<Record<string, number>>({});   // hearts sent from here (shown at once, before the next look)
  const [now, setNow] = useState(() => Date.now());
  const alive = useRef(true);

  const look = useCallback(async () => {
    const res = await fetchLiveStreams();
    if (!alive.current || !res.success) return;
    const list = res.streams.slice(0, 8);
    setStreams(list);
    setNow(Date.now());
    // the newest chat line of each box (a few at a time, quietly)
    const lines = await Promise.all(list.slice(0, 5).map(async (s) => {
      const c = await fetchLiveStreamComments(s.id, 3);
      const last = c.success ? [...c.comments].reverse().find((m) => m.text && !m.giftAmount) : undefined;
      return [s.id, last ? { who: last.sender.displayName || last.sender.username, text: last.text } : undefined] as const;
    }));
    if (alive.current) setChat(Object.fromEntries(lines));
  }, []);

  useEffect(() => {
    alive.current = true;
    void look();
    const stop = setVisibleInterval(() => { void look(); }, EVERY_MS);   // rests while the page is hidden
    return () => { alive.current = false; stop(); };
  }, [look]);

  const heart = (s: LiveStreamSummary): void => {
    setHearts((h) => ({ ...h, [s.id]: (h[s.id] || 0) + 1 }));
    void likeLiveStream(s.id);
  };

  if (streams.length === 0) return null;
  return (
    <section className="hl-rail" data-testid="home-live-rail" aria-label="Live now">
      <div className="hl-head"><span className="hl-dot" aria-hidden="true" /><b>Live now</b></div>
      <div className="hl-scroll no-scrollbar">
        {streams.map((s) => {
          const left = minutesLeft(s.startedAt, now);
          const line = chat[s.id];
          const likes = (s.totalLikes || 0) + (hearts[s.id] || 0);
          return (
            <article key={s.id} className="hl-card" data-testid="home-live-box" aria-label={`Live: ${s.title || s.host.username}`}>
              <button type="button" className="hl-main" onClick={() => onOpen(s)}>
                <span className="hl-ava">
                  {s.host.avatar ? <img src={s.host.avatar} alt="" referrerPolicy="no-referrer" draggable={false} /> : <span className="hl-ph" aria-hidden="true" />}
                  <i className="hl-pill">LIVE</i>
                </span>
                <span className="hl-who"><b>{s.host.displayName || s.host.username}</b><small>{s.title || `@${s.host.username}`}</small></span>
              </button>
              <div className="hl-stats">
                <span><Users size={13} /> {s.viewerCount.toLocaleString()}</span>
                <span><Heart size={13} /> {likes.toLocaleString()}</span>
                <span className="hl-left">{left <= 1 ? 'ends soon' : `${left} min left`}</span>
              </div>
              <p className="hl-chat" aria-label="Latest chat message">{line ? <><b>{line.who}</b> {line.text}</> : <i>Say hi in the live chat</i>}</p>
              <div className="hl-actions">
                <button type="button" className="hl-like" onClick={() => heart(s)} aria-label="Send a heart" data-testid="home-live-heart"><Heart size={18} /></button>
                <button type="button" className="hl-chatbtn" onClick={() => onOpen(s)} aria-label="Open the live chat"><MessageCircle size={18} /></button>
                <button type="button" className="hl-watch" onClick={() => onOpen(s)}>Watch</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

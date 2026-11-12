// The Messages (chat list) page, rebuilt as its own component. ONE mechanism for the top of the screen:
//   on a phone the whole page is a single layer that ChatView positions (fixed, from the top of the screen to the bottom bar) and
//   inside it ONE scroller holds everything: the green header first (its top padding is the clock/notch height, --sat), then the sheet with the filters and the chats.
// There is no strip behind the clock, no page padding, no negative page margin and no JavaScript colour: the header simply scrolls away with the list.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Archive, ArrowDownLeft, BellOff, CheckCheck, ChevronLeft, Lock, MapPinned, MessageCircle, MoreVertical, Palette, Pin, Plus, Search, Settings, UserCheck, UserPlus, Users, X, Phone as CallIcon } from 'lucide-react';
import { ChatConversation, User } from '../../types';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { InstantsStack } from './InstantsStack';
import './messagesList.css';

export type MessagesFilterTab = 'all' | 'unread' | 'favourites' | 'groups';

export interface MessagesListProps {
  currentUser: User;
  mobileView: 'list' | 'chat';
  activeChatId: string | null;
  setActiveChatId: (id: string) => void;
  setMobileView: (v: 'list' | 'chat') => void;
  /** every chat that may be shown (the counts on the filters) */
  visibleConversations: ChatConversation[];
  /** the order of the list before the filter (the people row is taken from it) */
  sortedConversations: ChatConversation[];
  /** the rows to draw (after the filter and the search) */
  rows: ChatConversation[];
  friendsWithoutConversation: User[];
  filteredFriendsWithoutChat: User[];
  chatsLoaded: boolean;
  activeFilterTab: MessagesFilterTab;
  setActiveFilterTab: (t: MessagesFilterTab) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  showSearchField: boolean;
  setShowSearchField: (f: boolean | ((v: boolean) => boolean)) => void;
  showLeftMenu: boolean;
  setShowLeftMenu: (v: boolean) => void;
  leftMenuRef: React.RefObject<HTMLDivElement | null>;
  menuPanelRef: React.RefObject<HTMLDivElement | null>;
  leftMenuPos: { top: number; right: number } | null;
  setLeftMenuPos: (p: { top: number; right: number }) => void;
  callsOn: boolean;
  familyOn: boolean;
  openFamily: () => void;
  preloadFamily: () => void;
  settings: Record<string, any>;
  listTime: (iso?: string | null) => string;
  isUserOnline: (id: string) => boolean;
  instantsRefreshKey: number;
  onOpenInstantCamera: () => void;
  onOpenInstantViewer: (queue: any) => void;
  onStartChatWithUser: (u: User) => void;
  onShowCallLogs: () => void;
  onShowNewChat: () => void;
  onShowCreateGroup: () => void;
  onShowSettings: () => void;
  onShowInstantsArchive: () => void;
  onShowE2ee: () => void;
  onShowChatSettings: () => void;
}

export function MessagesList(p: MessagesListProps) {
  const {
    currentUser, mobileView, activeChatId, setActiveChatId, setMobileView, visibleConversations, sortedConversations, rows, friendsWithoutConversation,
    filteredFriendsWithoutChat, chatsLoaded, activeFilterTab, setActiveFilterTab, searchQuery, setSearchQuery, showSearchField, setShowSearchField,
    showLeftMenu, setShowLeftMenu, leftMenuRef, menuPanelRef, leftMenuPos, setLeftMenuPos, callsOn, familyOn, openFamily, preloadFamily, settings: cs, listTime, isUserOnline,
  } = p;
  const finalFilteredConversations = rows;

  // The scroller: each chat row fades in (one after the other) as it comes into view.
  const listRef = useRef<HTMLDivElement>(null);
  const rowsKey = rows.map((c) => c.id).join(',');
  // Safety net for the fade-in: whatever an observer did or did not report, no row at or above the bottom edge of the list stays hidden.
  const sweepRows = () => {
    const box = listRef.current;
    if (!box) return;
    const bottom = box.getBoundingClientRect().bottom;
    const left = box.querySelectorAll<HTMLElement>('.msg-row:not([data-in])');
    for (let i = 0; i < left.length; i++) if (left[i].getBoundingClientRect().top < bottom) left[i].setAttribute('data-in', '1');
  };
  useEffect(() => {
    const box = listRef.current;
    if (!box) return;
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const found = box.querySelectorAll<HTMLElement>('.msg-row:not([data-in])');
    const els: HTMLElement[] = [];
    for (let i = 0; i < found.length; i++) els.push(found[i]);
    let io: IntersectionObserver | null = null;
    if (calm || typeof IntersectionObserver === 'undefined') els.forEach((r) => r.setAttribute('data-in', '1'));
    else {
      io = new IntersectionObserver((entries) => {
        let n = 0;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.style.transitionDelay = `${Math.min(n++, 8) * 45}ms`;
          el.setAttribute('data-in', '1');
          io?.unobserve(el);
          window.setTimeout(() => { el.style.transitionDelay = ''; }, 900);
        }
      }, { root: box, threshold: 0.05 });
      els.forEach((r) => io!.observe(r));
    }
    const t1 = window.setTimeout(sweepRows, 700);
    const t2 = window.setTimeout(sweepRows, 2000);
    return () => { io?.disconnect(); window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [rowsKey, activeFilterTab, searchQuery, mobileView]);
  useEffect(() => {
    const box = listRef.current;
    if (!box) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (box.scrollTop > 6) setShowLeftMenu(false);
        sweepRows();
      });
    };
    box.addEventListener('scroll', onScroll, { passive: true });
    return () => { box.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [mobileView]);

  // The soft highlight under the chosen filter slides to the next one (its place is measured, also when the screen turns or the counts change).
  const pillsRef = useRef<HTMLDivElement>(null);
  const pillBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [pillInd, setPillInd] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const pillCounts = `${visibleConversations.length}-${visibleConversations.filter((c) => (c.unreadCount || 0) > 0).length}-${visibleConversations.filter((c) => c.isPinned).length}-${visibleConversations.filter((c) => c.isGroup).length}`;
  useLayoutEffect(() => {
    if (mobileView !== 'list') return;
    const place = () => {
      const el = pillBtnRefs.current[activeFilterTab];
      if (!el || !el.offsetWidth) return;
      const next = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      setPillInd((q) => (q && q.x === next.x && q.y === next.y && q.w === next.w && q.h === next.h ? q : next));
    };
    place();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(place);
    if (pillsRef.current) ro.observe(pillsRef.current);
    for (const k in pillBtnRefs.current) { const b = pillBtnRefs.current[k]; if (b) ro.observe(b); }
    return () => ro.disconnect();
  }, [activeFilterTab, pillCounts, mobileView]);

  // the people of the row under the icons: verified people you chat one-to-one with, pinned chats first, then the order of the list, up to 12
  const recentPeople = sortedConversations
    .filter((c) => !c.isGroup)
    .map((c) => ({ chat: c, who: c.participants?.find((q) => q.id !== currentUser.id) as User | undefined }))
    .filter((x): x is { chat: ChatConversation; who: User } => !!x.who && !!x.who.isVerified)
    .sort((x, y) => Number(!!y.chat.isPinned) - Number(!!x.chat.isPinned))
    .slice(0, 12);

  return (
    <aside className={`msg-page force-dark relative w-full shrink-0 flex-col z-20 ${mobileView === 'chat' ? 'hidden' : 'flex'}`}>
      {/* Instants: a small tab at the right edge of the list, it takes no room from the chats */}
      <InstantsStack onOpenCamera={p.onOpenInstantCamera} onOpenViewer={p.onOpenInstantViewer} refreshKey={p.instantsRefreshKey} />

          {/* ONE scroller: the green header scrolls away with the page, the filters stay on top, the chats appear line by line */}
          <div ref={listRef} className="msg-scroll relative flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar [-webkit-overflow-scrolling:touch]" data-testid="messages-list">
          <div className="msg-head force-dark px-5 pb-[calc(20px+var(--msg-r))]" data-testid="messages-header">
            {/* title row: "Messages" with the number of chats; the menu (back, calls, new group, settings ...) is the three dots at the right */}
            <div className="flex items-end gap-2.5 h-[38px]">
              <h1 className="min-w-0 text-[33px] leading-[38px] font-bold text-white tracking-[-0.5px]">
                <span className="block truncate">Messages</span>
              </h1>
              <span className="shrink-0 mb-[-5px] h-6 min-w-[26px] px-2.5 rounded-full bg-[var(--mint)] text-[#033b2a] text-[13px] leading-6 font-bold text-center tabular-nums">
                {visibleConversations.length + friendsWithoutConversation.length}
              </span>
              <div className="ml-auto relative shrink-0 self-center -mr-2" ref={leftMenuRef}>
                <button
                  onClick={(e) => {
                    if (!showLeftMenu) {
                      const box = listRef.current;
                      if (box) {
                        const br = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const cr = box.getBoundingClientRect();
                        setLeftMenuPos({ top: Math.round(br.bottom - cr.top + box.scrollTop + 6), right: Math.max(8, Math.round(cr.right - br.right + 4)) });
                      }
                    }
                    setShowLeftMenu(!showLeftMenu);
                  }}
                  className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors cursor-pointer ${showLeftMenu ? 'bg-white/20 text-white' : 'text-white/85 hover:bg-white/10'}`}
                  title="Chat Options"
                  aria-label="Chat Options"
                >
                  <MoreVertical className="w-[19px] h-[19px]" />
                </button>
              </div>
            </div>

            {/* two round buttons under the title */}
            <div className="mt-[8px] ml-[9px] flex items-center gap-3" data-testid="messages-actions">
              <button type="button" onClick={() => setShowSearchField((v) => !v)} aria-label="Search" title="Search" data-testid="messages-search"
                className={`w-[45px] h-[45px] rounded-full flex items-center justify-center cursor-pointer transition-colors ${showSearchField || searchQuery ? 'bg-[var(--mint)] text-[#033b2a]' : 'bg-[var(--head-btn)] hover:bg-[var(--head-btn-hover)] text-white'}`}>
                <Search className="w-[21px] h-[21px]" strokeWidth={2.3} />
              </button>
              <button type="button" onClick={() => p.onShowNewChat()} aria-label="Find a person to chat with" title="Find a person to chat with" data-testid="messages-new-chat"
                className="w-[45px] h-[45px] rounded-full bg-[var(--head-btn)] hover:bg-[var(--head-btn-hover)] text-white flex items-center justify-center cursor-pointer transition-colors">
                <UserPlus className="w-[21px] h-[21px]" strokeWidth={2.1} />
              </button>
              {callsOn && (
                <button type="button" onClick={() => p.onShowCallLogs()} aria-label="Calls" title="Calls" data-testid="messages-calls"
                  className="w-[45px] h-[45px] rounded-full bg-[var(--head-btn)] hover:bg-[var(--head-btn-hover)] text-white flex items-center justify-center cursor-pointer transition-colors">
                  <CallIcon className="w-[21px] h-[21px]" strokeWidth={2.1} />
                </button>
              )}
              {/* Family Map: rooms where a family or friends see each other live on a map (opens over the chats) */}
              {familyOn && (
                <button type="button" onClick={openFamily} onPointerDown={preloadFamily} aria-label="Family Map: see your family live on a map" title="Family Map" data-testid="messages-family-map"
                  className="w-[45px] h-[45px] rounded-full bg-[var(--head-btn)] hover:bg-[var(--head-btn-hover)] text-white flex items-center justify-center cursor-pointer transition-colors">
                  <MapPinned className="w-[21px] h-[21px]" strokeWidth={2.1} />
                </button>
              )}
            </div>

            {/* the people row: "Your Instant" first (it opens the camera), then the verified people you chat with (pinned first) in a mint ring */}
            <div className="mt-[22px] -mx-5 px-5 flex items-start gap-[15px] overflow-x-auto no-scrollbar" data-testid="messages-people">
              <button type="button" onClick={() => p.onOpenInstantCamera()} aria-label="Your Instant" data-testid="messages-your-instant" className="shrink-0 w-[65px] text-center cursor-pointer">
                <span className="relative block w-[65px] h-[65px]">
                  <img src={currentUser.avatar || '/noob-logo-circle.png'} alt="" className="w-full h-full rounded-full object-cover" />
                  <span className="absolute right-0 bottom-0 w-[19px] h-[19px] rounded-full bg-[var(--mint)] text-white flex items-center justify-center border-[2.5px] border-[var(--head)]"><Plus className="w-[11px] h-[11px]" strokeWidth={4} /></span>
                </span>
                <span className="block mt-2 -mx-[10px] text-[12px] leading-4 text-white/85 truncate">Your Instant</span>
              </button>
              {recentPeople.map(({ chat, who }) => (
                <button key={chat.id} type="button" onClick={() => { setActiveChatId(chat.id); setMobileView('chat'); }} data-testid="messages-person" className="shrink-0 w-[65px] text-center cursor-pointer">
                  <span className="block w-[65px] h-[65px] rounded-full p-[2.5px] border-[2.5px] border-[var(--mint-ring)] bg-[var(--head-gap)]">
                    <img src={who.avatar || '/noob-logo-circle.png'} alt="" className="w-full h-full rounded-full object-cover" />
                  </span>
                  <span className="block mt-2 -mx-[7px] text-[12px] leading-4 text-white/85 truncate">{(who.displayName || who.username || '').split(' ')[0]}</span>
                </button>
              ))}
            </div>

            {showSearchField && (
              <div className="mt-4 flex items-center bg-black/25 border border-white/15 rounded-full px-4 py-2.5 focus-within:border-[var(--mint)] transition-colors relative">
                <Search className="w-4 h-4 text-white/70 mr-2.5 shrink-0" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search or start a new chat"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-[15px] text-white placeholder-white/55 focus:outline-none pr-6"
                  data-testid="messages-search-input"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} className="absolute right-3 text-white/70 hover:text-white" title="Clear search"><X className="w-4 h-4" /></button>
                )}
              </div>
            )}
          </div>

          {/* the big rounded sheet that holds the filters and the chats, overlapping the header */}
          <div className="msg-sheet relative z-[1] -mt-[var(--msg-r)] rounded-t-[var(--msg-r)] min-h-[70vh]">

          {/* filters (All, Unread, Favourites, Groups): all four sit inside the sheet (they scale with the screen width), a soft highlight slides to the one you pick */}
          <div ref={pillsRef} className="msg-sticky msg-pills sticky top-[-12px] z-10 rounded-t-[var(--msg-r)] pt-[22px] pb-[17px] flex items-center justify-between overflow-x-auto no-scrollbar" data-testid="messages-filters">
            {pillInd && (
              <span
                aria-hidden
                className="msg-pill-slide"
                style={{ transform: `translate3d(${pillInd.x}px, ${pillInd.y}px, 0)`, width: pillInd.w, height: pillInd.h }}
              />
            )}
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
                  ref={(el) => { pillBtnRefs.current[tab.id] = el; }}
                  onClick={() => setActiveFilterTab(tab.id)}
                  data-count={count}
                  className={`relative shrink-0 rounded-full leading-none whitespace-nowrap flex items-center cursor-pointer ${count > 0 ? '' : 'msg-pill-nocount'} ${
                    isActive
                      ? 'msg-pill-on font-semibold'
                      : 'msg-pill font-medium'
                  }`}
                >
                  <span>{tab.label}</span>
                  {count > 0 && (
                    <span
                      className={`msg-chip rounded-full text-center font-bold tabular-nums ${
                        isActive ? 'msg-chip-on' : ''
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
          <div data-testid="messages-rows" className="pb-[120px]">
            {finalFilteredConversations.length === 0 && filteredFriendsWithoutChat.length === 0 && (
              <div className="p-8 text-center text-zinc-500 text-sm space-y-2">
                <MessageCircle className="w-8 h-8 text-zinc-600 mx-auto opacity-50" />
                <p>{chatsLoaded ? 'No conversations found' : 'Loading your chats…'}</p>
              </div>
            )}

            {finalFilteredConversations.map((c) => {
              const partner =
                c.participants?.find((p) => p.id !== currentUser.id) ||
                c.participants?.[0] ||
                currentUser;
              const displayName = c.isGroup
                ? c.name || 'Group Chat'
                : c.customNickname || partner.displayName || partner.username;
              const lastMsg = c.lastMessage;
              const isMine = lastMsg?.senderId === currentUser.id || lastMsg?.senderId === 'u_me';
              const missedCall = !!lastMsg?.text && /missed call/i.test(lastMsg.text) && !lastMsg.locked;
              const avatarSize = cs['chat.compactList'] ? 'w-9 h-9' : 'w-[56px] h-[56px]';

              return (
                <div
                  key={c.id}
                  data-active={c.id === activeChatId && mobileView === 'chat' ? '1' : undefined}
                  onClick={() => {
                    setActiveChatId(c.id);
                    setMobileView('chat');
                  }}
                  className={`msg-row ${cs['chat.compactList'] ? 'px-[14px] py-1.5' : 'px-[14px] py-[11.5px]'} flex items-center gap-4 cursor-pointer group relative hover:bg-white/[0.03]`}
                >
                  {/* Left Avatar */}
                  {cs['chat.listAvatars'] && (
                  <div className="relative shrink-0">
                    {c.isGroup ? (
                      <div className="relative">
                        <img src={c.avatar || '/noob-logo-circle.png'} alt="" className={`${avatarSize} rounded-full object-cover`} />
                        <span className="absolute bottom-0 right-0 w-[19px] h-[19px] rounded-full bg-[#1f2428] border-[2.5px] border-[var(--panel)] text-white/85 flex items-center justify-center"><Users className="w-[10px] h-[10px]" /></span>
                      </div>
                    ) : (
                      <div className="relative">
                        <img
                          src={
                            partner.avatar ||
                            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'
                          }
                          alt=""
                          className={`${avatarSize} rounded-full object-cover`}
                        />
                        {isUserOnline(partner.id) && (
                          <span className="absolute bottom-0 right-0 w-4 h-4 bg-[var(--mint)] border-[2.5px] border-[var(--panel)] rounded-full" />
                        )}
                      </div>
                    )}
                  </div>
                  )}

                  {/* Middle & Right Content */}
                  <div className="flex-1 min-w-0">
                    {/* Name + time */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[17px] leading-[22px] font-semibold text-white truncate">
                          {displayName}
                        </span>
                        {!c.isGroup && partner.isVerified && <VerifiedBadge size="xs" />}
                        {c.isMuted && <BellOff className="w-[14px] h-[14px] shrink-0 text-[#6c747b]" data-testid="chat-row-muted-icon" aria-label="Notifications muted" />}
                      </div>

                      <span className="text-[12.5px] leading-4 text-[#8b9198] shrink-0 tabular-nums">
                        {listTime(c.lastMessage?.createdAt)}
                      </span>
                    </div>

                    {/* Preview (with the delivery status) + unread badge / pin */}
                    <div className="flex items-center justify-between mt-0.5 gap-2">
                      <div className={`flex items-center text-[15px] leading-5 truncate min-w-0 ${missedCall ? 'text-[#ff4f78]' : 'text-[#9aa1a8]'}`}>
                        {isMine && !missedCall && (
                          <span className="inline-flex items-center mr-1 shrink-0">
                            {lastMsg?.status === 'read' ? (
                              <CheckCheck
                                className="w-4 h-4 text-[var(--mint)]"
                                title="Seen"
                              />
                            ) : (
                              <CheckCheck className="w-4 h-4 text-[#7c848b]" title="Sent" />
                            )}
                          </span>
                        )}
                        {missedCall && <ArrowDownLeft className="w-4 h-4 mr-1 shrink-0" strokeWidth={2.4} />}
                        <span className="truncate">
                          {!cs['chat.previewInList'] && lastMsg
                            ? '💬 Message'
                            : lastMsg?.locked
                            ? '🔒 Locked message'
                            : missedCall
                            ? lastMsg!.text.replace(/^\s*\S*\s*(?=missed call)/i, '')
                            : lastMsg?.text || (c.isGroup ? 'Group channel active' : 'Chat started')}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {c.isPinned && (
                          <Pin className="w-[15px] h-[15px] text-[#6c747b]" strokeWidth={2} />
                        )}
                        {cs['chat.unreadBadges'] && c.unreadCount && c.unreadCount > 0 ? (
                          <span className={`min-w-[18px] h-[18px] px-[5px] rounded-full ${c.isMuted ? 'bg-[#6c747b]/60 text-white' : 'bg-[var(--mint)] text-[#033b2a]'} text-[11px] leading-none font-bold flex items-center justify-center tabular-nums`}>
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
              <div className="px-[14px] pt-3 space-y-2">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5 px-1">
                  <UserCheck className="w-3.5 h-3.5 text-[var(--mint)]" /> Start a new chat ({filteredFriendsWithoutChat.length})
                </span>
                <div className="space-y-1">
                  {filteredFriendsWithoutChat.map((friend) => (
                    <div
                      key={friend.id}
                      onClick={() => p.onStartChatWithUser(friend)}
                      className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-white/[0.04] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <img
                          src={friend.avatar}
                          alt={friend.username}
                          className="w-11 h-11 rounded-full object-cover shrink-0"
                        />
                        <div className="truncate">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[16px] font-semibold text-white truncate">
                              {friend.displayName || friend.username}
                            </span>
                            {friend.isVerified && <VerifiedBadge size="xs" />}
                          </div>
                          <span className="text-[13px] text-[#9aa1a8] truncate block">
                            @{friend.username} • Friend
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="px-3 h-8 bg-[var(--mint)] text-[#033b2a] font-bold text-[13px] rounded-full transition-colors shrink-0"
                      >
                        Chat
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          </div>
          {showLeftMenu && leftMenuPos && (
                  <div ref={menuPanelRef} style={{ top: leftMenuPos.top, right: leftMenuPos.right }} className="absolute w-60 bg-[#101314] border border-white/10 rounded-2xl p-1.5 shadow-2xl z-30 animate-in fade-in zoom-in-95 duration-150" data-testid="messages-menu">
                    <button onClick={() => { setShowLeftMenu(false); if (window.history.length > 1) window.history.back(); }} data-testid="messages-back" className="w-full px-3 py-2.5 rounded-xl hover:bg-white/5 flex items-center gap-2.5 text-left text-[14px] font-medium text-zinc-200 hover:text-white transition-colors cursor-pointer">
                      <ChevronLeft className="w-4 h-4 text-zinc-300" /> Back
                    </button>
                    <button onClick={() => { setShowLeftMenu(false); p.onShowCreateGroup(); }} data-testid="messages-new-group" className="w-full px-3 py-2.5 rounded-xl hover:bg-white/5 flex items-center gap-2.5 text-left text-[14px] font-medium text-zinc-200 hover:text-white transition-colors cursor-pointer">
                      <Users className="w-4 h-4 text-[var(--mint)]" /> New Group Chat
                    </button>
                    <button onClick={() => { setShowLeftMenu(false); p.onShowSettings(); }} className="w-full px-3 py-2.5 rounded-xl hover:bg-white/5 flex items-center gap-2.5 text-left text-[14px] font-medium text-zinc-200 hover:text-white transition-colors cursor-pointer">
                      <Palette className="w-4 h-4 text-[var(--mint)]" /> Chat Bubble Theme
                    </button>
                    <button onClick={() => { setShowLeftMenu(false); p.onShowInstantsArchive(); }} data-testid="instants-archive-open" className="w-full px-3 py-2.5 rounded-xl hover:bg-white/5 flex items-center gap-2.5 text-left text-[14px] font-medium text-zinc-200 hover:text-white transition-colors cursor-pointer">
                      <Archive className="w-4 h-4 text-amber-300" /> Your Instants
                    </button>
                    <button onClick={() => { setShowLeftMenu(false); p.onShowE2ee(); }} data-testid="messages-e2ee" className="w-full px-3 py-2.5 rounded-xl hover:bg-white/5 flex items-center gap-2.5 text-left text-[14px] font-medium text-zinc-200 hover:text-white transition-colors cursor-pointer">
                      <Lock className="w-4 h-4 text-zinc-400" /> End-to-end encryption
                    </button>
                    <button onClick={() => { setShowLeftMenu(false); p.onShowChatSettings(); }} data-testid="chat-settings-button" className="w-full px-3 py-2.5 rounded-xl hover:bg-white/5 flex items-center gap-2.5 text-left text-[14px] font-medium text-zinc-200 hover:text-white transition-colors cursor-pointer">
                      <Settings className="w-4 h-4 text-sky-400" /> Chat Settings
                    </button>
                  </div>
                )}
          </div>

    </aside>
  );
}

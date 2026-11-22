import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Camera, Check, Loader2, Search, X } from 'lucide-react';
import { User, ChatConversation } from '../../types';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { createGroupChat, uploadMediaFile } from '../../services/api';
import './groupChat.css';

// "New group", laid out like WhatsApp's: first the people (a bar with the chosen ones on top, a search, a list with a round tick on the picture, a round arrow button), then the group's
// name and picture (the big camera circle, the name with a line under it, the people who will be in it, a round check button). The rules are the same as before: the name, one picture
// and at least one friend are needed, and the person who makes the group is its admin.

interface CreateGroupModalProps {
  isOpen: boolean;
  currentUser: User;
  availableUsers: User[];
  onClose: () => void;
  onGroupCreated: (newChat: ChatConversation) => void;
}

const Face: React.FC<{ user: User; size: number }> = ({ user, size }) => {
  const [broken, setBroken] = useState(false);
  const box = { width: size, height: size } as const;
  return user.avatar && !broken ? (
    <img src={user.avatar} alt="" style={box} className="gc-face" onError={() => setBroken(true)} referrerPolicy="no-referrer" />
  ) : (
    <span style={{ ...box, fontSize: Math.round(size * 0.42) }} className="gc-face gc-face--letter" translate="no">{(user.displayName || user.username).slice(0, 1).toUpperCase()}</span>
  );
};

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ isOpen, currentUser, availableUsers, onClose, onGroupCreated }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [groupName, setGroupName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMasterAdmin = !!currentUser.isAdmin || currentUser.username?.toLowerCase() === 'noob' || currentUser.id === 'u_noob_admin';

  // friends: people who follow you or whom you follow (the main administrator can add anybody)
  const friendsList = useMemo(() => availableUsers.filter((u) => {
    if (u.id === currentUser.id || u.isAi) return false;
    if (isMasterAdmin) return true;
    const isFollowing = u.isFollowing || currentUser.followingIds?.includes(u.id);
    const isFollower = u.followers?.includes?.(currentUser.id) || currentUser.followers?.includes?.(u.id);
    return isFollowing || isFollower || availableUsers.length <= 4;
  }), [availableUsers, currentUser, isMasterAdmin]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? friendsList.filter((u) => u.username.toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q)) : friendsList;
    return [...list].sort((a, b) => (a.displayName || a.username).localeCompare(b.displayName || b.username));
  }, [friendsList, query]);

  const selected = useMemo(() => selectedUserIds.map((id) => friendsList.find((u) => u.id === id)).filter(Boolean) as User[], [selectedUserIds, friendsList]);

  if (!isOpen) return null;

  const toggle = (id: string) => setSelectedUserIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const readLocally = () => { const reader = new FileReader(); reader.onload = () => { if (reader.result) setAvatarUrl(reader.result as string); }; reader.readAsDataURL(file); };
    try {
      setIsUploading(true);
      setErrorMsg('');
      // the same invisible picture compression every other upload in the app uses
      const data = await uploadMediaFile(file, 'avatars');
      if (data.success && data.url) setAvatarUrl(data.url); else readLocally();
    } catch {
      readLocally();
    } finally {
      setIsUploading(false);
    }
  };

  const create = async () => {
    if (loading) return;
    if (!groupName.trim()) { setErrorMsg('Type a group name.'); return; }
    if (selectedUserIds.length === 0) { setErrorMsg('Add at least one person.'); return; }
    if (!avatarUrl) { setErrorMsg('Add a group picture.'); return; }
    try {
      setLoading(true);
      setErrorMsg('');
      const result = await createGroupChat(groupName.trim(), avatarUrl, [...selectedUserIds, currentUser.id], `Created by @${currentUser.username}`);
      if (!result.success || !result.chat) throw new Error('Could not create the group. Please try again.');
      onGroupCreated(result.chat);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not create the group. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => { if (step === 2) { setStep(1); setErrorMsg(''); } else onClose(); };

  // drawn straight into the page: inside the chat page the bottom bar of the app would be drawn over it
  return createPortal(
    <div className="gc-root fixed inset-0 z-[125] flex flex-col" role="dialog" aria-modal="true" aria-label="New group" data-testid="create-group-page">
      {/* the bar: back, the title, and under it how many are chosen (step 1) or what to do (step 2) */}
      <header className="gc-bar">
        <button type="button" onClick={goBack} aria-label="Back" data-testid="group-back" className="gc-iconbtn"><ArrowLeft className="w-6 h-6" /></button>
        {searching && step === 1 ? (
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or username" aria-label="Search" className="gc-search" />
        ) : (
          <div className="min-w-0 flex-1">
            <h1 className="gc-title">New group</h1>
            <p className="gc-sub">{step === 1 ? (selected.length === 0 ? 'Add participants' : `${selected.length} of ${friendsList.length} selected`) : 'Add subject'}</p>
          </div>
        )}
        {step === 1 && (
          <button type="button" onClick={() => { if (searching) { setSearching(false); setQuery(''); } else setSearching(true); }} aria-label={searching ? 'Close search' : 'Search'} className="gc-iconbtn">
            {searching ? <X className="w-6 h-6" /> : <Search className="w-6 h-6" />}
          </button>
        )}
      </header>

      {step === 1 ? (
        <>
          {selected.length > 0 && (
            <div className="gc-chips" data-testid="group-chosen">
              {selected.map((u) => (
                <button key={u.id} type="button" onClick={() => toggle(u.id)} aria-label={`Remove ${u.displayName || u.username}`} className="gc-chip">
                  <span className="relative">
                    <Face user={u} size={56} />
                    <span className="gc-chip-x"><X className="w-3 h-3" strokeWidth={3} /></span>
                  </span>
                  <span className="gc-chip-name" translate="no">{(u.displayName || u.username).split(' ')[0]}</span>
                </button>
              ))}
            </div>
          )}
          <div className="gc-list" data-testid="group-people">
            {filtered.length === 0 ? (
              <p className="gc-empty">{query ? 'Nobody matches your search.' : isMasterAdmin ? 'No other users found.' : 'No friends yet. Follow people to add them to a group.'}</p>
            ) : (
              <ul>
                {filtered.map((u) => {
                  const on = selectedUserIds.includes(u.id);
                  return (
                    <li key={u.id}>
                      <button type="button" onClick={() => toggle(u.id)} aria-pressed={on} className="gc-row">
                        <span className="relative shrink-0">
                          <Face user={u} size={49} />
                          {on && <span className="gc-tick"><Check className="w-3.5 h-3.5" strokeWidth={3.5} /></span>}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="gc-name"><span className="block truncate" translate="no">{u.displayName || u.username}</span>{u.isVerified && <VerifiedBadge size="xs" />}</span>
                          <span className="gc-status block truncate" translate="no">@{u.username}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {selected.length > 0 && (
            <button type="button" onClick={() => { setStep(2); setSearching(false); setQuery(''); setErrorMsg(''); }} aria-label="Next" data-testid="group-next" className="gc-fab"><ArrowRight className="w-6 h-6" /></button>
          )}
        </>
      ) : (
        <>
          <div className="gc-list">
            <div className="gc-subject">
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} aria-label={avatarUrl ? 'Change the group picture' : 'Add a group picture'} data-testid="group-photo" className="gc-photo">
                {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : isUploading ? <Loader2 className="w-7 h-7 animate-spin" /> : <Camera className="w-8 h-8" />}
                {avatarUrl && isUploading && <span className="absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 className="w-7 h-7 animate-spin text-white" /></span>}
              </button>
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={groupName}
                  maxLength={40}
                  onChange={(e) => { setGroupName(e.target.value); setErrorMsg(''); }}
                  placeholder="Group name (required)"
                  aria-label="Group name"
                  data-testid="group-name"
                  className="gc-nameinput"
                />
                <div className="gc-counter">{40 - groupName.length}</div>
              </div>
            </div>
            <p className="gc-note">Add a group picture and a name. You will be the group admin and can make others admins or remove people later.</p>

            <h2 className="gc-section">Participants: {selected.length} of {friendsList.length}</h2>
            <div className="gc-people-grid">
              {selected.map((u) => (
                <div key={u.id} className="gc-person">
                  <Face user={u} size={56} />
                  <span className="gc-chip-name" translate="no">{(u.displayName || u.username).split(' ')[0]}</span>
                </div>
              ))}
            </div>
            {errorMsg && <p className="gc-error" role="alert">{errorMsg}</p>}
          </div>
          <button type="button" onClick={() => void create()} disabled={loading} aria-label="Create group" data-testid="group-create" className="gc-fab">
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Check className="w-7 h-7" strokeWidth={3} />}
          </button>
        </>
      )}
    </div>,
    document.body
  );
};

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Lock, ShieldCheck, UserCheck, UserPlus, Users, EyeOff, HandHeart, Share2 } from 'lucide-react';
import { User } from '../../types';
import { getContactsPermissionState, scanContacts } from '../../services/contactSync';
import { siteOrigin } from '../../utils/siteUrl';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import './findfriends.css';

interface FindFriendsModalProps {
  currentUser: User;
  registeredUsers: User[];
  onClose: () => void;
  onToggleFollowUser: (userId: string) => void;
}

type Stage = 'intro' | 'loading' | 'results' | 'empty' | 'denied' | 'error' | 'web';

/**
 * "Find friends": a white, calm page. Nothing is asked of the phone until the person presses the green button, and the page says in plain words what is and is not done with the contacts.
 * (The numbers are only compared on our server to find NOOB members: they are not saved and never shown to anybody.)
 */
export const FindFriendsModal: React.FC<FindFriendsModalProps> = ({ currentUser, registeredUsers, onClose, onToggleFollowUser }) => {
  const [stage, setStage] = useState<Stage>('intro');
  const [people, setPeople] = useState<User[]>([]);

  useEffect(() => {
    let alive = true;
    void getContactsPermissionState().then((s) => {
      if (!alive) return;
      if (s === 'unsupported') {
        // the website has no way to read contacts: show a few people to follow instead
        const pool = registeredUsers.filter((u) => u.id !== currentUser.id && !u.isFollowing);
        setPeople([...pool].sort(() => Math.random() - 0.5).slice(0, 6));
        setStage('web');
      } else if (s === 'denied') setStage('denied');
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allow = async () => {
    setStage('loading');
    const r = await scanContacts();
    if (r.status === 'ok') { setPeople(r.users); setStage('results'); }
    else if (r.status === 'denied') setStage('denied');
    else if (r.status === 'empty') setStage('empty');
    else setStage('error');
  };

  const follow = (user: User) => {
    setPeople((prev) => prev.map((u) => (u.id === user.id ? { ...u, isFollowing: !u.isFollowing } : u)));
    onToggleFollowUser(user.id);
  };

  const invite = async () => {
    const url = siteOrigin();
    const text = 'Join me on NOOB Socials: reels, chat, games and more.';
    try { if (navigator.share) { await navigator.share({ title: 'NOOB Socials', text, url }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(`${text} ${url}`); } catch { /* nothing to do */ }
  };

  const list = (
    <div>
      {people.map((u) => (
        <div key={u.id} className="ff-person">
          <img src={u.avatar || '/noob-logo-circle.png'} alt="" referrerPolicy="no-referrer" />
          <div className="ff-who">
            <b><span>{u.displayName || u.username}</span>{u.isVerified && <VerifiedBadge size="sm" />}</b>
            <small>@{u.username}</small>
          </div>
          <button type="button" className={`ff-follow ${u.isFollowing ? 'on' : ''}`} onClick={() => follow(u)}>
            {u.isFollowing ? <><UserCheck size={16} /> Noobed</> : <><UserPlus size={16} /> Noob</>}
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <div className="ff-root" role="dialog" aria-modal="true" aria-label="Find friends" data-testid="find-friends-page">
      <div className="ff-bar">
        <button type="button" className="ff-back" onClick={onClose} aria-label="Back"><ArrowLeft size={20} /></button>
        <h2 className="ff-title">Find friends</h2>
      </div>

      <div className="ff-body">
        <div className="ff-col">
          {stage === 'intro' && (
            <>
              <div className="ff-hero">
                <div className="ff-shield"><ShieldCheck size={42} /></div>
                <h3 className="ff-h1">Find people you know on NOOB</h3>
                <p className="ff-lead">See which of your phone contacts are already here, and follow them in one tap. It only happens if you allow it.</p>
              </div>
              <div className="ff-card">
                <div className="ff-row"><span className="ff-ico"><HandHeart size={20} /></span><div><b>You are in control</b><span>Your phone will ask for your permission first. You can say no and keep using NOOB as normal.</span></div></div>
                <div className="ff-row"><span className="ff-ico"><Lock size={20} /></span><div><b>Your contacts stay private</b><span>Phone numbers are only compared to find NOOB members. NOOB does not save them, show them to anyone, or use them for ads.</span></div></div>
                <div className="ff-row"><span className="ff-ico"><EyeOff size={20} /></span><div><b>Only people on NOOB appear</b><span>You see members who signed up with a number in your contacts. Nobody is told that you looked.</span></div></div>
              </div>
              <p className="ff-note">Read our <a href="/privacy">Privacy Policy</a>. You can turn this off any time in your phone&rsquo;s settings.</p>
            </>
          )}

          {stage === 'loading' && (
            <div className="ff-center"><div className="ff-spin" /><b style={{ color: '#0f172a' }}>Looking for your friends&hellip;</b><span>This takes a few seconds.</span></div>
          )}

          {stage === 'results' && (
            <>
              <div className="ff-chip"><Users size={18} /> We found {people.length} {people.length === 1 ? 'friend' : 'friends'} from your contacts</div>
              {list}
            </>
          )}

          {stage === 'empty' && (
            <div className="ff-center">
              <div className="ff-shield"><Users size={40} /></div>
              <h3 className="ff-h1">None of your contacts are on NOOB yet</h3>
              <span>When they join with the number saved in your phone, they will show up here. You can invite them now.</span>
            </div>
          )}

          {stage === 'denied' && (
            <>
              <div className="ff-hero">
                <div className="ff-shield"><Lock size={40} /></div>
                <h3 className="ff-h1">Contacts access is off</h3>
                <p className="ff-lead">That is fine, nothing was read. If you change your mind, you can switch it on:</p>
              </div>
              <div className="ff-card" style={{ padding: 16 }}>
                <ol className="ff-steps">
                  <li>Open your phone&rsquo;s <b>Settings</b>, then <b>Apps</b>, then <b>NOOB</b>.</li>
                  <li>Tap <b>Permissions</b>, then <b>Contacts</b>.</li>
                  <li>Choose <b>Allow</b>, come back here and press the green button.</li>
                </ol>
              </div>
            </>
          )}

          {stage === 'error' && (
            <div className="ff-center">
              <div className="ff-shield"><ShieldCheck size={40} /></div>
              <h3 className="ff-h1">That did not work this time</h3>
              <span>Nothing was saved. Please check your internet and try again.</span>
            </div>
          )}

          {stage === 'web' && (
            <>
              <div className="ff-hero">
                <div className="ff-shield"><ShieldCheck size={42} /></div>
                <h3 className="ff-h1">Finding friends from contacts is in the Android app</h3>
                <p className="ff-lead">A website cannot read your contacts, which keeps them safe. Here are some people on NOOB you might like.</p>
              </div>
              {people.length > 0 ? list : <p className="ff-note">No suggestions right now. Check back later.</p>}
            </>
          )}
        </div>
      </div>

      <div className="ff-foot">
        <div className="ff-foot-in">
          {stage === 'intro' && (<>
            <button type="button" className="ff-btn primary" onClick={allow}><ShieldCheck size={20} /> Allow and find friends</button>
            <button type="button" className="ff-btn ghost" onClick={onClose}>Not now</button>
          </>)}
          {stage === 'loading' && <button type="button" className="ff-btn ghost" disabled>Please wait&hellip;</button>}
          {(stage === 'results' || stage === 'web') && <button type="button" className="ff-btn primary" onClick={onClose}>Done</button>}
          {stage === 'empty' && (<>
            <button type="button" className="ff-btn primary" onClick={invite}><Share2 size={20} /> Invite friends</button>
            <button type="button" className="ff-btn ghost" onClick={onClose}>Done</button>
          </>)}
          {stage === 'denied' && (<>
            <button type="button" className="ff-btn primary" onClick={allow}>Try again</button>
            <button type="button" className="ff-btn ghost" onClick={onClose}>Not now</button>
          </>)}
          {stage === 'error' && (<>
            <button type="button" className="ff-btn primary" onClick={allow}>Try again</button>
            <button type="button" className="ff-btn ghost" onClick={onClose}>Close</button>
          </>)}
        </div>
      </div>
    </div>
  );
};

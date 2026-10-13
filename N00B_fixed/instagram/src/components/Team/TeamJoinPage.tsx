import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, ChevronLeft, Clock, Fingerprint, GraduationCap, Loader2, PartyPopper, RefreshCw, Sparkles, UserRound, Users } from 'lucide-react';
import type { User } from '../../types';
import { discardTeamPhoto, fetchMyTeamApplication, submitTeamJoin, uploadTeamPhoto } from '../../services/api';
import type { MyTeamApplication } from '../../utils/ourTeam';
import { TEAM_LIMITS, validateTeamForm } from '../../utils/ourTeam';
import { resolveMedia } from '../../services/supabase';

// "Join the NOOB team page": opened by the link the administrator shares (?team=join). The person is signed in, so their User ID and account ID are
// attached automatically (never typed). What they send waits for the administrator, or goes live at once when that switch is on.

interface Props {
  currentUser: User;
  onClose: () => void;
}

const field = 'w-full rounded-2xl bg-white/[0.06] border border-white/12 focus:border-amber-300 outline-none px-3.5 py-3 text-[13px] text-white placeholder:text-zinc-500';

export const TeamJoinPage: React.FC<Props> = ({ currentUser, onClose }) => {
  const [info, setInfo] = useState<MyTeamApplication | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState(currentUser.displayName || '');
  const [qualification, setQualification] = useState('');
  const [description, setDescription] = useState('');
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'pending' | 'approved' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const freshKeys = useRef<string[]>([]);   // photos uploaded in this form and not (yet) sent: removed again when replaced or when the form is left

  const load = useCallback(async () => {
    setFailed(false);
    const res = await fetchMyTeamApplication();
    if (!res) { setFailed(true); return; }
    setInfo(res);
    if (res.application) {
      setName(res.application.name || currentUser.displayName || '');
      setQualification(res.application.qualification);
      setDescription(res.application.description);
      setPhotoKey(res.application.photo);
      setPhotoUrl(res.application.photoUrl);
    }
  }, [currentUser.displayName]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => () => { for (const k of freshKeys.current) discardTeamPhoto(k); }, []);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    const res = await uploadTeamPhoto(file);
    setUploading(false);
    if (!res.success || !res.key) { setError(res.error || 'The photo could not be uploaded.'); return; }
    freshKeys.current.filter((k) => k !== res.key).forEach((k) => discardTeamPhoto(k));
    freshKeys.current = [res.key];
    setPhotoKey(res.key);
    setPhotoUrl(res.url || null);
  };

  // The profile picture, copied into the team folder (so it stays even if the profile picture is changed later).
  const useProfilePicture = async () => {
    setError(null);
    try {
      const resp = await fetch(resolveMedia(currentUser.avatar));
      if (!resp.ok) throw new Error('no picture');
      const blob = await resp.blob();
      if (!/^image\//.test(blob.type)) throw new Error('not a picture');
      await pickPhoto(new File([blob], 'profile.jpg', { type: blob.type }));
    } catch {
      setError('Your profile picture could not be used. Please choose a photo instead.');
    }
  };

  const send = async () => {
    const problem = validateTeamForm({ name, qualification, description, hasPhoto: !!photoKey });
    if (problem) { setError(problem.replace('the name', 'your name').replace('the qualification', 'your qualification')); return; }
    setSending(true);
    setError(null);
    const res = await submitTeamJoin({ name: name.trim(), qualification: qualification.trim(), description: description.trim(), photoKey });
    setSending(false);
    if (!res.success) { setError(res.error || 'Your application could not be sent.'); return; }
    freshKeys.current = [];
    // an earlier application's photo that this one replaces is no longer needed (an approved one's file was already removed with the member)
    const before = info?.application;
    if (before && (before.status === 'pending' || before.status === 'rejected') && before.photo && before.photo !== photoKey) discardTeamPhoto(before.photo);
    setDone(res.status === 'approved' ? 'approved' : 'pending');
  };

  const status = info?.application?.status;

  return (
    <div className="fixed inset-0 z-[212] team-stage text-white force-dark flex flex-col" role="dialog" aria-label="Join the NOOB team page">
      <div className="shrink-0 flex items-center gap-3 px-4 pb-2.5 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-white/8 bg-black/30 backdrop-blur-xl">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/8 border border-white/10 flex items-center justify-center cursor-pointer" aria-label="Close"><ChevronLeft className="w-5 h-5" /></button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-300 to-pink-400 flex items-center justify-center"><Users className="w-4 h-4 text-black" /></span>
          <span className="text-[14px] font-black italic tracking-tight whitespace-nowrap">JOIN THE TEAM</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-md mx-auto px-5 pt-8 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
          {failed ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center space-y-3">
              <p className="text-sm font-bold">The form could not load</p>
              <p className="text-xs text-zinc-400">Check your connection and try again. If it keeps happening, the update may still be installing.</p>
              <button onClick={() => void load()} className="px-5 py-2.5 rounded-xl bg-white text-black text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Try again</button>
            </div>
          ) : !info ? (
            <div className="py-16 flex justify-center" aria-busy="true"><Loader2 className="w-6 h-6 text-zinc-400 animate-spin" /></div>
          ) : done ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-7 text-center space-y-3 draw-rise">
              <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-300 to-pink-400 flex items-center justify-center mx-auto"><PartyPopper className="w-7 h-7 text-black" /></span>
              <h1 className="draw-sans text-2xl italic">{done === 'approved' ? 'You are on the team!' : 'Application sent'}</h1>
              <p className="text-[13px] text-zinc-300 leading-relaxed">
                {done === 'approved'
                  ? 'Your photo, name and qualification are on the Our Team page now, with your NOOB User ID. Open the Home menu → Our Team to see it.'
                  : 'Thank you. The NOOB team will look at it, and you will get a notification when you are added to the Our Team page.'}
              </p>
              <button onClick={onClose} className="mt-2 px-6 py-2.5 rounded-xl bg-white text-black text-xs font-black cursor-pointer">Done</button>
            </div>
          ) : info.onTeam ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-7 text-center space-y-3">
              <Check className="w-9 h-9 mx-auto text-emerald-400" />
              <h1 className="draw-sans text-2xl italic">You are already on the team</h1>
              <p className="text-[13px] text-zinc-300 leading-relaxed">You are on the Our Team page. Open the Home menu → Our Team to see it. To change your details, ask the NOOB team.</p>
              <button onClick={onClose} className="mt-2 px-6 py-2.5 rounded-xl bg-white text-black text-xs font-black cursor-pointer">Close</button>
            </div>
          ) : !info.open ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-7 text-center space-y-3">
              <Clock className="w-9 h-9 mx-auto text-amber-300" />
              <h1 className="draw-sans text-2xl italic">Applications are closed</h1>
              <p className="text-[13px] text-zinc-300 leading-relaxed">The Our Team page is not taking new people right now. Please check back later.</p>
              <button onClick={onClose} className="mt-2 px-6 py-2.5 rounded-xl bg-white text-black text-xs font-black cursor-pointer">Close</button>
            </div>
          ) : (
            <>
              <div className="text-center">
                <p className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/8 border border-white/12 text-[10px] font-bold uppercase tracking-[0.28em] text-amber-200">
                  <Sparkles className="w-3 h-3" /> Join us
                </p>
                <h1 className="draw-sans team-title mt-3 text-[34px] leading-[1.08] italic">Be on the team page</h1>
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">Tell people who you are. After the NOOB team says yes, your card shows on the Our Team page.</p>
              </div>

              {status === 'pending' && (
                <div className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-[12px] text-amber-100 leading-snug flex gap-2.5">
                  <Clock className="w-4 h-4 mt-0.5 shrink-0" /> Your application is waiting for review. You can change it below and send it again.
                </div>
              )}
              {status === 'rejected' && (
                <div className="mt-5 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-[12px] text-zinc-300 leading-snug">
                  Your last application was not accepted. You are welcome to improve it and apply again.
                </div>
              )}
              {status === 'approved' && (
                <div className="mt-5 rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-[12px] text-zinc-300 leading-snug">
                  You were on the team page before. Send the form again to be added back.
                </div>
              )}

              {/* the account: taken from the login, shown so the person sees what will be attached */}
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 flex items-center gap-3">
                <span className="w-10 h-10 rounded-full overflow-hidden bg-white/10 shrink-0 flex items-center justify-center">
                  {currentUser.avatar ? <img src={resolveMedia(currentUser.avatar)} alt="" className="w-full h-full object-cover" /> : <UserRound className="w-5 h-5 text-zinc-400" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-bold truncate">@{currentUser.username}</p>
                  <p className="text-[10px] text-zinc-400 flex items-center gap-1"><Fingerprint className="w-3 h-3 shrink-0" /> <span className="truncate">Account ID {currentUser.id}</span></p>
                </div>
                <span className="ml-auto shrink-0 text-[10px] font-bold text-emerald-300">Added automatically</span>
              </div>

              <div className="mt-5 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || sending}
                  className="relative w-28 h-36 shrink-0 rounded-3xl overflow-hidden border border-dashed border-white/25 bg-white/[0.05] flex items-center justify-center cursor-pointer disabled:opacity-60"
                  aria-label="Choose your photo"
                >
                  {photoUrl ? <img src={photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <Camera className="w-7 h-7 text-zinc-500" />}
                  {uploading && <span className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin" /></span>}
                </button>
                <div className="space-y-2 min-w-0">
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || sending} className="px-3.5 py-2 rounded-xl bg-white/10 border border-white/15 text-xs font-bold cursor-pointer disabled:opacity-60">
                    {photoKey ? 'Change photo' : 'Choose photo'}
                  </button>
                  <button type="button" onClick={() => void useProfilePicture()} disabled={uploading || sending} className="block px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-zinc-300 cursor-pointer disabled:opacity-60">
                    Use my profile picture
                  </button>
                  <p className="text-[10px] text-zinc-500 leading-snug">A clear portrait works best.</p>
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void pickPhoto(f); }} />
              </div>

              <label className="block mt-5 space-y-1.5">
                <span className="text-[11px] font-bold text-zinc-300 flex justify-between">Your name <span className="text-zinc-500 font-medium">{name.length}/{TEAM_LIMITS.name}</span></span>
                <input value={name} maxLength={TEAM_LIMITS.name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className={field} />
              </label>
              <label className="block mt-4 space-y-1.5">
                <span className="text-[11px] font-bold text-zinc-300 flex items-center justify-between"><span className="flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5" /> Qualification</span> <span className="text-zinc-500 font-medium">{qualification.length}/{TEAM_LIMITS.qualification}</span></span>
                <input value={qualification} maxLength={TEAM_LIMITS.qualification} onChange={(e) => setQualification(e.target.value)} placeholder="e.g. B.Tech in Computer Science" className={field} />
              </label>
              <label className="block mt-4 space-y-1.5">
                <span className="text-[11px] font-bold text-zinc-300 flex justify-between">About you <span className="text-zinc-500 font-medium">{description.length}/{TEAM_LIMITS.description}</span></span>
                <textarea value={description} maxLength={TEAM_LIMITS.description} rows={5} onChange={(e) => setDescription(e.target.value)} placeholder="A few lines about you and what you do or want to do for NOOB" className={`${field} resize-y`} />
              </label>

              <p className="mt-4 text-[11px] text-zinc-500 leading-relaxed">Your photo, name, qualification, description and NOOB User ID show on the public Our Team page once you are added.</p>

              {error && <div className="mt-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs font-semibold px-4 py-3">{error}</div>}

              <button
                onClick={() => void send()}
                disabled={sending || uploading}
                className="mt-5 w-full py-3.5 rounded-2xl font-black text-sm text-black cursor-pointer active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(90deg, #fbbf24, #f472b6)', boxShadow: '0 14px 36px -12px rgba(251,191,36,0.6)' }}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {status === 'pending' ? 'Send again' : 'Send my application'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TeamJoinPage;

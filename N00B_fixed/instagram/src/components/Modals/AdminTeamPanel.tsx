import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BadgeCheck, Camera, Check, Copy, Fingerprint, GraduationCap, Link2, Loader2, Pencil, Pin, Plus, RefreshCw, Share2, Trash2, UserRound, Users, X } from 'lucide-react';
import { decideTeamApplication, deleteTeamMember, discardTeamPhoto, eraseTeamApplication, fetchTeamApplications, fetchTeamMembers, moveTeamMember, pinTeamMember, saveTeamMember, saveTeamSettings, uploadTeamPhoto } from '../../services/api';
import type { TeamAdminState, TeamApplicationRow, TeamMember } from '../../utils/ourTeam';
import { TEAM_JOIN_LINK, TEAM_LIMITS, cardNumber, initials, validateTeamForm } from '../../utils/ourTeam';

// Admin panel → "Our Team": adds, edits, reorders and removes the people shown on the "Our Team" page in the Home menu.
// Each member needs a photo, a name, a qualification and a short description. People can also join themselves from a link (Applications):
// their User ID comes from their login, and one tap adds them to the page.

interface Draft {
  id: string | null;
  name: string;
  qualification: string;
  description: string;
  photoKey: string | null;   // what is saved
  photoUrl: string | null;   // what is shown in the form
  originalKey: string | null;
  username: string;          // the NOOB User ID this card belongs to (optional)
}

const EMPTY: Draft = { id: null, name: '', qualification: '', description: '', photoKey: null, photoUrl: null, originalKey: null, username: '' };
const field = 'w-full rounded-xl bg-zinc-900 border border-zinc-700 focus:border-amber-400 outline-none px-3 py-2.5 text-xs text-white placeholder:text-zinc-500';

// The small picture in the list; a photo that cannot be loaded shows the initials instead of a broken-picture icon.
const Thumb: React.FC<{ member: TeamMember; number: string }> = ({ member, number }) => {
  const [broken, setBroken] = useState(false);
  return (
    <div className="relative w-12 h-14 shrink-0 rounded-lg overflow-hidden bg-zinc-900 flex items-center justify-center text-[13px] font-black text-amber-200">
      {member.photo && !broken ? <img src={member.photo} alt="" onError={() => setBroken(true)} className="absolute inset-0 w-full h-full object-cover" loading="lazy" /> : initials(member.name)}
      <span className="absolute left-1 bottom-1 px-1.5 rounded-full bg-black/65 text-[9px] font-black tracking-wider text-white tabular-nums" title="The number on the team page">{number}</span>
    </div>
  );
};

const when = (iso: string | null) => { try { return iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; } catch { return ''; } };

const Switch: React.FC<{ on: boolean; busy: boolean; onChange: () => void; label: string; hint: string }> = ({ on, busy, onChange, label, hint }) => (
  <button type="button" onClick={onChange} disabled={busy} className="w-full flex items-center gap-3 text-left cursor-pointer disabled:opacity-60" role="switch" aria-checked={on}>
    <span className="min-w-0 flex-1">
      <span className="block text-xs font-bold text-white">{label}</span>
      <span className="block text-[11px] text-zinc-400 leading-snug">{hint}</span>
    </span>
    <span className={`relative w-10 h-6 rounded-full shrink-0 transition-colors ${on ? 'bg-amber-400' : 'bg-zinc-700'}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </span>
  </button>
);

interface Props {
  // Lets the tab show how many applications still wait.
  onPendingChange?: (count: number) => void;
}

export const AdminTeamPanel: React.FC<Props> = ({ onPendingChange }) => {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [adminState, setAdminState] = useState<TeamAdminState | null>(null);
  const [tab, setTab] = useState<'members' | 'applications'>('members');
  const [copied, setCopied] = useState(false);
  const [settingBusy, setSettingBusy] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [eraseId, setEraseId] = useState<string | null>(null);   // the application whose "delete their data" is waiting for a second tap
  const [loadError, setLoadError] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Photos uploaded in the open form that are not (yet) the saved one: removed again if the form is cancelled or another photo replaces them.
  const freshKeys = useRef<string[]>([]);

  const load = useCallback(async () => {
    setLoadError(false);
    const [t, a] = await Promise.all([fetchTeamMembers(), fetchTeamApplications()]);
    if (t) setTeam(t); else setLoadError(true);
    if (a.success && a.state) setAdminState(a.state);
  }, []);
  useEffect(() => { onPendingChange?.(adminState ? adminState.applications.filter((x) => x.status === 'pending').length : 0); }, [adminState, onPendingChange]);
  useEffect(() => { void load(); }, [load]);

  const say = (text: string) => { setFlash(text); window.setTimeout(() => setFlash((cur) => (cur === text ? null : cur)), 2800); };

  const discardFresh = (except?: string | null) => {
    for (const k of freshKeys.current) if (k !== except) discardTeamPhoto(k);
    freshKeys.current = [];
  };
  const openForm = (m?: TeamMember) => {
    discardFresh();
    setError(null);
    setDraft(m ? { id: m.id, name: m.name, qualification: m.qualification, description: m.description, photoKey: m.photoKey, photoUrl: m.photo, originalKey: m.photoKey, username: m.username || '' } : { ...EMPTY });
  };
  const closeForm = () => { discardFresh(); setDraft(null); setError(null); };

  const pickPhoto = async (file: File | undefined) => {
    if (!file || !draft) return;
    setError(null);
    setUploading(true);
    const res = await uploadTeamPhoto(file);
    setUploading(false);
    if (!res.success || !res.key) { setError(res.error || 'The photo could not be uploaded.'); return; }
    // an earlier photo chosen in this same form is no longer needed
    const previousFresh = freshKeys.current.filter((k) => k !== res.key);
    previousFresh.forEach((k) => discardTeamPhoto(k));
    freshKeys.current = [res.key];
    setDraft((d) => (d ? { ...d, photoKey: res.key!, photoUrl: res.url || null } : d));
  };

  const save = async () => {
    if (!draft) return;
    const problem = validateTeamForm({ name: draft.name, qualification: draft.qualification, description: draft.description, hasPhoto: !!draft.photoKey });
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError(null);
    const res = await saveTeamMember({
      id: draft.id, name: draft.name.trim(), qualification: draft.qualification.trim(), description: draft.description.trim(),
      photoKey: draft.photoKey, replacedPhotoKey: draft.originalKey, username: draft.username
    });
    setSaving(false);
    if (!res.success) { setError(res.error || 'The team member could not be saved.'); return; }
    freshKeys.current = [];
    setTeam(res.team || []);
    setDraft(null);
    say(draft.id ? 'Saved. The team page is updated.' : 'Added. They now show on the team page.');
  };

  const act = async (id: string, run: () => ReturnType<typeof moveTeamMember>, done?: string) => {
    setBusyId(id);
    setError(null);
    const res = await run();
    setBusyId(null);
    if (!res.success) { setError(res.error || 'That did not work. Please try again.'); return; }
    setTeam(res.team || []);
    if (done) say(done);
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(TEAM_JOIN_LINK); setCopied(true); window.setTimeout(() => setCopied(false), 2200); }
    catch { setError('The link could not be copied. Select it and copy it by hand.'); }
  };
  const shareLink = async () => {
    try { await navigator.share({ title: 'Join the NOOB team page', text: 'Be on the Our Team page of NOOB:', url: TEAM_JOIN_LINK }); }
    catch { /* closed without sharing */ }
  };
  const flip = async (change: { open?: boolean; autoPublish?: boolean }) => {
    setSettingBusy(true);
    setError(null);
    const res = await saveTeamSettings(change);
    setSettingBusy(false);
    if (!res.success || !res.state) { setError(res.error || 'The setting could not be saved.'); return; }
    setAdminState(res.state);
  };
  const decide = async (a: TeamApplicationRow, approve: boolean) => {
    setDeciding(a.id);
    setError(null);
    const res = await decideTeamApplication(a.id, approve);
    setDeciding(null);
    if (!res.success) { setError(res.error || 'That did not work. Please try again.'); return; }
    if (res.state) setAdminState(res.state);
    if (res.team) setTeam(res.team);
    say(approve ? `${a.name} is on the team page now. They were told.` : `${a.name} was turned down. They were told kindly.`);
  };
  const flashAfterErase = (name: string, warning?: string) => say(`${name}'s data was deleted permanently${warning ? `, but ${warning}` : ''}.`);
  const remove = async (m: TeamMember) => {
    setBusyId(m.id);
    setError(null);
    const res = await deleteTeamMember(m.id);
    setBusyId(null);
    if (!res.success) { setError(res.error || 'That did not work. Please try again.'); return; }
    setTeam(res.team || []);
    if (res.state) setAdminState(res.state);
    flashAfterErase(m.name, res.warning);
  };
  const erase = async (a: TeamApplicationRow) => {
    setDeciding(a.id);
    setError(null);
    const res = await eraseTeamApplication(a.id);
    setDeciding(null);
    setEraseId(null);
    if (!res.success) { setError(res.error || 'That did not work. Please try again.'); return; }
    if (res.team) setTeam(res.team);
    if (res.state) setAdminState(res.state);
    flashAfterErase(a.name, res.warning);
  };
  const pending = adminState ? adminState.applications.filter((x) => x.status === 'pending').length : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-white flex items-center gap-2"><Users className="w-4 h-4 text-amber-300" /> Our Team{team ? ` (${team.length})` : ''}</span>
        <button onClick={() => void load()} className="ml-auto p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer" aria-label="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
        {!draft && (
          <button onClick={() => openForm()} className="px-3 py-1.5 rounded-lg bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Add member</button>
        )}
      </div>
      <p className="text-[11px] text-zinc-400 leading-relaxed">These people appear on the "Our Team" page in the Home menu, numbered in this order. Pin someone to put them first (only you can see pins). Each one needs a photo, a name, a qualification and a short description.</p>

      {flash && <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold px-3 py-2 flex items-center gap-2"><Check className="w-4 h-4" /> {flash}</div>}
      {error && <div className="rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold px-3 py-2">{error}</div>}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-white"><Link2 className="w-4 h-4 text-amber-300" /> Link for joining the team page</div>
        <p className="text-[11px] text-zinc-400 leading-relaxed">Share this link. Whoever opens it signs in, fills in the form inside NOOB, and their User ID is attached automatically.</p>
        <div className="flex items-center gap-2">
          <input readOnly value={TEAM_JOIN_LINK} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-[11px] text-zinc-200 font-mono" aria-label="The joining link" />
          <button onClick={() => void copyLink()} className="px-3 py-2 rounded-xl bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer shrink-0">{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Copied' : 'Copy'}</button>
          {typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function' && (
            <button onClick={() => void shareLink()} className="p-2.5 rounded-xl bg-zinc-800 text-zinc-200 cursor-pointer shrink-0" aria-label="Share the link"><Share2 className="w-4 h-4" /></button>
          )}
        </div>
        {adminState && (
          <div className="space-y-3 pt-1 border-t border-zinc-800">
            <div className="pt-3"><Switch on={adminState.open} busy={settingBusy} onChange={() => void flip({ open: !adminState.open })} label="Applications are open" hint={adminState.open ? 'People can fill in the form.' : 'The link says applications are closed.'} /></div>
            <Switch on={adminState.autoPublish} busy={settingBusy} onChange={() => void flip({ autoPublish: !adminState.autoPublish })} label="Add new people to the page straight away" hint={adminState.autoPublish ? 'On: anyone who sends the form appears on the public page at once.' : 'Off: you approve each person first (recommended).'} />
          </div>
        )}
      </div>

      <div className="flex gap-1 rounded-xl bg-zinc-900 p-1">
        {([['members', `Members${team ? ` (${team.length})` : ''}`], ['applications', `Applications${pending ? ` (${pending})` : ''}`]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer ${tab === id ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}>{label}</button>
        ))}
      </div>

      {tab === 'applications' ? (
        !adminState ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-center space-y-2">
            <p className="text-xs font-bold text-white">The applications could not load</p>
            <p className="text-[11px] text-zinc-400">If this is the first time, the "Our Team, part 2" SQL (migration 20261013000002) has not been run yet.</p>
            <button onClick={() => void load()} className="px-4 py-2 rounded-lg bg-zinc-800 text-xs font-bold text-white cursor-pointer">Try again</button>
          </div>
        ) : adminState.applications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center space-y-1">
            <UserRound className="w-6 h-6 mx-auto text-zinc-500" />
            <p className="text-xs font-bold text-white">No applications yet</p>
            <p className="text-[11px] text-zinc-400">Share the link above. What people send shows up here.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {adminState.applications.map((a) => (
              <li key={a.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 space-y-2.5">
                <div className="flex gap-3">
                  <div className="relative w-16 h-20 shrink-0 rounded-xl overflow-hidden bg-zinc-900 flex items-center justify-center text-sm font-black text-amber-200">
                    {a.photoUrl ? <img src={a.photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" /> : initials(a.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p className="text-sm font-bold text-white break-words min-w-0 flex-1">{a.name}</p>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black ${a.status === 'pending' ? 'bg-amber-400/20 text-amber-300' : a.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-700 text-zinc-300'}`}>
                        {a.status === 'pending' ? 'Waiting' : a.status === 'approved' ? (a.onTeam ? 'On the page' : 'Approved') : 'Turned down'}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-300 flex items-start gap-1 mt-0.5"><GraduationCap className="w-3 h-3 mt-0.5 shrink-0" /> <span className="break-words min-w-0">{a.qualification}</span></p>
                    <p className="text-[11px] text-sky-300 font-bold mt-1 flex items-center gap-1 truncate"><BadgeCheck className="w-3 h-3 shrink-0" /> @{a.username}</p>
                    <p className="text-[10px] text-zinc-500 flex items-center gap-1 truncate"><Fingerprint className="w-3 h-3 shrink-0" /> <span className="font-mono truncate">{a.userId}</span></p>
                  </div>
                </div>
                <p className="text-[12px] text-zinc-300 leading-relaxed whitespace-pre-line break-words">{a.description}</p>
                <p className="text-[10px] text-zinc-500">Sent {when(a.createdAt)}{a.decidedAt ? ` · decided ${when(a.decidedAt)}` : ''}</p>
                {a.status === 'pending' && (
                  <div className="flex gap-2">
                    <button onClick={() => void decide(a, true)} disabled={deciding === a.id} className="flex-1 py-2.5 rounded-xl bg-amber-400 text-black text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60">
                      {deciding === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Add to the team page
                    </button>
                    <button onClick={() => void decide(a, false)} disabled={deciding === a.id} className="px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-bold cursor-pointer disabled:opacity-60">Turn down</button>
                  </div>
                )}
                {eraseId === a.id ? (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 space-y-2">
                    <p className="text-[11px] text-rose-200 leading-snug"><span className="font-black">Delete everything {a.name} filled in?</span> Their photo, name, qualification and description are erased from the server and cannot be brought back{a.onTeam ? ', and they come off the team page' : ''}. Their NOOB account is not touched.</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => void erase(a)} disabled={deciding === a.id} className="px-2.5 py-1.5 rounded-lg bg-rose-500 text-white text-[11px] font-black cursor-pointer disabled:opacity-60 flex items-center gap-1.5">{deciding === a.id && <Loader2 className="w-3 h-3 animate-spin" />} Yes, delete permanently</button>
                      <button onClick={() => setEraseId(null)} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 text-[11px] font-bold cursor-pointer">Keep</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setEraseId(a.id)} className="text-[11px] font-bold text-rose-300 hover:text-rose-200 flex items-center gap-1.5 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /> Delete their data</button>
                )}
              </li>
            ))}
          </ul>
        )
      ) : (
      <>
      {draft && (
        <div className="rounded-2xl border border-amber-400/30 bg-zinc-950 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-white">{draft.id ? 'Edit team member' : 'New team member'}</span>
            <button onClick={closeForm} className="p-1 rounded-lg text-zinc-400 hover:text-white cursor-pointer" aria-label="Cancel"><X className="w-4 h-4" /></button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || saving}
              className="relative w-24 h-28 shrink-0 rounded-2xl overflow-hidden border border-dashed border-zinc-600 bg-zinc-900 flex items-center justify-center cursor-pointer disabled:opacity-60"
              aria-label="Choose the photo"
            >
              {draft.photoUrl ? <img src={draft.photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-zinc-500" />}
              {uploading && <span className="absolute inset-0 bg-black/60 flex items-center justify-center"><Loader2 className="w-5 h-5 text-white animate-spin" /></span>}
            </button>
            <div className="min-w-0 space-y-1.5">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || saving} className="px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs font-bold text-white cursor-pointer disabled:opacity-60">
                {draft.photoKey ? 'Change photo' : 'Choose photo'}
              </button>
              <p className="text-[10px] text-zinc-500 leading-snug">A portrait (taller than wide) looks best. It is made smaller automatically.</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void pickPhoto(f); }} />
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-zinc-300 flex justify-between">Name <span className="text-zinc-500 font-medium">{draft.name.length}/{TEAM_LIMITS.name}</span></span>
            <input value={draft.name} maxLength={TEAM_LIMITS.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Asha Rao" className={field} />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-zinc-300 flex justify-between">Qualification <span className="text-zinc-500 font-medium">{draft.qualification.length}/{TEAM_LIMITS.qualification}</span></span>
            <input value={draft.qualification} maxLength={TEAM_LIMITS.qualification} onChange={(e) => setDraft({ ...draft, qualification: e.target.value })} placeholder="e.g. B.Tech in Computer Science" className={field} />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-zinc-300 flex justify-between">Description <span className="text-zinc-500 font-medium">{draft.description.length}/{TEAM_LIMITS.description}</span></span>
            <textarea value={draft.description} maxLength={TEAM_LIMITS.description} rows={5} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="A few lines about them and what they do at NOOB" className={`${field} resize-y`} />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-bold text-zinc-300">NOOB User ID <span className="text-zinc-500 font-medium">(optional)</span></span>
            <input value={draft.username} maxLength={40} onChange={(e) => setDraft({ ...draft, username: e.target.value })} placeholder="e.g. asha_rao" className={field} autoCapitalize="none" autoCorrect="off" />
            <span className="block text-[10px] text-zinc-500 leading-snug">Links this card to their NOOB account: the page then shows their @User ID and a "Noob" button. People who join through the link are linked automatically.</span>
          </label>

          <div className="flex gap-2 pt-1">
            <button onClick={() => void save()} disabled={saving || uploading} className="flex-1 py-2.5 rounded-xl bg-amber-400 text-black text-xs font-black flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {draft.id ? 'Save changes' : 'Add to the team'}
            </button>
            <button onClick={closeForm} disabled={saving} className="px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-200 text-xs font-bold cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {loadError ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-center space-y-2">
          <p className="text-xs font-bold text-white">The team could not load</p>
          <p className="text-[11px] text-zinc-400">If this is the first time, the "Our Team" SQL (migration 20261013000001) has not been run yet.</p>
          <button onClick={() => void load()} className="px-4 py-2 rounded-lg bg-zinc-800 text-xs font-bold text-white cursor-pointer">Try again</button>
        </div>
      ) : !team ? (
        <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 text-zinc-500 animate-spin" /></div>
      ) : team.length === 0 && !draft ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center space-y-1">
          <Users className="w-6 h-6 mx-auto text-zinc-500" />
          <p className="text-xs font-bold text-white">Nobody on the team page yet</p>
          <p className="text-[11px] text-zinc-400">Tap "Add member" to add the first person.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {team.map((m, i) => (
            <li key={m.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 flex items-center gap-3">
              <Thumb member={m} number={cardNumber(i)} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                  <span className="truncate">{m.name}</span>
                  {m.pinned && <Pin className="w-3 h-3 shrink-0 text-amber-300 fill-amber-300" aria-label="Pinned" />}
                </p>
                <p className="text-[11px] text-zinc-400 truncate flex items-center gap-1"><GraduationCap className="w-3 h-3 shrink-0" /> {m.qualification || 'No qualification'}</p>
                {m.username && <p className="text-[10px] text-sky-300 font-bold truncate">@{m.username}</p>}
                {confirmId === m.id && (
                  <div className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 space-y-2">
                    <p className="text-[11px] text-rose-200 leading-snug"><span className="font-black">Delete {m.name} for good?</span> Their photo, name, qualification, description and joining form are erased from the server and cannot be brought back. Their NOOB account is not touched.</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setConfirmId(null); void remove(m); }} className="px-2.5 py-1.5 rounded-lg bg-rose-500 text-white text-[11px] font-black cursor-pointer">Yes, delete permanently</button>
                      <button onClick={() => setConfirmId(null)} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 text-zinc-200 text-[11px] font-bold cursor-pointer">Keep</button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {busyId === m.id ? <Loader2 className="w-4 h-4 text-zinc-400 animate-spin mx-2" /> : (
                  <>
                    <button
                      onClick={() => void act(m.id, () => pinTeamMember(m.id, !m.pinned), m.pinned ? `${m.name} is unpinned.` : `${m.name} is pinned: shown first on the page. Only you can see the pin.`)}
                      className={`p-1.5 rounded-lg hover:bg-zinc-800 cursor-pointer ${m.pinned ? 'text-amber-300' : 'text-zinc-400 hover:text-amber-300'}`}
                      aria-label={m.pinned ? `Unpin ${m.name}` : `Pin ${m.name} to the top`}
                      title={m.pinned ? 'Unpin' : 'Pin to the top (only you can see pins)'}
                    ><Pin className={`w-3.5 h-3.5 ${m.pinned ? 'fill-amber-300' : ''}`} /></button>
                    <button onClick={() => void act(m.id, () => moveTeamMember(m.id, 'up'))} disabled={i === 0 || team[i - 1].pinned !== m.pinned} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-25 cursor-pointer" aria-label={`Move ${m.name} up`}><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => void act(m.id, () => moveTeamMember(m.id, 'down'))} disabled={i === team.length - 1 || team[i + 1].pinned !== m.pinned} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-25 cursor-pointer" aria-label={`Move ${m.name} down`}><ArrowDown className="w-3.5 h-3.5" /></button>
                    <button onClick={() => openForm(m)} className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-300 hover:bg-zinc-800 cursor-pointer" aria-label={`Edit ${m.name}`}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setConfirmId(confirmId === m.id ? null : m.id)} className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 cursor-pointer" aria-label={`Delete ${m.name} permanently`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      </>
      )}
    </div>
  );
};

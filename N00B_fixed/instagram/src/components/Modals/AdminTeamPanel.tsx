import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Camera, Check, GraduationCap, Loader2, Pencil, Plus, RefreshCw, Trash2, Users, X } from 'lucide-react';
import { deleteTeamMember, discardTeamPhoto, fetchTeamMembers, moveTeamMember, saveTeamMember, uploadTeamPhoto } from '../../services/api';
import type { TeamMember } from '../../utils/ourTeam';
import { TEAM_LIMITS, initials, validateTeamForm } from '../../utils/ourTeam';

// Admin panel → "Our Team": adds, edits, reorders and removes the people shown on the "Our Team" page in the Home menu.
// Each member needs a photo, a name, a qualification and a short description.

interface Draft {
  id: string | null;
  name: string;
  qualification: string;
  description: string;
  photoKey: string | null;   // what is saved
  photoUrl: string | null;   // what is shown in the form
  originalKey: string | null;
}

const EMPTY: Draft = { id: null, name: '', qualification: '', description: '', photoKey: null, photoUrl: null, originalKey: null };
const field = 'w-full rounded-xl bg-zinc-900 border border-zinc-700 focus:border-amber-400 outline-none px-3 py-2.5 text-xs text-white placeholder:text-zinc-500';

// The small picture in the list; a photo that cannot be loaded shows the initials instead of a broken-picture icon.
const Thumb: React.FC<{ member: TeamMember }> = ({ member }) => {
  const [broken, setBroken] = useState(false);
  return (
    <div className="relative w-12 h-14 shrink-0 rounded-lg overflow-hidden bg-zinc-900 flex items-center justify-center text-[13px] font-black text-amber-200">
      {member.photo && !broken ? <img src={member.photo} alt="" onError={() => setBroken(true)} className="absolute inset-0 w-full h-full object-cover" loading="lazy" /> : initials(member.name)}
    </div>
  );
};

export const AdminTeamPanel: React.FC = () => {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
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
    const t = await fetchTeamMembers();
    if (t) setTeam(t); else setLoadError(true);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const say = (text: string) => { setFlash(text); window.setTimeout(() => setFlash((cur) => (cur === text ? null : cur)), 2800); };

  const discardFresh = (except?: string | null) => {
    for (const k of freshKeys.current) if (k !== except) discardTeamPhoto(k);
    freshKeys.current = [];
  };
  const openForm = (m?: TeamMember) => {
    discardFresh();
    setError(null);
    setDraft(m ? { id: m.id, name: m.name, qualification: m.qualification, description: m.description, photoKey: m.photoKey, photoUrl: m.photo, originalKey: m.photoKey } : { ...EMPTY });
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
      photoKey: draft.photoKey, replacedPhotoKey: draft.originalKey
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-white flex items-center gap-2"><Users className="w-4 h-4 text-amber-300" /> Our Team{team ? ` (${team.length})` : ''}</span>
        <button onClick={() => void load()} className="ml-auto p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer" aria-label="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
        {!draft && (
          <button onClick={() => openForm()} className="px-3 py-1.5 rounded-lg bg-amber-400 text-black text-xs font-black flex items-center gap-1.5 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Add member</button>
        )}
      </div>
      <p className="text-[11px] text-zinc-400 leading-relaxed">These people appear on the "Our Team" page in the Home menu, in this order. Each one needs a photo, a name, a qualification and a short description.</p>

      {flash && <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold px-3 py-2 flex items-center gap-2"><Check className="w-4 h-4" /> {flash}</div>}
      {error && <div className="rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold px-3 py-2">{error}</div>}

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
              <Thumb member={m} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">{m.name}</p>
                <p className="text-[11px] text-zinc-400 truncate flex items-center gap-1"><GraduationCap className="w-3 h-3 shrink-0" /> {m.qualification || 'No qualification'}</p>
                {confirmId === m.id && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[11px] text-rose-300 font-semibold">Remove {m.name}?</span>
                    <button onClick={() => { setConfirmId(null); void act(m.id, () => deleteTeamMember(m.id), `${m.name} was removed.`); }} className="px-2.5 py-1 rounded-lg bg-rose-500 text-white text-[11px] font-black cursor-pointer">Yes, remove</button>
                    <button onClick={() => setConfirmId(null)} className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-200 text-[11px] font-bold cursor-pointer">Keep</button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {busyId === m.id ? <Loader2 className="w-4 h-4 text-zinc-400 animate-spin mx-2" /> : (
                  <>
                    <button onClick={() => void act(m.id, () => moveTeamMember(m.id, 'up'))} disabled={i === 0} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-25 cursor-pointer" aria-label={`Move ${m.name} up`}><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button onClick={() => void act(m.id, () => moveTeamMember(m.id, 'down'))} disabled={i === team.length - 1} className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 disabled:opacity-25 cursor-pointer" aria-label={`Move ${m.name} down`}><ArrowDown className="w-3.5 h-3.5" /></button>
                    <button onClick={() => openForm(m)} className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-300 hover:bg-zinc-800 cursor-pointer" aria-label={`Edit ${m.name}`}><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setConfirmId(confirmId === m.id ? null : m.id)} className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 cursor-pointer" aria-label={`Remove ${m.name}`}><Trash2 className="w-3.5 h-3.5" /></button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

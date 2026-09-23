import React, { useRef, useState } from 'react';
import { Layers, Plus, Trash2, X, Check, Play, Loader2 } from 'lucide-react';
import { StoryHighlight } from '../../types';
import { uploadMediaFile, createManualHighlight, renameHighlight, addToHighlight, removeHighlightItem, deleteHighlight } from '../../services/api';
import confetti from 'canvas-confetti';

interface HighlightManagerModalProps {
  // Editing an existing highlight (auto-built from stories, or made manually — both can be
  // renamed and have items added/removed here), or omitted to create a brand-new manual one.
  existingHighlight?: StoryHighlight | null;
  onClose: () => void;
  // Called once, right before closing, with whatever actually changed happened during this
  // session — the caller just re-fetches the highlight list rather than patching it by hand,
  // since create/rename/add/remove/delete all funnel through here.
  onDone: () => void;
}

type PendingItem = { mediaUrl: string; mediaType: 'image' | 'video'; localPreview: string };

export const HighlightManagerModal: React.FC<HighlightManagerModalProps> = ({ existingHighlight, onClose, onDone }) => {
  const isEditing = !!existingHighlight;
  const [title, setTitle] = useState(existingHighlight?.title || '');
  const [items, setItems] = useState(existingHighlight?.items || []);
  const [pendingNew, setPendingNew] = useState<PendingItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [changed, setChanged] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    if (changed) onDone();
    onClose();
  };

  // A single input whose accept covers BOTH image/* and video/* is the one concrete difference
  // from every OTHER upload in this app that's proven to work (the story uploader: image/* alone;
  // the post composer: image/* and video/* as two entirely separate inputs, never combined). Split
  // the same way here — no combined-type input anywhere in this component anymore.
  const handlePickFiles = async (e: React.ChangeEvent<HTMLInputElement>, mediaType: 'image' | 'video') => {
    // Logged unconditionally, before anything can go wrong: if this line is missing from the
    // console after tapping "Add Photo"/"Add Video" and picking a file, the tap never reached the
    // <input> at all (a picker/permissions/overlay problem) rather than the upload failing.
    console.log('[HighlightManagerModal] handlePickFiles fired', { mediaType, fileCount: e.target.files?.length ?? 0 });
    const fileList = e.target.files;
    const ref = mediaType === 'video' ? videoInputRef : photoInputRef;
    if (ref.current) ref.current.value = '';
    if (!fileList || fileList.length === 0) return;
    const files: File[] = Array.from(fileList);

    setErrorMessage(null);
    setIsUploading(true);
    try {
      for (const file of files) {
        if (file.size > 25 * 1024 * 1024) {
          setErrorMessage('Each photo or video must be under 25MB.');
          continue;
        }
        // uploadMediaFile THROWS (rather than returning an error) for a format the browser can't
        // handle — most commonly HEIC, the default photo format on iPhone. Without this catch,
        // that exception silently aborted the whole picker with no message and no item added,
        // which is exactly what looked like "choosing a photo does nothing".
        try {
          const uploaded = await uploadMediaFile(file, 'stories');
          if (!uploaded.url) { setErrorMessage('Upload failed. Please try again.'); continue; }
          const pending: PendingItem = { mediaUrl: uploaded.objectKey || uploaded.url, mediaType, localPreview: uploaded.url };

          if (isEditing && existingHighlight) {
            // Already-created highlight: commit immediately, one at a time, so a mid-batch failure
            // doesn't lose the ones that already succeeded.
            const res = await addToHighlight(existingHighlight.id, [{ mediaUrl: pending.mediaUrl, mediaType: pending.mediaType }]);
            if (!res.success) { setErrorMessage(res.error || 'Could not add that item.'); continue; }
            setItems((prev) => [...prev, { id: `pending_${Date.now()}`, mediaUrl: pending.localPreview, mediaType, createdAt: new Date().toISOString() }]);
            setChanged(true);
          } else {
            setPendingNew((prev) => [...prev, pending]);
          }
        } catch (err) {
          // Logged too, not just shown — so a screenshot of the console after tapping "Add
          // Photo"/"Add Video" always has something concrete on it if this still fails.
          console.error('[HighlightManagerModal] upload failed:', err);
          setErrorMessage(err instanceof Error ? err.message : 'Upload failed. Please try again.');
        }
      }
    } catch (err) {
      console.error('[HighlightManagerModal] handlePickFiles crashed:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong picking that file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveExisting = async (itemId: string) => {
    if (!existingHighlight) return;
    const prev = items;
    setItems((cur) => cur.filter((it) => it.id !== itemId));
    setChanged(true);
    const res = await removeHighlightItem(existingHighlight.id, itemId);
    if (!res.success) {
      setItems(prev);
      setErrorMessage(res.error || 'Could not remove that item.');
    } else if (items.length <= 1) {
      // that was the last item — the highlight itself is gone now
      onDone();
      onClose();
    }
  };

  const handleRemovePending = (idx: number) => {
    setPendingNew((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveName = async () => {
    if (!existingHighlight || !title.trim() || title.trim() === existingHighlight.title) return;
    setIsSavingName(true);
    setErrorMessage(null);
    const res = await renameHighlight(existingHighlight.id, title.trim());
    setIsSavingName(false);
    if (res.success) { setChanged(true); } else { setErrorMessage(res.error || 'Could not rename the highlight.'); }
  };

  const handleCreate = async () => {
    if (pendingNew.length === 0) { setErrorMessage('Please add at least one photo or video.'); return; }
    setIsSaving(true);
    setErrorMessage(null);
    const res = await createManualHighlight(title.trim(), pendingNew.map((p) => ({ mediaUrl: p.mediaUrl, mediaType: p.mediaType })));
    setIsSaving(false);
    if (!res.success) { setErrorMessage(res.error || 'Could not create the highlight.'); return; }
    confetti({ particleCount: 30, spread: 60, origin: { y: 0.7 } });
    onDone();
    onClose();
  };

  const handleDeleteWhole = async () => {
    if (!existingHighlight) return;
    const ok = await deleteHighlight(existingHighlight.id);
    if (ok) { onDone(); onClose(); } else { setErrorMessage('Could not delete the highlight.'); }
  };

  const displayItems: { key: string; url: string; type: 'image' | 'video'; onRemove: () => void }[] = isEditing
    ? items.map((it) => ({ key: it.id, url: it.mediaUrl, type: it.mediaType, onRemove: () => handleRemoveExisting(it.id) }))
    : pendingNew.map((p, idx) => ({ key: `${p.mediaUrl}_${idx}`, url: p.localPreview, type: p.mediaType, onRemove: () => handleRemovePending(idx) }));

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <header className="p-4 sm:p-5 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#00FF66] to-emerald-400 p-[2px]">
              <div className="w-full h-full bg-black rounded-[14px] flex items-center justify-center">
                <Layers className="w-4 h-4 text-[#00FF66]" />
              </div>
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{isEditing ? 'Edit Highlight' : 'New Highlight'}</h2>
              <p className="text-[11px] text-zinc-400">This never appears as a 24-hour story</p>
            </div>
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">{errorMessage}</div>
          )}

          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1.5">
              Highlight Name{' '}
              {!isEditing && <span className="text-zinc-500 font-normal">(optional — leave blank for an automatic name)</span>}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={40}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Summer Trip, Gaming Setup..."
                className="w-full bg-zinc-900 border border-zinc-800 text-sm text-white px-3.5 py-2.5 rounded-2xl focus:border-[#00FF66] outline-none transition-colors"
              />
              {isEditing && title.trim() && title.trim() !== existingHighlight?.title && (
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={isSavingName}
                  className="shrink-0 px-3 py-2.5 bg-[#00FF66] text-black text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50"
                >
                  {isSavingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-zinc-300">Photos &amp; Videos ({displayItems.length})</label>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {/* Same trigger mechanism as every other proven-working upload in the app (story
                  creation, the post composer, chat attachments): a real <button onClick> calls
                  ref.current.click() on a plain hidden <input type="file">. An earlier version of
                  this component put the <input> directly on top of the tile (opacity-0, no click()
                  indirection) on the theory that ref.click() indirection was the problem — it
                  wasn't; that version still didn't work on the user's real device, and every other
                  working upload in this app uses ref.click(), so this reverts to matching them
                  exactly rather than trying another one-off mechanism. */}
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={isUploading}
                className={`relative aspect-square bg-zinc-900/90 border border-dashed border-zinc-700 hover:border-[#00FF66] rounded-2xl flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-[#00FF66] transition-colors group overflow-hidden cursor-pointer disabled:cursor-not-allowed ${isUploading ? 'opacity-50' : ''}`}
              >
                {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6 group-hover:scale-110 transition-transform" />}
                <span className="text-[10px] font-bold">{isUploading ? 'Uploading...' : 'Add Photo'}</span>
              </button>
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={isUploading}
                className={`relative aspect-square bg-zinc-900/90 border border-dashed border-zinc-700 hover:border-[#00FF66] rounded-2xl flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-[#00FF66] transition-colors group overflow-hidden cursor-pointer disabled:cursor-not-allowed ${isUploading ? 'opacity-50' : ''}`}
              >
                {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6 group-hover:scale-110 transition-transform" />}
                <span className="text-[10px] font-bold">{isUploading ? 'Uploading...' : 'Add Video'}</span>
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handlePickFiles(e, 'image')}
                className="hidden"
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                onChange={(e) => handlePickFiles(e, 'video')}
                className="hidden"
              />

              {displayItems.map((m, idx) => (
                <div key={m.key} className="aspect-square relative rounded-2xl overflow-hidden border border-zinc-800 bg-black group">
                  {m.type === 'video' ? (
                    <div className="w-full h-full relative flex items-center justify-center bg-zinc-900">
                      <video src={m.url} className="w-full h-full object-cover opacity-80" />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Play className="w-5 h-5 text-white fill-white/80" />
                      </div>
                    </div>
                  ) : (
                    <img src={m.url} alt="Highlight media" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  )}
                  {idx === 0 && (
                    <div className="absolute top-1.5 left-1.5 bg-[#00FF66] text-black text-[9px] font-black px-1.5 py-0.5 rounded shadow">COVER</div>
                  )}
                  <button
                    type="button"
                    onClick={m.onRemove}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Remove"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            {/* No `multiple` — one at a time, exactly like the story uploader that already works,
                is the safe, proven pattern; tapping "Add Photo"/"Add Video" again adds another. */}
          </div>

          <div className="pt-2 flex items-center gap-2 justify-between border-t border-zinc-800">
            {isEditing && (
              <div>
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="px-3.5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Highlight
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleDeleteWhole} className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl flex items-center gap-1.5 cursor-pointer shadow-lg shadow-red-500/30">
                      <Trash2 className="w-3.5 h-3.5" /> Confirm Delete
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="px-2.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-xl cursor-pointer">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button type="button" onClick={handleClose} className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold rounded-xl cursor-pointer">
                {isEditing ? 'Done' : 'Cancel'}
              </button>
              {!isEditing && (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={isSaving || pendingNew.length === 0}
                  className="px-5 py-2.5 bg-[#00FF66] hover:bg-[#00FF66]/90 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-[#00FF66]/20 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save Highlight
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

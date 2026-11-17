import React, { useMemo, useState } from 'react';
import { Bookmark, FolderPlus, FolderOpen, ArrowLeft, Plus, X, Pencil, Trash2, Check } from 'lucide-react';
import type { Post, SavedCollection } from '../../types';
import { PostThumbnailMedia } from '../Common/PostThumbnailMedia';
import { EmptyState } from '../Common/EmptyState';
import { createCollection, addPostToCollection, removePostFromCollection, renameCollection, deleteCollection } from '../../services/supabaseApi';

// "Saved" on your own profile: everything you bookmarked, plus collections you make yourself ("Recipes", "Trips" ...).
// A collection is a real saved list: make it, put posts in from the grid (the + on each picture), open it, take posts out, rename it, delete it.
// Deleting a collection never deletes the posts. Only you can see any of this.
interface Props {
  savedPosts: Post[];
  morePosts: Post[];                       // your own and liked posts: a collection can hold a post you did not bookmark
  collections: SavedCollection[];
  onChanged: () => void;                   // reload the collections
  openPost: (post: Post, list: Post[], title: string) => void;
}

type Sheet = null | { kind: 'new'; thenAdd?: Post } | { kind: 'add'; post: Post } | { kind: 'rename'; col: SavedCollection } | { kind: 'delete'; col: SavedCollection };

export const SavedVault: React.FC<Props> = ({ savedPosts, morePosts, collections, onChanged, openPost }) => {
  const [viewId, setViewId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const byId = useMemo(() => {
    const m = new Map<string, Post>();
    for (const p of [...morePosts, ...savedPosts]) m.set(p.id, p);
    return m;
  }, [savedPosts, morePosts]);
  const view = viewId ? collections.find((c) => c.id === viewId) || null : null;
  const viewPosts = view ? (view.postIds || []).map((id) => byId.get(id)).filter(Boolean) as Post[] : [];
  const firstImage = (p?: Post) => p?.slides?.[0]?.mediaUrl;
  const coverOf = (c: SavedCollection) => {
    const first = (c.postIds || []).map((id) => byId.get(id)).find((p) => !!firstImage(p));
    return firstImage(first) || '';
  };

  const flash = (t: string) => { setNote(t); window.setTimeout(() => setNote(''), 2200); };
  const close = () => { if (!busy) { setSheet(null); setName(''); setError(''); } };

  const doCreate = async () => {
    if (busy || !name.trim()) return;
    setBusy(true); setError('');
    try {
      const col = await createCollection({ name: name.trim() });
      if (sheet && sheet.kind === 'new' && sheet.thenAdd && col?.id) await addPostToCollection(col.id, sheet.thenAdd.id);
      onChanged();
      setSheet(null); setName('');
      flash(sheet && sheet.kind === 'new' && sheet.thenAdd ? `Saved to "${name.trim()}"` : 'Collection created');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the collection.'); }
    setBusy(false);
  };
  const doRename = async () => {
    if (busy || !name.trim() || !sheet || sheet.kind !== 'rename') return;
    setBusy(true); setError('');
    const r: any = await renameCollection(sheet.col.id, name.trim());
    setBusy(false);
    if (r?.success === false) { setError(r.error || 'Could not rename.'); return; }
    onChanged(); setSheet(null); setName('');
  };
  const doDelete = async () => {
    if (busy || !sheet || sheet.kind !== 'delete') return;
    setBusy(true); setError('');
    const r: any = await deleteCollection(sheet.col.id);
    setBusy(false);
    if (r?.success === false) { setError(r.error || 'Could not delete.'); return; }
    setViewId(null); onChanged(); setSheet(null);
  };
  const doAdd = async (col: SavedCollection) => {
    if (busy || !sheet || sheet.kind !== 'add') return;
    setBusy(true); setError('');
    const r: any = await addPostToCollection(col.id, sheet.post.id);
    setBusy(false);
    if (r?.success === false) { setError(r.error || 'Could not add the post.'); return; }
    onChanged(); setSheet(null); flash(`Added to "${col.name}"`);
  };
  const doRemove = async (post: Post) => {
    if (!view || busy) return;
    setBusy(true);
    const r: any = await removePostFromCollection(view.id, post.id);
    setBusy(false);
    if (r?.success === false) { flash(r.error || 'Could not remove the post.'); return; }
    onChanged(); flash('Removed from the collection');
  };

  const grid = (list: Post[], title: string, tile?: (p: Post) => React.ReactNode) => (
    <div className="grid grid-cols-3 gap-[2px] -mx-4 sm:mx-0">
      {list.map((post) => (
        <div key={post.id} className="relative aspect-square bg-zinc-900 overflow-hidden group cursor-pointer" onClick={() => openPost(post, list, title)} data-testid="vault-tile">
          <PostThumbnailMedia src={post.slides?.[0]?.mediaUrl} filter={post.slides?.[0]?.filter} mediaType={post.slides?.[0]?.mediaType} alt={post.caption || 'Saved post'} className="w-full h-full object-cover" />
          {tile ? tile(post) : null}
        </div>
      ))}
    </div>
  );

  const sheetBox = (title: string, body: React.ReactNode) => (
    <div data-noob-sheet="1" className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60" onClick={close} data-testid="vault-sheet">
      <div role="dialog" aria-label={title} className="w-full max-w-lg rounded-t-3xl bg-zinc-950 border border-white/10 p-4 text-zinc-200" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }} onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-700" />
        <h3 className="text-sm font-bold text-white mb-2">{title}</h3>
        {body}
        {error && <p role="alert" className="mt-2 text-xs text-red-400" data-testid="vault-error">{error}</p>}
      </div>
    </div>
  );
  const nameBody = (go: () => void, label: string) => (
    <>
      <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} autoFocus maxLength={40} placeholder="Collection name" aria-label="Collection name" data-testid="vault-name" onKeyDown={(e) => { if (e.key === 'Enter') go(); }} className="w-full rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-base text-white outline-none focus:border-zinc-500" />
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={close} disabled={busy} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-semibold text-zinc-200 cursor-pointer disabled:opacity-50">Cancel</button>
        <button type="button" onClick={go} disabled={busy || !name.trim()} className="flex-1 rounded-xl bg-[#0C831F] py-2.5 text-sm font-bold text-white cursor-pointer disabled:opacity-50" data-testid="vault-go">{label}</button>
      </div>
    </>
  );

  return (
    <div className="space-y-5" data-testid="saved-vault">
      {view ? (
        <>
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-800/80">
            <button type="button" aria-label="Back to saved" onClick={() => setViewId(null)} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer" data-testid="vault-back"><ArrowLeft className="w-5 h-5" /></button>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-white truncate">{view.name}</div>
              <div className="text-[11px] text-zinc-400">{viewPosts.length} {viewPosts.length === 1 ? 'post' : 'posts'}</div>
            </div>
            <button type="button" aria-label="Rename collection" onClick={() => { setName(view.name); setSheet({ kind: 'rename', col: view }); }} className="p-2 rounded-full hover:bg-white/10 cursor-pointer" data-testid="vault-rename"><Pencil className="w-4 h-4" /></button>
            <button type="button" aria-label="Delete collection" onClick={() => setSheet({ kind: 'delete', col: view })} className="p-2 rounded-full hover:bg-white/10 text-rose-400 cursor-pointer" data-testid="vault-delete"><Trash2 className="w-4 h-4" /></button>
          </div>
          {viewPosts.length === 0 ? (
            <EmptyState icon={<FolderOpen />} title="This collection is empty" text="Go back and tap the + on a saved post to put it here." testId="vault-empty-collection" />
          ) : grid(viewPosts, view.name, (p) => (
            <button type="button" aria-label="Take out of this collection" onClick={(e) => { e.stopPropagation(); doRemove(p); }} className="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/65 text-white flex items-center justify-center cursor-pointer" data-testid="vault-remove"><X className="w-4 h-4" /></button>
          ))}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-noob" />
              <span className="text-sm font-bold text-white">Saved ({savedPosts.length})</span>
            </div>
            <button type="button" onClick={() => { setName(''); setSheet({ kind: 'new' }); }} className="text-xs text-noob font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-noob/10 border border-noob/30 hover:bg-noob/20 transition-colors cursor-pointer" data-testid="vault-new">
              <FolderPlus className="w-3.5 h-3.5" /> New collection
            </button>
          </div>

          {collections.length > 0 && (
            <div className="space-y-2" data-testid="vault-collections">
              <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">Collections ({collections.length})</span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {collections.map((col) => {
                  const cover = coverOf(col);
                  return (
                    <button key={col.id} type="button" onClick={() => setViewId(col.id)} className="text-left bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden p-2.5 hover:border-noob/50 transition-colors cursor-pointer" data-testid="vault-collection">
                      <div className="aspect-square rounded-xl overflow-hidden bg-zinc-900 mb-2 flex items-center justify-center">
                        {cover ? <img loading="lazy" decoding="async" src={cover} alt="" className="w-full h-full object-cover" /> : <FolderOpen className="w-8 h-8 text-zinc-600" />}
                      </div>
                      <span className="text-xs font-bold text-white truncate block">{col.name}</span>
                      <span className="text-[10px] text-zinc-400 block">{col.postsCount || 0} {(col.postsCount || 0) === 1 ? 'post' : 'posts'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {savedPosts.length > 0 ? (
            <div className="space-y-2">
              {collections.length > 0 && <span className="text-xs text-zinc-400 font-semibold uppercase tracking-wider block">All saved</span>}
              {grid(savedPosts, 'Saved', (p) => (
                <button type="button" aria-label="Add to a collection" onClick={(e) => { e.stopPropagation(); if (collections.length === 0) { setName(''); setSheet({ kind: 'new', thenAdd: p }); } else setSheet({ kind: 'add', post: p }); }} className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-black/65 text-white flex items-center justify-center cursor-pointer" data-testid="vault-add"><Plus className="w-4 h-4" /></button>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Bookmark />} title="No saved posts yet" text="Tap the bookmark on any post and it waits for you here. Only you can see this." testId="vault-empty" />
          )}
        </>
      )}

      {note && <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[140] rounded-full bg-zinc-900 border border-white/10 px-4 py-2 text-xs text-white shadow-lg" data-testid="vault-note">{note}</div>}

      {sheet?.kind === 'new' && sheetBox(sheet.thenAdd ? 'Name your first collection' : 'New collection', nameBody(doCreate, sheet.thenAdd ? 'Create and save' : 'Create'))}
      {sheet?.kind === 'rename' && sheetBox('Rename collection', nameBody(doRename, 'Save'))}
      {sheet?.kind === 'delete' && sheetBox(`Delete "${sheet.col.name}"?`, (
        <>
          <p className="text-xs text-zinc-400">The posts stay saved. Only this collection goes away.</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={close} disabled={busy} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-semibold text-zinc-200 cursor-pointer disabled:opacity-50">Cancel</button>
            <button type="button" onClick={doDelete} disabled={busy} className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-bold text-white cursor-pointer disabled:opacity-50" data-testid="vault-confirm-delete">Delete</button>
          </div>
        </>
      ))}
      {sheet?.kind === 'add' && sheetBox('Add to a collection', (
        <div className="max-h-[50vh] overflow-y-auto space-y-1">
          {collections.map((col) => {
            const has = (col.postIds || []).includes(sheet.post.id);
            return (
              <button key={col.id} type="button" disabled={busy || has} onClick={() => doAdd(col)} className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/5 disabled:opacity-60 cursor-pointer" data-testid="vault-pick">
                <FolderOpen className="w-5 h-5 text-zinc-400 shrink-0" />
                <span className="flex-1 min-w-0 truncate text-sm text-white">{col.name}</span>
                {has ? <Check className="w-4 h-4 text-noob" /> : <span className="text-[11px] text-zinc-500">{col.postsCount || 0}</span>}
              </button>
            );
          })}
          <button type="button" onClick={() => { const p = sheet.post; setName(''); setSheet({ kind: 'new', thenAdd: p }); }} className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/5 cursor-pointer text-noob" data-testid="vault-pick-new">
            <FolderPlus className="w-5 h-5 shrink-0" /><span className="text-sm font-semibold">New collection</span>
          </button>
        </div>
      ))}
    </div>
  );
};

export default SavedVault;

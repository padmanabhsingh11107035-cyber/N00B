import React, { useMemo, useRef, useState } from 'react';
import { X, Upload, Loader2, ImageIcon, Video, Trash2, Plus, Save } from 'lucide-react';
import { StoreProduct, StoreProductInput, StoreProductMedia } from '../../types';
import { uploadMediaFile, createStoreProduct, updateStoreProduct } from '../../services/api';
import { allCombinations, MAX_OPTION_TYPES, MAX_OPTIONS_PER_TYPE, MAX_STOCK, MAX_VERSIONS, versionCount } from './variants';

const MAX_PHOTOS = 10;
const MAX_VIDEOS = 10;
const MAX_NAME = 30;

// One kind of choice while it is being edited ("Colour": Red, Blue) — `draft` is what is typed but not yet added.
interface OptionDraft {
  id: number;
  name: string;
  values: string[];
  draft: string;
}

interface ProductEditorModalProps {
  // present = editing that product; absent = adding a new one
  product?: StoreProduct;
  onClose: () => void;
  onSaved: (product: StoreProduct) => void;
}

const toStockNumber = (text: string): number | null => {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d{1,7}$/.test(t)) return NaN;
  const n = Number(t);
  return n > MAX_STOCK ? NaN : n;
};

let nextOptionId = 1;

export const ProductEditorModal: React.FC<ProductEditorModalProps> = ({ product, onClose, onSaved }) => {
  const editing = !!product;
  const [name, setName] = useState(product?.name ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [media, setMedia] = useState<StoreProductMedia[]>(product?.media ?? []);

  // inventory when the product has no versions
  const [trackStock, setTrackStock] = useState(product ? product.stock !== null : true);
  const [stockInput, setStockInput] = useState(product && product.stock !== null ? String(product.stock) : '');
  const [inStock, setInStock] = useState(product ? product.inStock : true);

  // versions (colour / size / model ...) and the stock of each one, remembered by combination
  const [options, setOptions] = useState<OptionDraft[]>(() =>
    (product?.options ?? []).map((o) => ({ id: nextOptionId++, name: o.name, values: [...o.values], draft: '' }))
  );
  const [variantStock, setVariantStock] = useState<Record<string, string>>(() =>
    Object.fromEntries((product?.variants ?? []).map((v) => [v.key, String(v.stock)]))
  );
  const [bulkStock, setBulkStock] = useState('');

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const photoCount = media.filter((m) => m.type === 'photo').length;
  const videoCount = media.filter((m) => m.type === 'video').length;

  // the option types that are filled in (blank rows are ignored)
  const usable = useMemo(
    () => options.map((o) => ({ name: o.name.trim(), values: o.values })).filter((o) => o.name && o.values.length),
    [options]
  );
  const versions = usable.length > 0;
  const count = versionCount(usable);
  const tooMany = count > MAX_VERSIONS;
  const combos = useMemo(() => (versions && !tooMany ? allCombinations(usable) : []), [usable, versions, tooMany]);

  const handleFiles = async (files: FileList | null, type: 'photo' | 'video') => {
    if (!files || files.length === 0) return;
    const limit = type === 'photo' ? MAX_PHOTOS : MAX_VIDEOS;
    const currentCount = type === 'photo' ? photoCount : videoCount;
    const room = limit - currentCount;
    if (room <= 0) {
      setError(`You can only add up to ${limit} ${type}s per product.`);
      return;
    }
    const toUpload = Array.from(files).slice(0, room);
    setUploading(true);
    setError(null);
    try {
      for (const file of toUpload) {
        const result = await uploadMediaFile(file, 'products');
        if (result.success) {
          setMedia((prev) => [...prev, { type, url: result.url }]);
        }
      }
    } catch (err) {
      console.error(err);
      setError('Failed to upload media. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const removeMedia = (index: number) => setMedia((prev) => prev.filter((_, i) => i !== index));

  // ---- option types
  const addOptionType = () => {
    if (options.length >= MAX_OPTION_TYPES) return;
    setOptions((prev) => [...prev, { id: nextOptionId++, name: '', values: [], draft: '' }]);
  };
  const updateOption = (id: number, patch: Partial<OptionDraft>) => setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  const removeOptionType = (id: number) => setOptions((prev) => prev.filter((o) => o.id !== id));

  // Turns what was typed ("Red, Blue") into options; the same one twice is kept once.
  const commitDraft = (id: number, text?: string) => {
    const opt = options.find((o) => o.id === id);
    if (!opt) return;
    const typed = (text ?? opt.draft).split(',').map((s) => s.trim()).filter(Boolean);
    if (typed.length === 0) { updateOption(id, { draft: '' }); return; }
    const values = [...opt.values];
    for (const t of typed) {
      if (t.length > MAX_NAME) { setError(`Each option can be at most ${MAX_NAME} characters ("${t.slice(0, 12)}…" is too long).`); continue; }
      if (values.length >= MAX_OPTIONS_PER_TYPE) { setError(`At most ${MAX_OPTIONS_PER_TYPE} options under one name.`); break; }
      if (!values.some((v) => v.toLowerCase() === t.toLowerCase())) values.push(t);
    }
    updateOption(id, { values, draft: '' });
  };
  const removeValue = (id: number, value: string) => {
    const opt = options.find((o) => o.id === id);
    if (opt) updateOption(id, { values: opt.values.filter((v) => v !== value) });
  };

  const applyBulkStock = () => {
    const n = toStockNumber(bulkStock);
    if (n === null || Number.isNaN(n)) { setError(`Enter a whole number from 0 to ${MAX_STOCK.toLocaleString()}.`); return; }
    setError(null);
    setVariantStock(Object.fromEntries(combos.map((c) => [c.key, String(n)])));
  };

  const handleSubmit = async () => {
    setError(null);
    const parsedPrice = Number(price);
    if (name.trim().length > 80) { setError('The product name can be at most 80 characters.'); return; }
    if (!price || !Number.isFinite(parsedPrice) || parsedPrice <= 0) { setError('Enter a valid price.'); return; }
    if (!description.trim()) { setError('A description is required.'); return; }
    if (media.length === 0) { setError('Add at least one photo or video.'); return; }

    // option types: a row that is half filled in is a mistake; a completely blank row is just ignored
    const filled = options.filter((o) => o.name.trim() || o.values.length || o.draft.trim());
    const committed = filled.map((o) => ({ ...o, values: o.draft.trim() ? [...o.values, ...o.draft.split(',').map((s) => s.trim()).filter(Boolean)] : o.values }));
    const names = new Set<string>();
    for (const o of committed) {
      const name = o.name.trim();
      if (!name) { setError('Give every option a name (for example Colour), or remove it.'); return; }
      if (name.length > MAX_NAME) { setError(`Option names can be at most ${MAX_NAME} characters.`); return; }
      if (names.has(name.toLowerCase())) { setError(`Two options are both called "${name}".`); return; }
      names.add(name.toLowerCase());
      if (o.values.length === 0) { setError(`Add at least one choice under "${name}" (for example Red, Blue).`); return; }
    }
    // finish any text still sitting in an "add option" box, without duplicates
    const finalOptions = committed.map((o) => {
      const seen = new Set<string>();
      const values = o.values.filter((v) => { const k = v.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      return { name: o.name.trim(), values };
    });
    if (finalOptions.some((o) => o.values.length > MAX_OPTIONS_PER_TYPE)) { setError(`At most ${MAX_OPTIONS_PER_TYPE} options under one name.`); return; }
    if (finalOptions.some((o) => o.values.some((v) => v.length > MAX_NAME))) { setError(`Each option can be at most ${MAX_NAME} characters.`); return; }
    if (versionCount(finalOptions) > MAX_VERSIONS) { setError(`That makes ${versionCount(finalOptions)} versions — the most a product can have is ${MAX_VERSIONS}.`); return; }

    let payload: StoreProductInput;
    if (finalOptions.length > 0) {
      const list = allCombinations(finalOptions);
      const variants: { options: Record<string, string>; stock: number }[] = [];
      for (const c of list) {
        const n = toStockNumber(variantStock[c.key] ?? '');
        if (Number.isNaN(n)) { setError(`Stock must be a whole number from 0 to ${MAX_STOCK.toLocaleString()} (check ${Object.values(c.options).join(' / ')}).`); return; }
        variants.push({ options: c.options, stock: n ?? 0 });
      }
      payload = { name: name.trim(), price: parsedPrice, description: description.trim(), media, options: finalOptions, variants, stock: null, inStock: variants.some((v) => v.stock > 0) };
    } else if (trackStock) {
      const n = toStockNumber(stockInput);
      if (n === null || Number.isNaN(n)) { setError(`Enter how many are in stock (0 if none) — a whole number up to ${MAX_STOCK.toLocaleString()}.`); return; }
      payload = { name: name.trim(), price: parsedPrice, description: description.trim(), media, options: [], variants: [], stock: n, inStock: n > 0 };
    } else {
      payload = { name: name.trim(), price: parsedPrice, description: description.trim(), media, options: [], variants: [], stock: null, inStock };
    }

    setSubmitting(true);
    try {
      const res = product ? await updateStoreProduct(product.id, payload) : await createStoreProduct(payload);
      if (res.success && res.product) {
        onSaved(res.product);
      } else {
        setError(res.error || (editing ? 'Failed to save the product.' : 'Failed to add product.'));
      }
    } catch (err) {
      console.error(err);
      setError(editing ? 'Failed to save the product. Please try again.' : 'Failed to add product. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50';

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-[#0e0e0e] border border-zinc-800 sm:rounded-3xl rounded-t-3xl p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-white">{editing ? 'Edit Product' : 'Add Product'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer" aria-label="Close">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-zinc-400 uppercase">Product name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Man Hoodie" className={inputCls} />
          <p className="text-[10px] text-zinc-600">Shown on the shop shelf. The description below is only shown when someone opens the product.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-zinc-400 uppercase">Price (₹)</label>
          <input type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 499" className={inputCls} />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-zinc-400 uppercase">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe the product..."
            className={`${inputCls} resize-none`}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-zinc-400 uppercase">Photos ({photoCount}/{MAX_PHOTOS}) &amp; Videos ({videoCount}/{MAX_VIDEOS})</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploading || photoCount >= MAX_PHOTOS}
              className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <ImageIcon className="w-3.5 h-3.5 text-cyan-400" /> Add Photos
            </button>
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              disabled={uploading || videoCount >= MAX_VIDEOS}
              className="flex-1 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Video className="w-3.5 h-3.5 text-violet-400" /> Add Videos
            </button>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { handleFiles(e.target.files, 'photo'); e.target.value = ''; }} />
          <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden" onChange={(e) => { handleFiles(e.target.files, 'video'); e.target.value = ''; }} />
          {uploading && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...
            </div>
          )}
          {media.length > 0 && (
            <div className="grid grid-cols-4 gap-2 pt-1">
              {media.map((m, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900">
                  {m.type === 'photo' ? <img src={m.url} alt="" className="w-full h-full object-cover" /> : <video src={m.url} className="w-full h-full object-cover" muted />}
                  <button type="button" onClick={() => removeMedia(i)} className="absolute top-1 right-1 p-1 rounded-full bg-black/70 hover:bg-black cursor-pointer" aria-label="Remove">
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Versions: colour, size, model ... */}
        <div className="space-y-2.5 pt-1 border-t border-zinc-800">
          <div className="flex items-start justify-between gap-3 pt-3">
            <div>
              <label className="text-[11px] font-bold text-zinc-400 uppercase block">Versions (optional)</label>
              <p className="text-[11px] text-zinc-500 leading-snug mt-0.5">
                Does it come in different colours, sizes or models? Add an option, name it, and list its choices.
              </p>
            </div>
            {options.length < MAX_OPTION_TYPES && (
              <button
                type="button"
                onClick={addOptionType}
                className="shrink-0 px-2.5 py-1.5 rounded-xl bg-[#00FF66]/15 hover:bg-[#00FF66]/25 border border-[#00FF66]/40 text-[11px] font-bold text-[#00FF66] flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add option
              </button>
            )}
          </div>

          {options.map((o, index) => (
            <div key={o.id} className="p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  value={o.name}
                  onChange={(e) => updateOption(o.id, { name: e.target.value })}
                  maxLength={MAX_NAME}
                  placeholder={index === 0 ? 'Option name, e.g. Colour' : index === 1 ? 'Option name, e.g. Size' : 'Option name, e.g. Model'}
                  className="flex-1 bg-zinc-950 text-sm text-white p-2.5 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50"
                />
                <button type="button" onClick={() => removeOptionType(o.id)} className="p-2 rounded-xl bg-zinc-950 hover:bg-red-500/20 border border-zinc-800 cursor-pointer" aria-label="Remove this option">
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {o.values.map((v) => (
                  <span key={v} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-xs text-white font-semibold">
                    {v}
                    <button type="button" onClick={() => removeValue(o.id, v)} className="p-0.5 rounded-full hover:bg-zinc-600 cursor-pointer" aria-label={`Remove ${v}`}>
                      <X className="w-3 h-3 text-zinc-300" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={o.draft}
                  onChange={(e) => {
                    const text = e.target.value;
                    // typing a comma adds what came before it
                    if (text.includes(',')) commitDraft(o.id, text); else updateOption(o.id, { draft: text });
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitDraft(o.id); } }}
                  onBlur={() => commitDraft(o.id)}
                  placeholder="Type a choice and press Enter (e.g. Red)"
                  className="flex-1 bg-zinc-950 text-sm text-white p-2.5 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50"
                />
                <button type="button" onClick={() => commitDraft(o.id)} className="px-3 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white cursor-pointer">
                  Add
                </button>
              </div>
            </div>
          ))}

          {versions && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[11px] font-bold uppercase ${tooMany ? 'text-red-400' : 'text-zinc-400'}`}>
                  Stock for each version ({count})
                </span>
                {!tooMany && (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      value={bulkStock}
                      onChange={(e) => setBulkStock(e.target.value)}
                      placeholder="Set all to"
                      className="w-24 bg-zinc-950 text-xs text-white p-2 rounded-lg border border-zinc-800 outline-none focus:border-[#00FF66]/50"
                    />
                    <button type="button" onClick={applyBulkStock} className="px-2.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-bold text-white cursor-pointer">
                      Apply
                    </button>
                  </div>
                )}
              </div>
              {tooMany ? (
                <p className="text-xs text-red-400 font-semibold">That makes {count} versions — the most a product can have is {MAX_VERSIONS}. Remove some choices.</p>
              ) : (
                <div className="rounded-2xl border border-zinc-800 divide-y divide-zinc-800 overflow-hidden max-h-64 overflow-y-auto">
                  {combos.map((c) => (
                    <div key={c.key} className="flex items-center justify-between gap-3 px-3 py-2 bg-zinc-900/40">
                      <span className="text-xs text-zinc-200 font-semibold truncate">{Object.values(c.options).join(' / ')}</span>
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={variantStock[c.key] ?? ''}
                        onChange={(e) => setVariantStock((prev) => ({ ...prev, [c.key]: e.target.value }))}
                        placeholder="0"
                        aria-label={`Stock for ${Object.values(c.options).join(' / ')}`}
                        className="w-20 bg-zinc-950 text-sm text-white p-2 rounded-lg border border-zinc-800 outline-none focus:border-[#00FF66]/50 text-right"
                      />
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-zinc-500 leading-snug">
                Renaming or removing a choice, or adding a whole new kind of option, starts the stock of the versions it affects again from 0.
              </p>
            </div>
          )}
        </div>

        {/* Inventory when there are no versions */}
        {!versions && (
          <div className="space-y-2 pt-3 border-t border-zinc-800">
            <label className="text-[11px] font-bold text-zinc-400 uppercase block">Inventory</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTrackStock(true)}
                className={`p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${trackStock ? 'border-[#00FF66] bg-[#00FF66]/10 text-[#00FF66]' : 'border-zinc-800 bg-zinc-900/60 text-zinc-400'}`}
              >
                Count how many I have
              </button>
              <button
                type="button"
                onClick={() => setTrackStock(false)}
                className={`p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${!trackStock ? 'border-[#00FF66] bg-[#00FF66]/10 text-[#00FF66]' : 'border-zinc-800 bg-zinc-900/60 text-zinc-400'}`}
              >
                Just In Stock / Out
              </button>
            </div>
            {trackStock ? (
              <div className="space-y-1">
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={stockInput}
                  onChange={(e) => setStockInput(e.target.value)}
                  placeholder="How many are in stock? e.g. 25"
                  className={inputCls}
                />
                <p className="text-[10px] text-zinc-500">Shoppers see &ldquo;Only N left&rdquo; when 5 or fewer remain, and &ldquo;Out of Stock&rdquo; at 0.</p>
              </div>
            ) : (
              <label className="flex items-center justify-between cursor-pointer text-xs text-zinc-300 pt-1">
                <span>In Stock</span>
                <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="accent-[#00FF66]" />
              </label>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-400 font-semibold">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || uploading || tooMany}
          className="w-full py-3 bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : editing ? <Save className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
          {submitting ? (editing ? 'Saving...' : 'Adding...') : editing ? 'Save Changes' : 'Add Product'}
        </button>
      </div>
    </div>
  );
};

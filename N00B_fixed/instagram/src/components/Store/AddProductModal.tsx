import React, { useRef, useState } from 'react';
import { X, Upload, Loader2, ImageIcon, Video, Trash2 } from 'lucide-react';
import { StoreProductMedia } from '../../types';
import { uploadMediaFile, createStoreProduct } from '../../services/api';

const MAX_PHOTOS = 10;
const MAX_VIDEOS = 10;

interface AddProductModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export const AddProductModal: React.FC<AddProductModalProps> = ({ onClose, onCreated }) => {
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [inStock, setInStock] = useState(true);
  const [media, setMedia] = useState<StoreProductMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const photoCount = media.filter((m) => m.type === 'photo').length;
  const videoCount = media.filter((m) => m.type === 'video').length;

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

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setError(null);
    const parsedPrice = Number(price);
    if (!price || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setError('Enter a valid price.');
      return;
    }
    if (!description.trim()) {
      setError('A description is required.');
      return;
    }
    if (media.length === 0) {
      setError('Add at least one photo or video.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await createStoreProduct({ price: parsedPrice, description: description.trim(), media, inStock });
      if (res.success) {
        onCreated();
      } else {
        setError(res.error || 'Failed to add product.');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to add product. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-lg bg-[#0e0e0e] border border-zinc-800 sm:rounded-3xl rounded-t-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-white">Add Product</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer" aria-label="Close">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-zinc-400 uppercase">Price (₹)</label>
          <input
            type="number"
            min="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 499"
            className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-bold text-zinc-400 uppercase">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe the product..."
            className="w-full bg-zinc-900 text-sm text-white p-3 rounded-xl border border-zinc-800 outline-none focus:border-[#00FF66]/50 resize-none"
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
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files, 'photo'); e.target.value = ''; }}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(e) => { handleFiles(e.target.files, 'video'); e.target.value = ''; }}
          />
          {uploading && (
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...
            </div>
          )}
          {media.length > 0 && (
            <div className="grid grid-cols-4 gap-2 pt-1">
              {media.map((m, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-zinc-800 bg-zinc-900">
                  {m.type === 'photo' ? (
                    <img src={m.url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <video src={m.url} className="w-full h-full object-cover" muted />
                  )}
                  <button
                    type="button"
                    onClick={() => removeMedia(i)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/70 hover:bg-black cursor-pointer"
                    aria-label="Remove"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <label className="flex items-center justify-between cursor-pointer text-xs text-zinc-300 pt-1">
          <span>In Stock</span>
          <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="accent-[#00FF66]" />
        </label>

        {error && <p className="text-xs text-red-400 font-semibold">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting || uploading}
          className="w-full py-3 bg-gradient-to-r from-[#00FF66] to-cyan-400 text-black text-xs font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {submitting ? 'Adding...' : 'Add Product'}
        </button>
      </div>
    </div>
  );
};

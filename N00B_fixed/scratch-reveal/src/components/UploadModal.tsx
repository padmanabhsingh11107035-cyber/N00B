import React, { useState, useRef } from 'react';
import { X, Upload, Sparkles, Image as ImageIcon, Camera } from 'lucide-react';
import { ScratchPost } from '../types/scratch';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddPost: (newPost: ScratchPost) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onAddPost,
}) => {
  const [title, setTitle] = useState('');
  const [hint, setHint] = useState('');
  const [category, setCategory] = useState('Secret Drops');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectSample = (url: string, sampleTitle: string, sampleHint: string) => {
    setImagePreview(url);
    setTitle(sampleTitle);
    setHint(sampleHint);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagePreview) return;

    const newPost: ScratchPost = {
      id: `custom-${Date.now()}`,
      authorName: 'You (Creator)',
      authorHandle: '@you',
      authorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
      title: title.trim() || 'My Mystery Scratch Post ✨',
      hint: hint.trim() || 'Scratch to reveal the secret photo!',
      imageSrc: imagePreview,
      timestamp: 'Just now',
      likes: 1,
      thumbsUp: 1,
      flames: 1,
      rockets: 0,
      skulls: 0,
      commentsCount: 0,
      comments: [],
      category,
    };

    onAddPost(newPost);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-[#0d0d12] border-2 border-white rounded-3xl shadow-[5px_5px_0px_0px_#ffffff] p-5 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-3 border-b-2 border-white/40">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-yellow-400 text-black flex items-center justify-center border border-white">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-marker text-sm text-white">Create Scratch Post</h3>
              <p className="font-doodle text-xs text-zinc-400">Upload and seal with Noob foil</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close upload dialog"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-zinc-900 text-zinc-300 hover:text-white border border-white/40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Dropzone / Upload Target */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-4 text-center transition-all ${
              imagePreview
                ? 'border-emerald-400 bg-emerald-950/20'
                : 'border-white/60 bg-black hover:border-white hover:bg-zinc-900'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {imagePreview ? (
              <div className="space-y-2">
                <img
                  src={imagePreview}
                  alt="Upload Preview"
                  className="w-full h-36 object-cover rounded-xl border border-white"
                />
                <span className="text-[11px] font-doodle text-emerald-300 block">
                  ✓ Photo Loaded! Click to choose another
                </span>
              </div>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center gap-2">
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border border-white/40 text-white">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="font-marker text-xs text-white">
                  Drop photo or click to browse
                </div>
                <div className="text-[10px] font-doodle text-zinc-400">
                  Supports JPG, PNG, WebP up to 10MB
                </div>
              </div>
            )}
          </div>

          {/* Quick presets if user doesn't have a photo on hand */}
          <div>
            <span className="text-[10px] font-marker uppercase text-zinc-400 block mb-1.5">
              Or pick a mystery preset:
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() =>
                  handleSelectSample(
                    'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80',
                    'Street Graffiti Masterpiece 🎨',
                    'Scratch to unveil the hidden alley mural'
                  )
                }
                className="p-1.5 rounded-xl border border-white/40 bg-zinc-900 hover:border-white text-left text-[10px] font-doodle text-zinc-200"
              >
                🎨 Street Art
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSelectSample(
                    'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=800&q=80',
                    'Next-Gen Esports Rig Reveal 🎮',
                    'Scratch to see the custom liquid cooled rig'
                  )
                }
                className="p-1.5 rounded-xl border border-white/40 bg-zinc-900 hover:border-white text-left text-[10px] font-doodle text-zinc-200"
              >
                🎮 Gaming Rig
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSelectSample(
                    'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80',
                    'Matcha Boba Secret Menu Item 🧋',
                    'Scratch to reveal the signature drink recipe'
                  )
                }
                className="p-1.5 rounded-xl border border-white/40 bg-zinc-900 hover:border-white text-left text-[10px] font-doodle text-zinc-200"
              >
                🧋 Boba Secret
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-marker uppercase text-zinc-300 block mb-1">
              Title / Catchphrase
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Secret Backstage Moment..."
              className="w-full bg-black border-2 border-white rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 font-sans focus:outline-none focus:ring-1 focus:ring-white"
            />
          </div>

          <div>
            <label className="text-[10px] font-marker uppercase text-zinc-300 block mb-1">
              Scratch Hint / Teaser
            </label>
            <input
              type="text"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="e.g. Scratch the center for the surprise!"
              className="w-full bg-black border-2 border-white rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 font-sans focus:outline-none focus:ring-1 focus:ring-white"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={!imagePreview}
              className="w-full py-2.5 bg-white disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-marker text-xs rounded-xl border-2 border-white shadow-[3px_3px_0px_0px_#ffffff] flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Sparkles className="w-4 h-4 text-black" />
              <span>Seal with Scratch Foil & Post</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

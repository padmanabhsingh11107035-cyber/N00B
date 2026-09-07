import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Image as ImageIcon,
  Video,
  Plus,
  Trash2,
  X,
  Check,
  Upload,
  Play,
  Layers,
  Edit3
} from 'lucide-react';
import { User } from '../../types';
import confetti from 'canvas-confetti';

export interface HighlightItem {
  id: string;
  title: string;
  cover: string; // The first image uploaded becomes this cover icon
  media: Array<{
    id: string;
    url: string;
    type: 'image' | 'video';
    caption?: string;
    createdAt: string;
  }>;
}

interface HighlightManagerModalProps {
  currentUser: User;
  existingHighlight?: HighlightItem | null;
  onSave: (highlight: HighlightItem) => void;
  onDelete?: (highlightId: string) => void;
  onClose: () => void;
}

export const HighlightManagerModal: React.FC<HighlightManagerModalProps> = ({
  currentUser,
  existingHighlight,
  onSave,
  onDelete,
  onClose
}) => {
  const [title, setTitle] = useState(existingHighlight?.title || '');
  const [mediaList, setMediaList] = useState<
    Array<{ id: string; url: string; type: 'image' | 'video'; caption?: string; createdAt: string }>
  >(existingHighlight?.media || []);
  const [customCover, setCustomCover] = useState(existingHighlight?.cover || '');
  const [newCaption, setNewCaption] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setErrorMessage(null);
    setIsUploading(true);

    Array.from(files).forEach((file: File) => {
      if (file.size > 25 * 1024 * 1024) {
        setErrorMessage('Each media file must be under 25MB.');
        setIsUploading(false);
        return;
      }

      const isVideo = file.type.startsWith('video');
      const reader = new FileReader();

      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          const newMediaItem = {
            id: `hl_media_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            url: result,
            type: isVideo ? ('video' as const) : ('image' as const),
            caption: newCaption || '',
            createdAt: new Date().toLocaleDateString()
          };

          setMediaList((prev) => {
            const updated = [...prev, newMediaItem];
            // If custom cover is not manually set, the first media item automatically becomes the cover!
            if (!customCover && !isVideo) {
              setCustomCover(result);
            }
            return updated;
          });
        }
      };

      reader.readAsDataURL(file);
    });

    setIsUploading(false);
    setNewCaption('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveMedia = (mediaId: string) => {
    setMediaList((prev) => {
      const filtered = prev.filter((m) => m.id !== mediaId);
      // If we removed the cover, fall back to the first available image
      if (customCover) {
        const firstImg = filtered.find((m) => m.type === 'image');
        if (firstImg) setCustomCover(firstImg.url);
      }
      return filtered;
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage('Please give your Story Highlight a name.');
      return;
    }
    if (mediaList.length === 0) {
      setErrorMessage('Please upload at least one photo or video for this highlight.');
      return;
    }

    // First image uploaded automatically becomes the icon cover page
    const firstImageMedia = mediaList.find((m) => m.type === 'image');
    const finalCover =
      customCover ||
      (firstImageMedia ? firstImageMedia.url : mediaList[0].url) ||
      currentUser.avatar;

    const highlightItem: HighlightItem = {
      id: existingHighlight?.id || `hl_${Date.now()}`,
      title: title.trim(),
      cover: finalCover,
      media: mediaList
    };

    onSave(highlightItem);
    confetti({ particleCount: 30, spread: 60, origin: { y: 0.7 } });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <header className="p-4 sm:p-5 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#00FF66] to-emerald-400 p-[2px]">
              <div className="w-full h-full bg-black rounded-[14px] flex items-center justify-center">
                <Layers className="w-4 h-4 text-[#00FF66]" />
              </div>
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {existingHighlight ? 'Edit Story Highlight' : 'New Story Highlight'}
              </h2>
              <p className="text-[11px] text-zinc-400">
                The 1st photo uploaded becomes the cover icon
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
              {errorMessage}
            </div>
          )}

          {/* Highlight Name Input */}
          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1.5">
              Highlight Name / Title <span className="text-pink-400">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={25}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Summer Vibe, Gaming Rig, Trip 2026..."
              className="w-full bg-zinc-900 border border-zinc-800 text-sm text-white px-3.5 py-2.5 rounded-2xl focus:border-[#00FF66] outline-none transition-colors"
            />
          </div>

          {/* Media Items in this Highlight */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-zinc-300">
                Photos &amp; Videos ({mediaList.length})
              </label>
              <span className="text-[10px] text-zinc-400">
                Add more photos or videos to this collection
              </span>
            </div>

            {/* Media Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {/* Upload New Tile */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square bg-zinc-900/90 border border-dashed border-zinc-700 hover:border-[#00FF66] rounded-2xl flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-[#00FF66] transition-colors cursor-pointer group"
              >
                <Plus className="w-6 h-6 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-bold">Add Media</span>
              </button>

              {/* Uploaded Items */}
              {mediaList.map((m, idx) => (
                <div
                  key={m.id}
                  className="aspect-square relative rounded-2xl overflow-hidden border border-zinc-800 bg-black group"
                >
                  {m.type === 'video' ? (
                    <div className="w-full h-full relative flex items-center justify-center bg-zinc-900">
                      <video src={m.url} className="w-full h-full object-cover opacity-80" />
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <Play className="w-5 h-5 text-white fill-white/80" />
                      </div>
                    </div>
                  ) : (
                    <img
                      src={m.url}
                      alt="Highlight media"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  )}

                  {/* 1st Photo / Cover Badge */}
                  {idx === 0 && (
                    <div className="absolute top-1.5 left-1.5 bg-[#00FF66] text-black text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                      COVER
                    </div>
                  )}

                  {/* Delete Button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveMedia(m.id)}
                    className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    title="Remove from highlight"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>

          {/* Icon Preview */}
          <div className="p-3.5 bg-zinc-900/60 border border-zinc-800 rounded-2xl flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-full p-[2px] bg-gradient-to-tr from-[#00FF66] to-emerald-400 shrink-0">
              <img
                src={
                  mediaList[0]?.type === 'image'
                    ? mediaList[0]?.url
                    : customCover || currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'
                }
                alt="Highlight Icon Cover"
                className="w-full h-full rounded-full object-cover p-0.5 bg-black"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">
                Profile Icon Preview
              </span>
              <span className="text-[11px] text-zinc-400 block mt-0.5">
                Label: <strong className="text-white">@{title || 'Highlight Name'}</strong>
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-2 justify-between">
            {existingHighlight && onDelete && (
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
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(existingHighlight.id);
                        onClose();
                      }}
                      className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl flex items-center gap-1.5 cursor-pointer shadow-lg shadow-red-500/30"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-2.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-[#00FF66] hover:bg-[#00FF66]/90 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-[#00FF66]/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Save Highlight
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

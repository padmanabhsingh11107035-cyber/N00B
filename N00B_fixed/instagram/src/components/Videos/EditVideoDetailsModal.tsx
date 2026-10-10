import React, { useRef, useState } from 'react';
import { X, Image as ImageIcon, RefreshCw } from 'lucide-react';
import { uploadMediaFile, updateLongVideo } from '../../services/api';
import { LongVideo } from '../../types';

interface EditVideoDetailsModalProps {
  video: LongVideo;
  onClose: () => void;
  onSaved: (video: LongVideo) => void;
}

export const EditVideoDetailsModal: React.FC<EditVideoDetailsModalProps> = ({ video, onClose, onSaved }) => {
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState(video.thumbnailUrl || '');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const handlePickThumbnail = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('The thumbnail must be an image.');
      return;
    }
    setThumbnailFile(file);
    setThumbnailPreviewUrl(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    setError('');
    setIsSaving(true);
    try {
      let thumbnailUrl: string | undefined;
      if (thumbnailFile) {
        const res = await uploadMediaFile(thumbnailFile, 'videos');
        thumbnailUrl = res.url;
      }
      const updated = await updateLongVideo(video.id, { title: title.trim(), description: description.trim(), thumbnailUrl });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save these changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-lg bg-zinc-950 border border-neutral-800 sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
          <h3 className="text-sm font-bold text-white">Edit Video</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-neutral-800 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">Thumbnail</label>
            <input
              ref={thumbInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePickThumbnail(f); e.target.value = ''; }}
            />
            <button
              onClick={() => thumbInputRef.current?.click()}
              className="relative w-40 aspect-video rounded-lg overflow-hidden border border-neutral-700 bg-black cursor-pointer group"
            >
              {thumbnailPreviewUrl ? (
                <img src={thumbnailPreviewUrl} alt="Thumbnail" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-600"><ImageIcon className="w-6 h-6" /></div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] font-bold text-white transition-opacity">
                Change
              </div>
            </button>
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              placeholder="Give your video a title"
              className="w-full bg-black rounded-xl border border-neutral-700 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-noob"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="What's this video about?"
              className="w-full bg-black rounded-xl border border-neutral-700 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-noob resize-none"
            />
          </div>

          {error && <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-400">{error}</div>}
        </div>

        <div className="p-3.5 border-t border-neutral-800 shrink-0">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-3 rounded-xl bg-noob text-black font-bold text-sm disabled:opacity-40 cursor-pointer flex items-center justify-center gap-2"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

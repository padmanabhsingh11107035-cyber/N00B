import React, { useState, useRef } from 'react';
import { X, Sparkles, Check, MapPin, HelpCircle, ImagePlus, Loader2 } from 'lucide-react';
import { Story } from '../../types';
import { uploadMediaFile } from '../../services/api';

interface CreateStoryModalProps {
  onClose: () => void;
  // An array because a poll turns into its own second story "page" (a plain colour
  // background) that must be created right after the main one — see handlePublish.
  onSubmitStory: (storyData: Partial<Story>[]) => void;
}

const POLL_BG_COLORS = ['#00FF66', '#7C3AED', '#EF4444', '#3B82F6', '#F59E0B', '#EC4899', '#000000', '#FFFFFF'];

export const CreateStoryModal: React.FC<CreateStoryModalProps> = ({ onClose, onSubmitStory }) => {
  const [selectedImage, setSelectedImage] = useState<string>('');
  const [selectedImageObjectKey, setSelectedImageObjectKey] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [filter, setFilter] = useState<'none' | 'emerald' | 'cyber' | 'gala' | 'monochrome'>('none');
  const [isCloseFriends, setIsCloseFriends] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [showPollInput, setShowPollInput] = useState(false);
  const [pollBgColor, setPollBgColor] = useState(POLL_BG_COLORS[0]);
  const [locationTag, setLocationTag] = useState('');
  const [showLocationInput, setShowLocationInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError('');
    try {
      const res = await uploadMediaFile(file, 'stories');
      if (res.url) {
        setSelectedImage(res.url);
        // The presigned URL expires in an hour — persist the durable object
        // key instead so the server can re-sign it for as long as the story lasts.
        setSelectedImageObjectKey(res.objectKey || '');
      } else {
        setUploadError('Upload failed. Please try again.');
      }
    } catch (err) {
      console.error('Story upload failed:', err);
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // A poll no longer overlays the photo — it gets its own following page instead: a
  // plain, user-chosen background colour with just the poll centered on it. Rendered
  // once as a real image (not a new story "kind") so it flows through the exact same
  // upload/storage/expiry/highlight path as every other story, with no schema change.
  const renderPollPageFile = (color: string): Promise<File> =>
    new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas unavailable')); return; }
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('Could not render the poll page')); return; }
        resolve(new File([blob], 'poll-page.png', { type: 'image/png' }));
      }, 'image/png');
    });

  const handlePublish = async () => {
    if (!selectedImage || isPublishing) return;
    setIsPublishing(true);
    setUploadError('');

    try {
      const mainStickers: any[] = [];
      if (locationTag.trim()) {
        mainStickers.push({
          type: 'location',
          data: { name: locationTag.trim(), weather: '24°C Sunny' },
          x: 50,
          y: 75
        });
      }

      const mainStory: Partial<Story> = {
        mediaUrl: selectedImageObjectKey || selectedImage,
        mediaType: 'image',
        filter,
        isCloseFriendsOnly: isCloseFriends,
        stickers: mainStickers
      };

      // The viewer walks a user's stories oldest-created first. So the poll page has to be
      // POSTED (and therefore timestamped) BEFORE the main photo for it to actually land as
      // the "next" page after the photo, even though it's built and uploaded second here.
      const stories: Partial<Story>[] = [];

      if (pollQuestion.trim()) {
        const pollFile = await renderPollPageFile(pollBgColor);
        const uploaded = await uploadMediaFile(pollFile, 'stories');
        if (!uploaded.url) throw new Error('Could not upload the poll page.');
        stories.push({
          mediaUrl: uploaded.objectKey || uploaded.url,
          mediaType: 'image',
          isCloseFriendsOnly: isCloseFriends,
          stickers: [
            {
              type: 'poll',
              data: { question: pollQuestion.trim(), options: ['Yes 🔥', 'No 👎'] },
              x: 50,
              y: 50
            }
          ]
        });
      }

      stories.push(mainStory);

      onSubmitStory(stories);
      onClose();
    } catch (err) {
      console.error('Story publish failed:', err);
      setUploadError('Could not post your story. Please try again.');
      setIsPublishing(false);
    }
  };

  const getFilterStyle = () => {
    switch (filter) {
      case 'emerald':
        return 'hue-rotate-60 contrast-125 saturate-150';
      case 'cyber':
        return 'hue-rotate-180 contrast-150 brightness-110';
      case 'gala':
        return 'contrast-110 sepia-25 brightness-105';
      case 'monochrome':
        return 'grayscale contrast-125';
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-[#121212] border border-neutral-800 rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
          <h3 className="text-sm font-bold text-white tracking-tight">Create NOOB Story</h3>
          <button
            onClick={handlePublish}
            disabled={!selectedImage || isUploading || isPublishing}
            className="px-3.5 py-1 bg-[#00FF66] text-black text-xs font-bold rounded-full hover:scale-105 transition-transform cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isPublishing ? 'Sharing...' : 'Share'}
          </button>
        </div>

        {/* Story Preview Area */}
        <div className="relative w-full aspect-[9/14] bg-black overflow-hidden flex items-center justify-center">
          {selectedImage ? (
            <img
              src={selectedImage}
              alt="Preview"
              className={`w-full h-full object-contain transition-all duration-300 ${getFilterStyle()}`}
            />
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex flex-col items-center gap-3 text-zinc-400 hover:text-[#00FF66] transition-colors cursor-pointer"
            >
              {isUploading ? (
                <Loader2 className="w-10 h-10 animate-spin" />
              ) : (
                <ImagePlus className="w-10 h-10" />
              )}
              <span className="text-xs font-bold">
                {isUploading ? 'Uploading...' : 'Select a photo from your gallery'}
              </span>
              {uploadError && <span className="text-[10px] text-red-400">{uploadError}</span>}
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePickImage}
            className="hidden"
          />

          {/* Location Sticker Preview */}
          {selectedImage && showLocationInput && (
            <div className="absolute bottom-1/4 inset-x-8 bg-black/85 backdrop-blur-md border border-[#00FF66] rounded-xl p-2 shadow-2xl z-20 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#00FF66]" />
              <input
                type="text"
                placeholder="Enter Location Tag..."
                value={locationTag}
                onChange={(e) => setLocationTag(e.target.value)}
                className="w-full bg-transparent text-xs text-white focus:outline-none"
                autoFocus
              />
            </div>
          )}

          {selectedImage && !isUploading && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="absolute top-3 right-3 z-20 p-2 bg-black/70 hover:bg-black/90 rounded-full text-white cursor-pointer"
              title="Choose a different photo"
            >
              <ImagePlus className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tools & Filter Presets */}
        {selectedImage && (
          <div className="p-3 bg-neutral-900 border-t border-neutral-800 space-y-3">
            {uploadError && (
              <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-[11px]">
                {uploadError}
              </div>
            )}
            {/* Quick Interactive Sticker Toggles */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setShowPollInput(!showPollInput)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  showPollInput ? 'bg-[#00FF66] text-black font-bold' : 'bg-neutral-800 text-gray-300 hover:bg-neutral-700'
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5" /> Poll Sticker
              </button>
              <button
                onClick={() => setShowLocationInput(!showLocationInput)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  showLocationInput ? 'bg-[#00FF66] text-black font-bold' : 'bg-neutral-800 text-gray-300 hover:bg-neutral-700'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" /> Location
              </button>
              <button
                onClick={() => setIsCloseFriends(!isCloseFriends)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  isCloseFriends ? 'bg-emerald-500 text-black font-bold' : 'bg-neutral-800 text-gray-300 hover:bg-neutral-700'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" /> Close Friends Only
              </button>
            </div>

            {/* Poll Setup: this no longer overlays the photo — it becomes its own page
                right after this one, with a plain background in the color you pick. */}
            {showPollInput && (
              <div className="p-3 bg-neutral-950 border border-[#00FF66]/30 rounded-xl space-y-2.5">
                <p className="text-[10px] text-gray-400">
                  Your poll appears as its own page, right after this photo — not on top of it.
                </p>
                <input
                  type="text"
                  placeholder="Ask a question for your poll..."
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  className="w-full bg-neutral-900 text-xs text-white p-2 rounded-lg border border-neutral-700 focus:border-[#00FF66] outline-none text-center font-bold"
                />
                <div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1.5">
                    Poll Page Background Color
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {POLL_BG_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setPollBgColor(c)}
                        title={c}
                        className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                          pollBgColor === c ? 'border-white scale-110' : 'border-neutral-700 hover:scale-105'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                {pollQuestion.trim() && (
                  <div
                    className="aspect-[9/16] w-24 mx-auto rounded-lg flex items-center justify-center p-2 shadow-lg"
                    style={{ backgroundColor: pollBgColor }}
                  >
                    <div className="w-full bg-black/85 border border-[#00FF66]/40 rounded-md p-1.5">
                      <p className="text-[7px] font-bold text-center text-white mb-1 line-clamp-2">{pollQuestion}</p>
                      <div className="space-y-0.5">
                        <div className="bg-neutral-800 text-white text-[6px] font-semibold text-center py-0.5 rounded">Yes 🔥</div>
                        <div className="bg-neutral-800 text-white text-[6px] font-semibold text-center py-0.5 rounded">No 👎</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AR / Classic Filters Selector */}
            <div>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1.5">
                AR & Color Presets
              </span>
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {(['none', 'emerald', 'cyber', 'gala', 'monochrome'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize border transition-all ${
                      filter === f
                        ? 'border-[#00FF66] bg-[#00FF66]/10 text-[#00FF66]'
                        : 'border-neutral-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    {f === 'gala' ? '✨ GALA Preset' : f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

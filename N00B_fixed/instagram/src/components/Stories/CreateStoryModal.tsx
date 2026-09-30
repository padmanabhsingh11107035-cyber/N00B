import React, { useState, useRef } from 'react';
import { X, Sparkles, Check, MapPin, HelpCircle, ImagePlus, Loader2, Plus, Trash2, Type } from 'lucide-react';
import { Story } from '../../types';
import { uploadMediaFile } from '../../services/api';
import { EditableStickerLayer } from './EditableStickerLayer';

const TEXT_COLORS = ['#FFFFFF', '#000000', '#00FF66', '#EF4444', '#3B82F6', '#F59E0B', '#EC4899'];

interface TextLayer {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
}

interface CreateStoryModalProps {
  onClose: () => void;
  // An array because a poll turns into its own second story "page" (a plain colour
  // background) that must be created right after the main one — see handlePublish.
  onSubmitStory: (storyData: Partial<Story>[]) => void;
}

const POLL_BG_COLORS = ['#00FF66', '#7C3AED', '#EF4444', '#3B82F6', '#F59E0B', '#EC4899', '#000000', '#FFFFFF'];
// The person posting the poll writes its answers: at least 2, at most 8.
const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 8;
const MAX_OPTION_LENGTH = 40;

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
  const [pollOptions, setPollOptions] = useState<string[]>(['Yes 🔥', 'No 👎']);
  const cleanOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
  const pollOptionsError =
    cleanOptions.length < MIN_POLL_OPTIONS
      ? 'Write at least 2 answers for your poll.'
      : new Set(cleanOptions.map((o) => o.toLowerCase())).size !== cleanOptions.length
        ? 'Each answer must be different.'
        : '';
  const [locationTag, setLocationTag] = useState('');
  const [showLocationInput, setShowLocationInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Draggable/resizable/rotatable text layers placed on the photo (the first of the
  // "layered editor" sticker types — Stickers/Draw/Link/Mention/etc. build on the same
  // EditableStickerLayer engine in later passes).
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [isDraggingLayer, setIsDraggingLayer] = useState(false);
  const [isOverTrash, setIsOverTrash] = useState(false);
  const [textEditorId, setTextEditorId] = useState<string | 'new' | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftColor, setDraftColor] = useState(TEXT_COLORS[0]);

  const openNewTextLayer = () => {
    setDraftText('');
    setDraftColor(TEXT_COLORS[0]);
    setTextEditorId('new');
  };

  const openEditTextLayer = (layer: TextLayer) => {
    setDraftText(layer.text);
    setDraftColor(layer.color);
    setTextEditorId(layer.id);
  };

  const commitTextEditor = () => {
    const text = draftText.trim();
    if (!text) {
      setTextEditorId(null);
      return;
    }
    if (textEditorId === 'new') {
      const id = `text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setTextLayers((prev) => [
        ...prev,
        { id, text, color: draftColor, x: 50, y: 40 + Math.min(prev.length * 6, 24), width: 60, rotation: 0 }
      ]);
      setActiveLayerId(id);
    } else if (textEditorId) {
      setTextLayers((prev) => prev.map((l) => (l.id === textEditorId ? { ...l, text, color: draftColor } : l)));
      setActiveLayerId(textEditorId);
    }
    setTextEditorId(null);
  };

  const deleteTextLayer = (id: string) => {
    setTextLayers((prev) => prev.filter((l) => l.id !== id));
    setActiveLayerId((cur) => (cur === id ? null : cur));
  };

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
    if (pollQuestion.trim() && pollOptionsError) {
      setUploadError(pollOptionsError);
      return;
    }
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
      textLayers.forEach((layer) => {
        mainStickers.push({
          type: 'text',
          data: { text: layer.text, color: layer.color },
          x: layer.x,
          y: layer.y,
          width: layer.width,
          rotation: layer.rotation
        });
      });

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
              data: { question: pollQuestion.trim(), options: cleanOptions.slice(0, MAX_POLL_OPTIONS) },
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
        <div
          ref={canvasRef}
          className="relative w-full aspect-[9/14] bg-black overflow-hidden flex items-center justify-center"
          style={{ containerType: 'inline-size' }}
          onPointerDown={() => setActiveLayerId(null)}
        >
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

          {/* Draggable / resizable / rotatable text layers */}
          {selectedImage &&
            textLayers.map((layer) => (
              <EditableStickerLayer
                key={layer.id}
                x={layer.x}
                y={layer.y}
                width={layer.width}
                rotation={layer.rotation}
                canvasRef={canvasRef}
                active={activeLayerId === layer.id}
                onSelect={() => setActiveLayerId(layer.id)}
                onChange={(next) =>
                  setTextLayers((prev) => prev.map((l) => (l.id === layer.id ? { ...l, ...next } : l)))
                }
                onTap={() => openEditTextLayer(layer)}
                onDelete={() => deleteTextLayer(layer.id)}
                onDragStateChange={(dragging, overTrash) => {
                  setIsDraggingLayer(dragging);
                  setIsOverTrash(overTrash);
                }}
              >
                <p
                  className="font-extrabold text-center whitespace-pre-wrap break-words px-1"
                  style={{
                    color: layer.color,
                    fontSize: `${layer.width * 0.12}cqw`,
                    textShadow: '0 2px 6px rgba(0,0,0,0.6), 0 0 2px rgba(0,0,0,0.85)'
                  }}
                >
                  {layer.text}
                </p>
              </EditableStickerLayer>
            ))}

          {/* Trash drop zone — shown only while dragging a layer */}
          {isDraggingLayer && (
            <div
              className={`absolute inset-x-0 bottom-0 h-24 z-40 flex items-end justify-center pb-4 pointer-events-none transition-colors ${
                isOverTrash ? 'bg-red-500/25' : 'bg-black/40'
              }`}
            >
              <div
                className={`p-3 rounded-full transition-transform ${
                  isOverTrash ? 'bg-red-500 scale-110' : 'bg-black/70'
                }`}
              >
                <Trash2 className="w-5 h-5 text-white" />
              </div>
            </div>
          )}

          {/* Full-screen text composer */}
          {textEditorId !== null && (
            <div
              className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <button
                  onClick={() => setTextEditorId(null)}
                  className="p-1.5 rounded-full bg-black/60 text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                {textEditorId !== 'new' && (
                  <button
                    onClick={() => {
                      deleteTextLayer(textEditorId);
                      setTextEditorId(null);
                    }}
                    className="p-1.5 rounded-full bg-black/60 text-red-400 cursor-pointer"
                    title="Delete text"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={commitTextEditor}
                  disabled={!draftText.trim()}
                  className="px-3.5 py-1 bg-[#00FF66] text-black text-xs font-bold rounded-full cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Done
                </button>
              </div>
              <div className="flex-1 flex items-center justify-center p-6">
                <textarea
                  autoFocus
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  placeholder="Type something..."
                  maxLength={200}
                  rows={3}
                  className="w-full bg-transparent text-center font-extrabold text-2xl resize-none focus:outline-none placeholder:text-white/40"
                  style={{ color: draftColor, textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}
                />
              </div>
              <div className="flex items-center justify-center gap-2.5 pb-6">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraftColor(c)}
                    title={c}
                    className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                      draftColor === c ? 'border-white scale-110' : 'border-neutral-600 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
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
                onClick={openNewTextLayer}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors bg-neutral-800 text-gray-300 hover:bg-neutral-700"
              >
                <Type className="w-3.5 h-3.5" /> Text
              </button>
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
                {/* The answers people can vote for: written by you, 2 to 8 of them */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Answers</span>
                    <span className="text-[10px] text-gray-500">{pollOptions.length}/{MAX_POLL_OPTIONS}</span>
                  </div>
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={opt}
                        maxLength={MAX_OPTION_LENGTH}
                        placeholder={`Answer ${i + 1}`}
                        onChange={(e) => setPollOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
                        className="flex-1 min-w-0 bg-neutral-900 text-xs text-white px-2.5 py-2 rounded-lg border border-neutral-700 focus:border-[#00FF66] outline-none font-semibold"
                      />
                      {pollOptions.length > MIN_POLL_OPTIONS && (
                        <button
                          type="button"
                          onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                          className="p-2 rounded-lg text-gray-400 hover:text-red-400 hover:bg-neutral-800 transition-colors cursor-pointer"
                          aria-label={`Remove answer ${i + 1}`}
                          title="Remove this answer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < MAX_POLL_OPTIONS && (
                    <button
                      type="button"
                      onClick={() => setPollOptions((prev) => [...prev, ''])}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-neutral-700 text-[11px] font-bold text-gray-300 hover:border-[#00FF66] hover:text-[#00FF66] transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add answer
                    </button>
                  )}
                  {pollQuestion.trim() && pollOptionsError && (
                    <p className="text-[10px] text-red-400">{pollOptionsError}</p>
                  )}
                </div>
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
                        {cleanOptions.map((o, i) => (
                          <div key={i} className="bg-neutral-800 text-white text-[6px] font-semibold text-center py-0.5 rounded truncate px-0.5">{o}</div>
                        ))}
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

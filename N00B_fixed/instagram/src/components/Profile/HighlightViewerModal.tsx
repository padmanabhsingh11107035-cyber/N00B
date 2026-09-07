import React, { useState } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Edit3,
  Volume2,
  VolumeX,
  Layers,
  Trash2
} from 'lucide-react';
import { HighlightItem } from './HighlightManagerModal';

interface HighlightViewerModalProps {
  highlight: HighlightItem;
  onClose: () => void;
  onEdit: (highlight: HighlightItem) => void;
  onDelete?: (highlightId: string) => void;
}

export const HighlightViewerModal: React.FC<HighlightViewerModalProps> = ({
  highlight,
  onClose,
  onEdit,
  onDelete
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const currentMedia = highlight.media[currentIndex] || highlight.media[0];

  const handleNext = () => {
    if (currentIndex < highlight.media.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  if (!currentMedia) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-2xl flex items-center justify-center p-2 sm:p-4">
      <div className="relative w-full max-w-md aspect-[9/16] max-h-[90vh] bg-zinc-950 rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col justify-between select-none">
        {/* Top Progress Bars */}
        <div className="absolute top-3 inset-x-3 z-30 flex items-center gap-1">
          {highlight.media.map((_, idx) => (
            <div key={idx} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className={`h-full bg-white transition-all duration-300 ${
                  idx < currentIndex ? 'w-full' : idx === currentIndex ? 'w-full animate-pulse' : 'w-0'
                }`}
              />
            </div>
          ))}
        </div>

        {/* Top Header Bar */}
        <div className="relative z-30 pt-7 px-4 pb-3 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <img
              src={highlight.cover}
              alt={highlight.title}
              className="w-8 h-8 rounded-full object-cover border border-[#00FF66]"
              referrerPolicy="no-referrer"
            />
            <div>
              <span className="text-xs font-black block leading-tight">{highlight.title}</span>
              <span className="text-[10px] text-zinc-400">
                {currentIndex + 1} of {highlight.media.length} items
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onDelete && (
              !confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 rounded-full bg-black/60 hover:bg-red-900/50 text-zinc-300 hover:text-red-400 border border-white/10 transition-colors cursor-pointer"
                  title="Delete this highlight"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="flex items-center gap-1 bg-black/90 p-1 rounded-full border border-red-500/40 animate-in fade-in">
                  <button
                    onClick={() => {
                      onDelete(highlight.id);
                      onClose();
                    }}
                    className="px-2 py-0.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-[10px] font-black cursor-pointer shadow"
                  >
                    Delete?
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-1.5 py-0.5 text-zinc-400 hover:text-white text-[10px] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )
            )}
            <button
              onClick={() => {
                onClose();
                onEdit(highlight);
              }}
              className="p-1.5 rounded-full bg-black/60 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 transition-colors text-xs flex items-center gap-1 cursor-pointer"
              title="Add more photos/videos or edit"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold hidden sm:inline">Add / Edit</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-black/60 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Media Area */}
        <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden">
          {currentMedia.type === 'video' ? (
            <video
              src={currentMedia.url}
              autoPlay
              playsInline
              loop
              controls
              className="w-full h-full object-contain"
            />
          ) : (
            <img
              src={currentMedia.url}
              alt={currentMedia.caption || highlight.title}
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          )}

          {/* Left/Right Click Nav Zones */}
          <div
            className="absolute inset-y-0 left-0 w-1/3 z-20 cursor-pointer"
            onClick={handlePrev}
          />
          <div
            className="absolute inset-y-0 right-0 w-1/3 z-20 cursor-pointer"
            onClick={handleNext}
          />

          {/* Navigation Arrows */}
          {currentIndex > 0 && (
            <button
              onClick={handlePrev}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white z-30 hover:scale-110 transition-transform cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={handleNext}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white z-30 hover:scale-110 transition-transform cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Bottom Caption & Date */}
        {currentMedia.caption && (
          <div className="relative z-30 p-4 bg-gradient-to-t from-black/90 to-transparent text-white">
            <p className="text-xs font-medium leading-relaxed">{currentMedia.caption}</p>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { X, Sparkles, Image, Check, MapPin, Smile, Music, HelpCircle } from 'lucide-react';
import { Story } from '../../types';

interface CreateStoryModalProps {
  onClose: () => void;
  onSubmitStory: (storyData: Partial<Story>) => void;
}

const SAMPLE_STORY_IMAGES = [
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1080&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1080&auto=format&fit=crop&q=80'
];

export const CreateStoryModal: React.FC<CreateStoryModalProps> = ({ onClose, onSubmitStory }) => {
  const [selectedImage, setSelectedImage] = useState(SAMPLE_STORY_IMAGES[0]);
  const [filter, setFilter] = useState<'none' | 'emerald' | 'cyber' | 'gala' | 'monochrome'>('none');
  const [isCloseFriends, setIsCloseFriends] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [showPollInput, setShowPollInput] = useState(false);
  const [locationTag, setLocationTag] = useState('');
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [activeTab, setActiveTab] = useState<'normal' | 'boomerang' | 'superzoom'>('normal');

  const handlePublish = () => {
    const stickers: any[] = [];
    if (pollQuestion.trim()) {
      stickers.push({
        type: 'poll',
        data: { question: pollQuestion.trim(), options: ['Yes 🔥', 'No 👎'] },
        x: 50,
        y: 40
      });
    }
    if (locationTag.trim()) {
      stickers.push({
        type: 'location',
        data: { name: locationTag.trim(), weather: '24°C Sunny' },
        x: 50,
        y: 75
      });
    }

    onSubmitStory({
      mediaUrl: selectedImage,
      mediaType: 'image',
      filter,
      isCloseFriendsOnly: isCloseFriends,
      stickers
    });
    onClose();
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
          <h3 className="text-sm font-bold text-white tracking-tight">Create Instagram Story</h3>
          <button
            onClick={handlePublish}
            className="px-3.5 py-1 bg-[#00FF66] text-black text-xs font-bold rounded-full hover:scale-105 transition-transform cursor-pointer"
          >
            Share
          </button>
        </div>

        {/* Story Mode Selector */}
        <div className="flex justify-center gap-2 py-2 bg-neutral-900/60 border-b border-neutral-800/60">
          {(['normal', 'boomerang', 'superzoom'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setActiveTab(mode)}
              className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors ${
                activeTab === mode
                  ? 'bg-[#00FF66]/20 text-[#00FF66] border border-[#00FF66]/40'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {/* Story Preview Area */}
        <div className="relative w-full aspect-[9/14] bg-black overflow-hidden flex items-center justify-center">
          <img
            src={selectedImage || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080&auto=format&fit=crop&q=80'}
            alt="Preview"
            className={`w-full h-full object-cover transition-all duration-300 ${getFilterStyle()} ${
              activeTab === 'boomerang' ? 'animate-pulse' : ''
            }`}
          />

          {/* Interactive Poll Sticker Preview */}
          {showPollInput && (
            <div className="absolute top-1/3 inset-x-6 bg-black/80 backdrop-blur-md border border-[#00FF66] rounded-xl p-3 shadow-2xl z-20">
              <input
                type="text"
                placeholder="Ask a question for your poll..."
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                className="w-full bg-neutral-900 text-xs text-white p-2 rounded-lg border border-neutral-700 focus:border-[#00FF66] outline-none text-center font-bold"
                autoFocus
              />
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="bg-[#00FF66] text-black text-xs font-bold text-center py-1.5 rounded-lg">Yes 🔥</div>
                <div className="bg-neutral-800 text-white text-xs font-bold text-center py-1.5 rounded-lg">No 👎</div>
              </div>
            </div>
          )}

          {/* Location Sticker Preview */}
          {showLocationInput && (
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
        </div>

        {/* Tools & Filter Presets */}
        <div className="p-3 bg-neutral-900 border-t border-neutral-800 space-y-3">
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

          {/* Choose Media Source */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
            {SAMPLE_STORY_IMAGES.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedImage(img)}
                className={`w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-transform ${
                  selectedImage === img ? 'border-[#00FF66] scale-105' : 'border-transparent opacity-60'
                }`}
              >
                <img src={img} alt="Preset" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

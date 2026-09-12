import React, { useEffect, useRef, useState } from 'react';
import { X, Zap, Upload, Check, Loader2, Sparkles } from 'lucide-react';
import { User } from '../../types';
import { fetchLiveAvatarPresets, applyLiveAvatar, uploadMediaFile, LiveAvatarPreset } from '../../services/api';

interface LiveProfilePictureModalProps {
  currentUser: User;
  onClose: () => void;
  onUserUpdated?: (user: User) => void;
  onUpgradeClick: () => void;
}

export const LiveProfilePictureModal: React.FC<LiveProfilePictureModalProps> = ({
  currentUser,
  onClose,
  onUserUpdated,
  onUpgradeClick
}) => {
  const isPro = !!currentUser.proTier;
  const [presets, setPresets] = useState<LiveAvatarPreset[]>([]);
  const [loadingPresets, setLoadingPresets] = useState(isPro);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isPro) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchLiveAvatarPresets();
        if (!cancelled) setPresets(res.presets || []);
      } catch (err) {
        if (!cancelled) setError('Could not load presets. Please try again.');
      } finally {
        if (!cancelled) setLoadingPresets(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyPreset = async (preset: LiveAvatarPreset) => {
    setError('');
    setSuccessMsg('');
    try {
      setApplyingId(preset.id);
      const res = await applyLiveAvatar({ presetId: preset.id });
      if (res.success && res.user) {
        onUserUpdated?.(res.user);
        setSuccessMsg(`${preset.name} applied as your live profile picture!`);
      } else {
        setError(res.error || 'Failed to apply this preset.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to apply this preset.');
    } finally {
      setApplyingId(null);
    }
  };

  const handleCustomUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setError('');
    setSuccessMsg('');

    try {
      setIsUploading(true);
      // Routes through the same invisible client-side compression every
      // other upload uses — it already leaves GIF/WebP untouched (a static
      // re-encode would flatten the animation), so this is safe for an
      // animated live avatar while still compressing a plain photo someone
      // uploads by mistake.
      const uploadData = await uploadMediaFile(file, 'avatars');
      if (!uploadData.success || !uploadData.url) {
        setError('Upload failed. Please try again.');
        return;
      }

      const res = await applyLiveAvatar({ customUrl: uploadData.url });
      if (res.success && res.user) {
        onUserUpdated?.(res.user);
        setSuccessMsg('Your custom live profile picture is live!');
      } else {
        setError(res.error || 'Failed to apply your upload.');
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-950 border border-cyan-500/30 rounded-3xl shadow-2xl max-h-[88vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
              <Zap className="w-4.5 h-4.5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Live Profile Picture</h3>
              <p className="text-[11px] text-zinc-400">Animated avatars — NOOB Pro exclusive</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isPro ? (
          <div className="p-6 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/40 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-cyan-400" />
            </div>
            <div>
              <h4 className="text-base font-bold text-white">Unlock Live Profile Pictures</h4>
              <p className="text-xs text-zinc-400 mt-1.5 max-w-xs">
                NOOB Pro members can apply an animated profile picture from our curated presets, or upload their own
                custom animated image — free accounts get a standard static photo.
              </p>
            </div>
            <button
              onClick={() => {
                onClose();
                onUpgradeClick();
              }}
              className="px-6 py-2.5 bg-gradient-to-r from-cyan-400 to-emerald-400 text-black font-bold text-sm rounded-2xl hover:scale-105 transition-transform cursor-pointer"
            >
              Upgrade to NOOB Pro
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4 overflow-y-auto">
            {error && (
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400">{error}</div>
            )}
            {successMsg && (
              <div className="p-2.5 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/30 text-xs text-[#00FF66]">
                {successMsg}
              </div>
            )}

            <div className="space-y-2">
              <span className="text-xs font-bold text-zinc-300 block">Choose a Preset</span>
              {loadingPresets ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {presets.map((preset) => {
                    const isActive = currentUser.avatar === preset.url;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => handleApplyPreset(preset)}
                        disabled={applyingId === preset.id}
                        className={`relative p-3 rounded-2xl border flex flex-col items-center gap-2 transition-all cursor-pointer disabled:opacity-60 ${
                          isActive ? 'border-cyan-400 bg-cyan-500/10' : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
                        }`}
                      >
                        <img src={preset.url} alt={preset.name} className="w-20 h-20 rounded-full object-cover" />
                        <span className="text-xs font-bold text-white">{preset.name}</span>
                        {isActive && (
                          <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-cyan-400 text-black flex items-center justify-center">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </span>
                        )}
                        {applyingId === preset.id && (
                          <span className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2 pt-1">
              <span className="text-xs font-bold text-zinc-300 block">Or Create Your Own</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/gif,image/webp,image/*"
                onChange={handleCustomUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 border border-dashed border-zinc-700 hover:border-cyan-500/50 text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 text-cyan-400" /> Upload Custom Animated Image
                  </>
                )}
              </button>
              <p className="text-[10px] text-zinc-500">Animated GIF or WebP works best — it'll play automatically everywhere your profile picture shows.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Zap, Upload, Check, Loader2, Sparkles } from 'lucide-react';
import './liveProfilePicture.css';
import { User } from '../../types';
import { fetchLiveAvatarPresets, applyLiveAvatar, uploadMediaFile, LiveAvatarPreset } from '../../services/api';
import { AvatarAdjustEditor } from '../Common/AvatarAdjustEditor';

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
  const [pickedFile, setPickedFile] = useState<File | null>(null);
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

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setSuccessMsg('');
    setPickedFile(file);
  };

  const handleAdjustDone = async ({ blob, posterBlob }: { blob: Blob; posterBlob?: Blob }) => {
    setPickedFile(null);
    setIsUploading(true);
    try {
      const stamp = Date.now();
      const videoFile = new File([blob], `live-${stamp}.webm`, { type: blob.type || 'video/webm' });
      const uploadedVideo = await uploadMediaFile(videoFile, 'avatars');
      if (!uploadedVideo.success || !uploadedVideo.url) { setError('Upload failed. Please try again.'); return; }

      let posterUrl = uploadedVideo.url;
      if (posterBlob) {
        const posterFile = new File([posterBlob], `live-${stamp}.jpg`, { type: 'image/jpeg' });
        const uploadedPoster = await uploadMediaFile(posterFile, 'avatars');
        if (uploadedPoster.success && uploadedPoster.url) posterUrl = uploadedPoster.url;
      }

      const res = await applyLiveAvatar({ customUrl: posterUrl, customVideoUrl: uploadedVideo.url });
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
    <>
      {pickedFile && (
        <AvatarAdjustEditor
          file={pickedFile}
          mediaType="video"
          onCancel={() => setPickedFile(null)}
          onDone={handleAdjustDone}
        />
      )}
      <div className="lpp-page fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Live Profile Picture">
        <div className="lpp-top">
          <button type="button" onClick={onClose} className="lpp-back" aria-label="Back"><ArrowLeft size={20} /></button>
          <h3>Live Profile Picture</h3>
        </div>

        {!isPro ? (
          <div className="lpp-lock">
            <div className="lpp-ring" style={{ width: 96, height: 96 }}><Sparkles size={38} /></div>
            <h4>Unlock live pictures</h4>
            <p>NOOB Pro members can use an animated profile picture from our presets, or upload their own short video. Free accounts get a standard photo.</p>
            <button type="button" className="lpp-btn" onClick={onUpgradeClick}>Upgrade to NOOB Pro</button>
          </div>
        ) : (
          <>
            <div className="lpp-scroll">
              <div className="lpp-hero">
                <div className="lpp-ring"><img src={currentUser.avatar} alt="Your profile picture" /></div>
                <span className="lpp-chip"><Zap size={12} /> NOOB Pro</span>
                <p>This is how you show up now. Pick a motion below and it changes straight away.</p>
              </div>

              {error && <div className="lpp-msg" data-kind="err">{error}</div>}
              {successMsg && <div className="lpp-msg">{successMsg}</div>}

              <div>
                <p className="lpp-label">Pick a motion</p>
                {loadingPresets ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '28px 0' }}><Loader2 className="animate-spin" size={22} /></div>
                ) : (
                  <div className="lpp-grid">
                    {presets.map((preset) => {
                      const isActive = currentUser.avatar === preset.url;
                      return (
                        <button key={preset.id} type="button" className="lpp-item" data-on={isActive ? '1' : undefined} onClick={() => handleApplyPreset(preset)} disabled={applyingId === preset.id}>
                          <span className="lpp-pic">
                            <img src={preset.url} alt={preset.name} />
                            {isActive && <span className="lpp-tick"><Check size={14} strokeWidth={3} /></span>}
                            {applyingId === preset.id && <span className="lpp-busy"><Loader2 className="animate-spin" size={20} /></span>}
                          </span>
                          <span className="lpp-name">{preset.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="lpp-bar">
              <input ref={fileInputRef} type="file" accept="video/*" onChange={handlePickFile} className="hidden" />
              <button type="button" className="lpp-btn" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                {isUploading ? (<><Loader2 className="animate-spin" size={18} /> Uploading...</>) : (<><Upload size={18} /> Upload your own video</>)}
              </button>
              <p className="lpp-note">A real short video, not a picture. You will adjust the framing next. It plays on loop, muted, wherever your picture shows.</p>
            </div>
          </>
        )}
      </div>
    </>
  );
};

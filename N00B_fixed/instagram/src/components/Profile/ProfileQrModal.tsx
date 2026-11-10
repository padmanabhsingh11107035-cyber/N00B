import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { siteOrigin } from '../../utils/siteUrl';
import { ArrowLeft, MessageCircle, Copy, Check, Share2, ScanLine } from 'lucide-react';
import { User } from '../../types';
import './profileQr.css';

interface ProfileQrModalProps {
  targetUser: User;
  onSendInChat: () => void;
  onClose: () => void;
}

// Scanning this with ANY phone's camera or QR app opens this exact profile — even for someone who
// doesn't have NOOB yet: the URL App.tsx already reads (?profile=username, see handleShareProfile)
// works for a logged-out visitor too, once they sign up it lands them straight on this profile.
// The page is a full-screen "pass": a bright colour-flowing background, a white ticket with the code (the NOOB logo in its middle, a light that sweeps over it), the person's picture and name on top.
export const ProfileQrModal: React.FC<ProfileQrModalProps> = ({ targetUser, onSendInChat, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const shareUrl = `${siteOrigin()}/?profile=${encodeURIComponent(targetUser.username)}`;

  useEffect(() => {
    let alive = true;
    // "H": a high error-correction level, so the logo in the middle never stops a camera from reading it
    QRCode.toDataURL(shareUrl, { width: 560, margin: 1, errorCorrectionLevel: 'H', color: { dark: '#14101fff', light: '#ffffffff' } })
      .then((url) => { if (alive) setQrDataUrl(url); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [shareUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — nothing more to do here
    }
  };

  const handleShare = async () => {
    try {
      if (navigator.share) { await navigator.share({ title: `@${targetUser.username} on NOOB`, url: shareUrl }); return; }
    } catch { return; }
    void handleCopyLink();
  };

  return (
    <div className="fixed inset-0 z-[95] qr-root" role="dialog" aria-modal="true" aria-label="My QR code" data-testid="qr-page">
      <div className="qr-blob b1" /><div className="qr-blob b2" /><div className="qr-blob b3" />
      <i className="qr-spark s1" /><i className="qr-spark s2" /><i className="qr-spark s3" /><i className="qr-spark s4" /><i className="qr-spark s5" />

      <header className="qr-top">
        <button type="button" onClick={onClose} aria-label="Back" className="qr-back"><ArrowLeft size={22} /></button>
        <span className="qr-title"><ScanLine size={18} /> My QR Code</span>
        <span style={{ width: 44 }} />
      </header>

      <div className="qr-body">
        <div className="qr-card">
          <div className="qr-avatar-wrap">
            <img src={targetUser.avatar || '/noob-logo-circle.png'} alt="" className="qr-avatar" referrerPolicy="no-referrer" />
          </div>
          <p className="qr-name" translate="no">{targetUser.displayName || targetUser.username}</p>
          <p className="qr-handle" translate="no">@{targetUser.username}</p>

          <div className="qr-code-box">
            <span className="qr-corner tl" /><span className="qr-corner tr" /><span className="qr-corner bl" /><span className="qr-corner br" />
            {qrDataUrl ? (
              <>
                <img src={qrDataUrl} alt={`QR code for @${targetUser.username}`} className="qr-code" />
                <span className="qr-logo"><img src="/noob-logo-circle.png" alt="" /></span>
                <span className="qr-scan" />
              </>
            ) : (
              <div className="qr-skeleton" />
            )}
          </div>
          <p className="qr-hint">Point any camera at this code to open my profile on NOOB</p>
        </div>

        <div className="qr-actions">
          <button type="button" onClick={onSendInChat} className="qr-btn light"><MessageCircle size={20} /> Send in Chat</button>
          <button type="button" onClick={handleCopyLink} className="qr-btn glass">{copied ? <Check size={20} /> : <Copy size={20} />}{copied ? 'Copied' : 'Copy link'}</button>
          <button type="button" onClick={handleShare} className="qr-btn glass" aria-label="Share"><Share2 size={20} /> Share</button>
        </div>
      </div>
    </div>
  );
};

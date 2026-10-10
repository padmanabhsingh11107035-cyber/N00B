import React, { useEffect, useRef, useState } from 'react';
import { User as UserIcon, FileText, Phone, CalendarDays, Camera, Check, Loader2, AlertCircle, CheckCircle2, LogOut, ShieldCheck } from 'lucide-react';
import { User } from '../../types';
import {
  checkPendingOAuthSignup,
  completeOAuthSignup,
  requestSignupOtp,
  verifyUsernameExists,
  uploadMediaFile,
  recordSignupDevice,
  logoutUser,
  type OAuthSignupPayload
} from '../../services/api';
import { COUNTRY_OPTIONS, GENDER_OPTIONS } from './AuthView';
import { BirthdayWheelPicker } from './BirthdayWheelPicker';
import { AvatarAdjustEditor, AvatarAdjustResult } from '../Common/AvatarAdjustEditor';
import { useLanguage } from '../../i18n/useLanguage.ts';
import confetti from 'canvas-confetti';

interface CompleteOAuthProfileProps {
  pending: NonNullable<Awaited<ReturnType<typeof checkPendingOAuthSignup>>>;
  onDone: (user: User) => void;
}

// What finishes "Sign in with Google" (or any other OAuth provider later): the account already
// exists and is already logged in — Google's own redirect made that happen — it just has nothing in
// public.profiles yet. This asks for only what Google never hands over, proves the email the exact
// same way every other NOOB signup does (a 6-digit code), and submits once, straight into the app —
// no separate "creating your account…" wait, since the session this whole screen runs on is already
// signed in.
export const CompleteOAuthProfile: React.FC<CompleteOAuthProfileProps> = ({ pending, onDone }) => {
  const language = useLanguage();
  const nameGuess = (pending.fullName || '').trim();
  // Some providers (X, unless the person allows it) do not hand over an email address: then it is asked for here, and proved with the same 6-digit code.
  const [typedEmail, setTypedEmail] = useState('');
  const needsEmail = !pending.email;
  const email = (pending.email || typedEmail).trim().toLowerCase();
  const [username, setUsername] = useState(() => nameGuess.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || '');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'taken' | 'free'>('idle');
  const [bio, setBio] = useState('');
  const [countryCode, setCountryCode] = useState('🇮🇳 India (+91)');
  const [mobileNumber, setMobileNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [gender, setGender] = useState('Prefer not to say');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarObjectKey, setAvatarObjectKey] = useState('');
  const [avatarPrefilling, setAvatarPrefilling] = useState(!!pending.pictureUrl);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [pickedAvatarFile, setPickedAvatarFile] = useState<File | null>(null);

  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSuccess, setOtpSuccess] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpResending, setOtpResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [suspendedNotice, setSuspendedNotice] = useState<string | null>(null);

  // Best-effort: try to carry over the Google account photo so the person isn't forced to pick a new
  // one — a plain, no-credentials fetch of a public profile photo URL, same as any <img> would load;
  // if it fails for any reason (an expired link, a network hiccup), they just pick their own below,
  // same as anyone else — the field stays required either way.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pending.pictureUrl) return;
      try {
        const res = await fetch(pending.pictureUrl);
        if (!res.ok) throw new Error('fetch failed');
        const blob = await res.blob();
        const file = new File([blob], 'google-avatar.jpg', { type: blob.type || 'image/jpeg' });
        const result = await uploadMediaFile(file, 'avatars');
        if (cancelled) return;
        if (result.url) setAvatarUrl(result.url);
        setAvatarObjectKey(result.objectKey || '');
      } catch {
        // no usable photo to carry over — the person just picks one, same as everybody else
      } finally {
        if (!cancelled) setAvatarPrefilling(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pending.pictureUrl]);

  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleUsernameChange = (raw: string) => {
    const clean = raw.toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 24);
    setUsername(clean);
    setUsernameStatus('idle');
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    if (clean.length < 3) return;
    usernameTimer.current = setTimeout(async () => {
      setUsernameStatus('checking');
      const res = await verifyUsernameExists(clean);
      setUsernameStatus(res.exists ? 'taken' : 'free');
    }, 450);
  };

  const handleAvatarFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('Uploaded image must be under 5MB.');
      return;
    }
    setErrorMessage(null);
    setPickedAvatarFile(file);
  };

  const handleAvatarAdjustDone = async ({ blob }: AvatarAdjustResult) => {
    setPickedAvatarFile(null);
    const file = new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' });
    try {
      setIsUploadingAvatar(true);
      const result = await uploadMediaFile(file, 'avatars');
      if (result.url) setAvatarUrl(result.url);
      setAvatarObjectKey(result.objectKey || '');
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const buildPayload = (): OAuthSignupPayload => {
    const [firstName, ...rest] = nameGuess.split(/\s+/).filter(Boolean);
    return {
      firstName: firstName || username,
      lastName: rest.join(' ') || undefined,
      displayName: nameGuess || username,
      username,
      email,
      countryCode,
      mobileNumber: mobileNumber.trim(),
      dateOfBirth,
      gender,
      avatar: (avatarObjectKey || avatarUrl).trim(),
      bio: bio.trim(),
      accountType: 'public',
      agreedToTerms: true,
      language
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (isUploadingAvatar || avatarPrefilling) { setErrorMessage('Please wait for the avatar upload to finish.'); return; }
    const cleanUsername = username.trim();
    if (cleanUsername.length < 3) { setErrorMessage('User ID must be at least 3 alphanumeric characters.'); return; }
    if (usernameStatus === 'taken') { setErrorMessage('That User ID is already taken. Please choose another.'); return; }
    if (!bio.trim()) { setErrorMessage('Please enter your bio. Bio is compulsory for all NOOB accounts.'); return; }
    if (!mobileNumber.trim()) { setErrorMessage('Please enter your mobile number.'); return; }
    if (!dateOfBirth) { setErrorMessage('Please enter your date of birth.'); return; }
    if (!(avatarObjectKey || avatarUrl)) { setErrorMessage('Please upload a profile photo. It is required to create a NOOB account.'); return; }
    if (!agreedToTerms) { setErrorMessage("Please check the box to agree to NOOB's general terms and privacy policy."); return; }
    if (needsEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) { setErrorMessage('Please enter a valid email address.'); return; }

    setLoading(true);
    const res = await requestSignupOtp(email);
    setLoading(false);
    if (!res.success) { setErrorMessage(res.error || 'Could not send a verification code. Please try again.'); return; }
    setOtpCode('');
    setOtpError(null);
    setOtpSuccess(false);
    setStep('otp');
  };

  const handleVerifyOtp = async () => {
    if (!otpCode.trim()) { setOtpError('Please enter the code from your email.'); return; }
    setOtpLoading(true);
    setOtpError(null);
    const res = await completeOAuthSignup(otpCode.trim(), buildPayload());
    setOtpLoading(false);
    if (res.success && res.user) {
      setOtpSuccess(true);
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
      void recordSignupDevice();
      onDone(res.user);
    } else if (res.suspended) {
      setStep('form');
      setSuspendedNotice(res.message || 'This account is suspended.');
    } else if (res.stage !== 'form') {
      setOtpError(res.error || 'That code is not right. Please check your email and try again.');
    } else {
      setStep('form');
      setErrorMessage(res.error || 'Could not create the account.');
    }
  };

  const handleResendOtp = async () => {
    setOtpResending(true);
    setOtpError(null);
    const res = await requestSignupOtp(email);
    setOtpResending(false);
    if (!res.success) setOtpError(res.error || 'Could not send a new code. Please try again.');
  };

  const handleCancel = async () => {
    setSigningOut(true);
    await logoutUser().catch(() => undefined);
    window.location.reload();
  };

  const avatarPreview = avatarUrl;

  return (
    <div className="min-h-screen bg-page flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-5">
          <h1 className="text-xl font-black text-white">Just a few more details</h1>
          <p className="text-xs text-zinc-400 mt-1">
            {pending.email ? (<>Signed in as <span className="text-white font-semibold" translate="no">{pending.email}</span>. </>) : null}NOOB needs a bit more to finish setting up your account.
          </p>
        </div>

        {suspendedNotice && (
          <div className="mb-4 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs leading-relaxed">
            {suspendedNotice}
          </div>
        )}
        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
          </div>
        )}

        <div className="bg-zinc-950/95 backdrop-blur-2xl border border-white/10 rounded-[32px] p-5 sm:p-8 shadow-2xl shadow-black">
          {step === 'otp' ? (
            <div className="space-y-3.5">
              {otpSuccess ? (
                <div className="py-8 text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-noob mx-auto" />
                  <p className="text-sm font-bold text-white">Email verified!</p>
                  <p className="text-xs text-zinc-400">Finishing your account…</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    We emailed a 6-digit code to <span className="text-white font-semibold" translate="no">{email}</span>. Enter it below to finish creating your account.
                  </p>
                  {otpError && (
                    <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400">{otpError}</div>
                  )}
                  <form onSubmit={(e) => { e.preventDefault(); void handleVerifyOtp(); }} className="space-y-3.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      autoFocus
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-full bg-black/40 text-white text-center text-2xl font-bold tracking-[0.5em] px-3.5 py-3 rounded-2xl border border-white/10 focus:border-noob focus:ring-1 focus:ring-noob outline-none transition-all placeholder:text-zinc-700"
                    />
                    <button
                      type="submit"
                      disabled={otpLoading}
                      className="w-full py-3 bg-gradient-to-r from-noob to-noob-strong text-black font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {otpLoading ? 'Verifying…' : 'Verify & Finish'}
                    </button>
                    <button
                      type="button"
                      disabled={otpResending}
                      onClick={() => void handleResendOtp()}
                      className="w-full py-2 text-xs font-bold text-noob hover:opacity-80 disabled:text-zinc-600 cursor-pointer"
                    >
                      {otpResending ? 'Sending…' : 'Resend code'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setStep('form'); setOtpError(null); }}
                      className="w-full text-xs font-bold text-zinc-400 hover:text-white cursor-pointer"
                    >
                      ← Back to the form
                    </button>
                  </form>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-2">
                <label className="relative cursor-pointer group">
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarFilePick} />
                  <div className="w-20 h-20 rounded-full bg-zinc-900 border-2 border-white/10 overflow-hidden flex items-center justify-center">
                    {avatarPrefilling || isUploadingAvatar ? (
                      <Loader2 className="w-6 h-6 text-noob animate-spin" />
                    ) : avatarPreview ? (
                      <img src={avatarPreview} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Camera className="w-6 h-6 text-zinc-500" />
                    )}
                  </div>
                  <div className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-noob flex items-center justify-center">
                    <Camera className="w-3.5 h-3.5 text-black" />
                  </div>
                </label>
                <span className="text-[11px] text-zinc-500">Profile photo (required)</span>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1.5 flex items-center gap-1.5"><UserIcon className="w-3.5 h-3.5" /> User ID</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  placeholder="username"
                  className="w-full bg-black/40 text-white px-3.5 py-2.5 rounded-2xl border border-white/10 focus:border-noob outline-none text-sm"
                />
                {usernameStatus === 'checking' && <p className="text-[11px] text-zinc-500 mt-1">Checking availability…</p>}
                {usernameStatus === 'taken' && <p className="text-[11px] text-red-400 mt-1">That User ID is already taken.</p>}
                {usernameStatus === 'free' && <p className="text-[11px] text-noob mt-1 flex items-center gap-1"><Check className="w-3 h-3" /> Available</p>}
              </div>

              {needsEmail && (
                <div>
                  <label className="text-xs font-bold text-zinc-300 block mb-1.5">Email address</label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={typedEmail}
                    onChange={(e) => setTypedEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-black/40 text-white px-3.5 py-2.5 rounded-2xl border border-white/10 focus:border-noob outline-none text-sm"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1">We will email you a 6-digit code to confirm it.</p>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1.5 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Bio</label>
                <textarea
                  required
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, 150))}
                  placeholder="Tell people a little about yourself"
                  rows={2}
                  className="w-full bg-black/40 text-white px-3.5 py-2.5 rounded-2xl border border-white/10 focus:border-noob outline-none text-sm resize-none"
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="bg-black/40 text-white px-2 py-2.5 rounded-2xl border border-white/10 focus:border-noob outline-none text-sm max-w-[120px]"
                >
                  {COUNTRY_OPTIONS.map((c) => <option key={c.fullLabel} value={c.fullLabel}>{c.flag} {c.code}</option>)}
                </select>
                <div className="flex-1">
                  <label className="text-xs font-bold text-zinc-300 block mb-1.5 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Mobile number</label>
                  <input
                    type="tel"
                    required
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 15))}
                    placeholder="Mobile number"
                    className="w-full bg-black/40 text-white px-3.5 py-2.5 rounded-2xl border border-white/10 focus:border-noob outline-none text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1.5 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> Date of birth</label>
                <button
                  type="button"
                  onClick={() => setShowBirthdayPicker(true)}
                  className="w-full text-left bg-black/40 text-white px-3.5 py-2.5 rounded-2xl border border-white/10 focus:border-noob outline-none text-sm"
                >
                  {dateOfBirth || <span className="text-zinc-500">Select your date of birth</span>}
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1.5">Gender</label>
                <div className="flex flex-wrap gap-1.5">
                  {GENDER_OPTIONS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGender(g.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${gender === g.id ? 'bg-noob text-black border-noob' : 'bg-black/40 text-zinc-300 border-white/10 hover:border-white/30'}`}
                    >
                      {g.emoji} {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} className="mt-0.5 w-4 h-4 accent-noob" />
                <span className="text-xs text-zinc-400 leading-relaxed">I agree to NOOB's general terms and privacy policy.</span>
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-noob to-noob-strong text-black font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {loading ? 'Sending code…' : 'Continue'}
              </button>

              <button
                type="button"
                disabled={signingOut}
                onClick={() => void handleCancel()}
                className="w-full py-2 text-xs font-bold text-zinc-400 hover:text-white cursor-pointer flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" /> {signingOut ? 'Signing out…' : 'Not you? Sign out'}
              </button>
            </form>
          )}
        </div>
      </div>

      {showBirthdayPicker && (
        <BirthdayWheelPicker
          value={dateOfBirth}
          maxDate={new Date(Date.now() - 13 * 365.25 * 24 * 60 * 60 * 1000)}
          minDate={new Date(Date.now() - 82 * 365.25 * 24 * 60 * 60 * 1000)}
          onClose={() => setShowBirthdayPicker(false)}
          onConfirm={(iso) => { setDateOfBirth(iso); setShowBirthdayPicker(false); }}
        />
      )}

      {pickedAvatarFile && (
        <AvatarAdjustEditor
          file={pickedAvatarFile}
          mediaType="image"
          onCancel={() => setPickedAvatarFile(null)}
          onDone={handleAvatarAdjustDone}
        />
      )}
    </div>
  );
};

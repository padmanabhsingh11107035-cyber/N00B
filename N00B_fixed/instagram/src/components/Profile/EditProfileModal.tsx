import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  User,
  Globe,
  MapPin,
  Phone,
  Briefcase,
  Lock,
  Sparkles,
  Check,
  Tag,
  Link,
  Instagram,
  Twitter,
  Youtube,
  Github
} from 'lucide-react';
import { User as UserType, AccountType } from '../../types';
import { updateFullProfile, uploadMediaFile } from '../../services/api';
import { COUNTRY_OPTIONS, GENDER_OPTIONS } from '../Auth/AuthView';
import confetti from 'canvas-confetti';

interface EditProfileModalProps {
  currentUser: UserType;
  onClose: () => void;
  onProfileUpdated: (updatedUser: UserType) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  currentUser,
  onClose,
  onProfileUpdated
}) => {
  // Form State
  const [displayName, setDisplayName] = useState(currentUser.displayName || '');
  const [firstName, setFirstName] = useState(currentUser.firstName || '');
  const [lastName, setLastName] = useState(currentUser.lastName || '');
  const [username, setUsername] = useState(currentUser.username || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [avatar, setAvatar] = useState(currentUser.avatar || '');
  const [website, setWebsite] = useState(currentUser.website || '');
  const [city, setCity] = useState(currentUser.city || '');
  const [countryCode, setCountryCode] = useState(currentUser.countryCode || '🇮🇳 India (+91)');
  const [mobileNumber, setMobileNumber] = useState(currentUser.mobileNumber || '');
  const [gender, setGender] = useState(currentUser.gender || 'Prefer not to say');
  const [pronouns, setPronouns] = useState(currentUser.pronouns || '');
  const [accountType, setAccountType] = useState<AccountType>(currentUser.accountType || 'public');
  const [businessCategory, setBusinessCategory] = useState(currentUser.businessCategory || 'Digital Creator');
  
  // Social Links
  const [socialTwitter, setSocialTwitter] = useState(currentUser.socialLinks?.twitter || '');
  const [socialInstagram, setSocialInstagram] = useState(currentUser.socialLinks?.instagram || '');
  const [socialDiscord, setSocialDiscord] = useState(currentUser.socialLinks?.discord || '');
  const [socialYoutube, setSocialYoutube] = useState(currentUser.socialLinks?.youtube || '');
  const [socialGithub, setSocialGithub] = useState(currentUser.socialLinks?.github || '');

  // Interests
  const [interests, setInterests] = useState<string[]>(
    currentUser.interests || ['Gaming', 'Music', 'Memes', 'Tech']
  );
  const [customInterestInput, setCustomInterestInput] = useState('');

  // UI state
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Handle Avatar file selection
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingAvatar(true);
      setErrorMessage('');

      // Upload directly
      const res = await uploadMediaFile(file, 'avatars');
      if (res.url) {
        setAvatar(res.url);
      }
    } catch (err: any) {
      console.error('Avatar upload failed:', err);
      // Fallback local reader
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) setAvatar(evt.target.result as string);
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAddInterest = () => {
    if (!customInterestInput.trim()) return;
    const tag = customInterestInput.trim().replace(/^#/, '');
    if (!interests.includes(tag)) {
      setInterests([...interests, tag]);
    }
    setCustomInterestInput('');
  };

  const handleRemoveInterest = (tag: string) => {
    setInterests(interests.filter((t) => t !== tag));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bio.trim()) {
      setErrorMessage('Bio is compulsory. Please write a short bio about yourself.');
      return;
    }
    if (!username.trim()) {
      setErrorMessage('Username / User ID cannot be empty.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage('');

      const updatedPayload: Partial<UserType> = {
        displayName: displayName.trim() || `${firstName} ${lastName}`.trim() || username,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: username.toLowerCase().trim().replace(/[^a-z0-9_.]/g, ''),
        bio: bio.trim(),
        avatar: avatar.trim(),
        website: website.trim(),
        city: city.trim(),
        countryCode,
        mobileNumber: mobileNumber.trim(),
        gender,
        pronouns: pronouns.trim(),
        accountType,
        isBusiness: accountType === 'business',
        businessCategory: accountType === 'business' ? businessCategory : undefined,
        interests,
        socialLinks: {
          twitter: socialTwitter.trim(),
          instagram: socialInstagram.trim(),
          discord: socialDiscord.trim(),
          youtube: socialYoutube.trim(),
          github: socialGithub.trim()
        }
      };

      const res = await updateFullProfile(updatedPayload);
      if (res.success && res.user) {
        setSuccessMessage('Profile updated successfully!');
        confetti({ particleCount: 30, spread: 60, origin: { y: 0.6 } });
        onProfileUpdated(res.user);
        setTimeout(() => {
          onClose();
        }, 600);
      } else {
        setErrorMessage(res.message || 'Failed to update profile.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err?.message || 'Error updating profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#00FF66] to-cyan-400 flex items-center justify-center text-black font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-white">Edit Your Profile</h2>
              <p className="text-[11px] text-zinc-400">Update your avatar, bio, gender, and account details</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {errorMessage && (
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-xs font-semibold text-red-400">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-[#00FF66]">
              {successMessage}
            </div>
          )}

          {/* 1. Avatar & Profile Picture Upload */}
          <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="relative group">
              <img
                src={avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                alt="Avatar"
                className="w-20 h-20 rounded-full object-cover ring-2 ring-cyan-400 bg-black"
                referrerPolicy="no-referrer"
              />
              {isUploadingAvatar && (
                <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            <div className="flex-1 text-center sm:text-left space-y-2">
              <span className="text-xs font-bold text-white block">Profile Picture</span>
              <p className="text-[11px] text-zinc-400">Upload high-res JPG, PNG, or WebP</p>
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white flex items-center gap-1.5 transition-colors cursor-pointer border border-zinc-700"
                >
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isUploadingAvatar ? 'Uploading...' : 'Upload Image'}</span>
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => setAvatar(`https://api.dicebear.com/7.x/adventurer/svg?seed=${username || 'cool'}&backgroundColor=b6e3f4,c0aede,d1d4f9`)}
                  className="px-3 py-1.5 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/80 text-xs font-semibold text-zinc-300 transition-colors cursor-pointer"
                >
                  Generate 2D Avatar
                </button>
              </div>
            </div>
          </div>

          {/* 2. Basic Identity Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Alex"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g. Mercer"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Public display name"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">Username (@handle)</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="unique_username"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>
          </div>

          {/* Gender Selector */}
          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1.5">Gender</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {GENDER_OPTIONS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGender(g.id)}
                  className={`p-2 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                    gender === g.id
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-sm'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  <span className="text-sm">{g.emoji}</span>
                  <span className="text-[10px] truncate w-full text-center">{g.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Country (Flag + Name + Code) & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">Country</label>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 cursor-pointer"
              >
                {COUNTRY_OPTIONS.map((c, i) => (
                  <option key={i} value={c.fullLabel}>
                    {c.fullLabel}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">Mobile Number</label>
              <input
                type="tel"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                placeholder="e.g. 9876543210"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* 3. Bio (Compulsory with 250 char counter) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-zinc-300">
                Bio <span className="text-cyan-400 font-normal">* Compulsory</span>
              </label>
              <span className={`text-[10px] ${bio.length > 250 ? 'text-red-400 font-bold' : 'text-zinc-500'}`}>
                {bio.length}/250
              </span>
            </div>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Write a creative bio, emojis, hobbies, and what you love doing..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-cyan-400 leading-relaxed resize-none"
            />
          </div>

          {/* 4. Location, Website & Pronouns */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1 flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-zinc-400" /> Website / Link
              </label>
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://mysite.com"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-zinc-400" /> City / Location
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Mumbai, Tokyo, NYC"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-300 block mb-1">Pronouns</label>
              <input
                type="text"
                value={pronouns}
                onChange={(e) => setPronouns(e.target.value)}
                placeholder="e.g. they/them, she/her"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          {/* 5. Account Type & Visibility */}
          <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-3">
            <span className="text-xs font-bold text-white block">Account Visibility &amp; Type</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setAccountType('public')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  accountType === 'public'
                    ? 'bg-indigo-500/10 border-indigo-500 text-white shadow-sm'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Globe className="w-3.5 h-3.5 text-indigo-400" /> Public
                </div>
                <span className="text-[10px] text-zinc-400 mt-1 block">Anyone can view your posts and follow</span>
              </button>

              <button
                type="button"
                onClick={() => setAccountType('private')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  accountType === 'private'
                    ? 'bg-purple-500/10 border-purple-500 text-white shadow-sm'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Lock className="w-3.5 h-3.5 text-purple-400" /> Private
                </div>
                <span className="text-[10px] text-zinc-400 mt-1 block">Only approved followers can view content</span>
              </button>

              <button
                type="button"
                onClick={() => setAccountType('business')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  accountType === 'business'
                    ? 'bg-emerald-500/10 border-[#00FF66] text-white shadow-sm'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Briefcase className="w-3.5 h-3.5 text-[#00FF66]" /> Business / Creator
                </div>
                <span className="text-[10px] text-zinc-400 mt-1 block">Access account analytics &amp; insights</span>
              </button>
            </div>

            {accountType === 'business' && (
              <div className="pt-2">
                <label className="text-xs font-bold text-zinc-300 block mb-1">Business / Creator Category</label>
                <select
                  value={businessCategory}
                  onChange={(e) => setBusinessCategory(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#00FF66]"
                >
                  <option value="Digital Creator">Digital Creator</option>
                  <option value="Gamer & Streamer">Gamer & Streamer</option>
                  <option value="Musician & Producer">Musician & Producer</option>
                  <option value="Artist & Designer">Artist & Designer</option>
                  <option value="Software Developer">Software Developer</option>
                  <option value="Brand & Business">Brand & Business</option>
                </select>
              </div>
            )}
          </div>

          {/* 6. Interests & Tags */}
          <div>
            <label className="text-xs font-bold text-zinc-300 block mb-1">Interests &amp; Hobbies</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {interests.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-xs font-semibold text-cyan-300 flex items-center gap-1.5"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveInterest(tag)}
                    className="hover:text-white cursor-pointer"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add an interest (e.g. Cyberpunk, Anime, EDM)..."
                value={customInterestInput}
                onChange={(e) => setCustomInterestInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddInterest();
                  }
                }}
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={handleAddInterest}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-white transition-colors cursor-pointer"
              >
                Add Tag
              </button>
            </div>
          </div>

          {/* 7. Social Links */}
          <div className="space-y-2.5">
            <span className="text-xs font-bold text-zinc-300 block">Connected Social Profiles</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5">
                <Twitter className="w-4 h-4 text-sky-400 shrink-0" />
                <input
                  type="text"
                  placeholder="X / Twitter handle"
                  value={socialTwitter}
                  onChange={(e) => setSocialTwitter(e.target.value)}
                  className="w-full bg-transparent text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5">
                <Instagram className="w-4 h-4 text-pink-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Instagram handle"
                  value={socialInstagram}
                  onChange={(e) => setSocialInstagram(e.target.value)}
                  className="w-full bg-transparent text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5">
                <Youtube className="w-4 h-4 text-red-500 shrink-0" />
                <input
                  type="text"
                  placeholder="YouTube channel"
                  value={socialYoutube}
                  onChange={(e) => setSocialYoutube(e.target.value)}
                  className="w-full bg-transparent text-xs text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5">
                <Github className="w-4 h-4 text-zinc-300 shrink-0" />
                <input
                  type="text"
                  placeholder="GitHub username"
                  value={socialGithub}
                  onChange={(e) => setSocialGithub(e.target.value)}
                  className="w-full bg-transparent text-xs text-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Footer Save Actions */}
          <div className="pt-4 border-t border-zinc-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-xs font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-400 hover:opacity-95 text-white font-extrabold text-xs shadow-lg shadow-indigo-500/25 transition-all cursor-pointer flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Save All Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

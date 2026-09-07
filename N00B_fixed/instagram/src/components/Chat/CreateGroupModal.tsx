import React, { useState, useRef } from 'react';
import { X, Users, Check, Sparkles, Upload, Image, Shield, Search, UserCheck } from 'lucide-react';
import { User, ChatConversation } from '../../types';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import { createGroupChat } from '../../services/api';

interface CreateGroupModalProps {
  isOpen: boolean;
  currentUser: User;
  availableUsers: User[];
  onClose: () => void;
  onGroupCreated: (newChat: ChatConversation) => void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=400&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400&auto=format&fit=crop&q=80'
];

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  currentUser,
  availableUsers,
  onClose,
  onGroupCreated
}) => {
  // Option 1: Name
  const [groupName, setGroupName] = useState('');
  // Option 2: Profile Picture / Avatar
  const [avatarUrl, setAvatarUrl] = useState(PRESET_AVATARS[0]);
  const [customAvatarInput, setCustomAvatarInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  // Option 3: Members
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Filter friends: users who follow currentUser OR whom currentUser follows
  const friendsList = availableUsers.filter((u) => {
    if (u.id === currentUser.id || u.isAi) return false;
    const isFollowing = u.isFollowing || currentUser.followingIds?.includes(u.id);
    const isFollower = u.followers?.includes?.(currentUser.id) || currentUser.followers?.includes?.(u.id);
    // Include friends (following or followers), or all non-self users if list is small
    return isFollowing || isFollower || availableUsers.length <= 4;
  });

  const filteredFriends = friendsList.filter((u) => {
    const q = memberSearchQuery.toLowerCase();
    return (
      u.username.toLowerCase().includes(q) ||
      (u.displayName && u.displayName.toLowerCase().includes(q))
    );
  });

  const toggleSelectUser = (id: string) => {
    if (selectedUserIds.includes(id)) {
      setSelectedUserIds(selectedUserIds.filter((uid) => uid !== id));
    } else {
      setSelectedUserIds([...selectedUserIds, id]);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setErrorMsg('');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'avatars');

      const res = await fetch('/api/upload/media', {
        method: 'POST',
        headers: {
          'x-user-id': currentUser.id
        },
        body: formData
      });

      const data = await res.json();
      if (res.ok && data.url) {
        setAvatarUrl(data.url);
      } else {
        // Fallback to client reader
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result) setAvatarUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      // Local fallback
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) setAvatarUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setErrorMsg('Please enter a group name');
      return;
    }
    if (selectedUserIds.length === 0) {
      setErrorMsg('Please select at least 1 friend to add to the group');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg('');

      const result = await createGroupChat(
        groupName.trim(),
        avatarUrl || PRESET_AVATARS[0],
        [...selectedUserIds, currentUser.id],
        `Created by @${currentUser.username}`
      );

      if (!result.success || !result.chat) {
        throw new Error('Failed to create group chat');
      }

      onGroupCreated(result.chat);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating group chat');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-purple-600 to-[#00FF66] flex items-center justify-center text-black font-extrabold shadow-md shadow-purple-500/20">
              <Users className="w-5 h-5 text-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Create Group Chat</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold uppercase border border-purple-500/30">
                  group
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">Configure Name, Profile Picture, and Friends</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Creator Admin Notice */}
        <div className="p-3 rounded-2xl bg-gradient-to-r from-purple-950/40 via-zinc-900 to-emerald-950/30 border border-purple-500/30 flex items-start gap-2.5 text-xs text-zinc-300">
          <Shield className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-white">Admin Privileges: </span>
            You (<span className="text-[#00FF66] font-semibold">@{currentUser.username}</span>) will be the group creator & Admin. You can promote other friends to Admins and remove members anytime.
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          {/* OPTION 1: GROUP NAME */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-purple-500/30 text-purple-300 text-[10px] flex items-center justify-center font-bold">1</span>
                Group Name <span className="text-red-400">*</span>
              </label>
              <span className="text-[10px] text-zinc-500">{groupName.length}/40</span>
            </div>
            <input
              type="text"
              maxLength={40}
              placeholder="e.g. Cyber Squad 🚀, Friday Gamers 🎮"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00FF66] transition-colors"
            />
          </div>

          {/* OPTION 2: GROUP PROFILE / AVATAR */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-purple-500/30 text-purple-300 text-[10px] flex items-center justify-center font-bold">2</span>
              Group Profile Picture
            </label>

            <div className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800">
              <div className="relative shrink-0">
                <img
                  src={avatarUrl}
                  alt="Group profile"
                  className="w-14 h-14 rounded-2xl object-cover ring-2 ring-purple-500/50"
                />
                <span className="absolute -bottom-1 -right-1 px-1 py-0.2 rounded bg-purple-600 text-white text-[8px] font-bold uppercase">
                  group
                </span>
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold rounded-xl border border-white/10 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#00FF66]" />
                    {isUploading ? 'Uploading...' : 'Upload Photo'}
                  </button>
                  <span className="text-[11px] text-zinc-500">or choose a preset below</span>
                </div>

                {/* Preset Avatars */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {PRESET_AVATARS.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setAvatarUrl(url)}
                      className={`w-7 h-7 rounded-lg overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                        avatarUrl === url ? 'border-[#00FF66] scale-110' : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* OPTION 3: SELECT MEMBERS (FRIENDS) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-purple-500/30 text-purple-300 text-[10px] flex items-center justify-center font-bold">3</span>
                Select Members ({selectedUserIds.length} chosen) <span className="text-red-400">*</span>
              </label>
              <span className="text-[10px] text-zinc-500">Friends (Followers & Following)</span>
            </div>

            {/* Friend Search Input */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white focus-within:border-purple-500">
              <Search className="w-3.5 h-3.5 text-zinc-400 mr-2 shrink-0" />
              <input
                type="text"
                placeholder="Search friends..."
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                className="w-full bg-transparent focus:outline-none placeholder-zinc-500"
              />
            </div>

            {/* Friends List Container */}
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 border border-zinc-800/80 rounded-2xl p-2 bg-zinc-900/40">
              {filteredFriends.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500">
                  {memberSearchQuery ? 'No friends matched your search.' : 'No friends found. Follow people to add them to groups!'}
                </div>
              ) : (
                filteredFriends.map((u) => {
                  const isSelected = selectedUserIds.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      onClick={() => toggleSelectUser(u.id)}
                      className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-purple-950/40 border border-purple-500/50'
                          : 'bg-zinc-900/70 hover:bg-zinc-800/70 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={u.avatar}
                          alt={u.username}
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                        />
                        <div className="truncate">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-white truncate">
                              {u.displayName || u.username}
                            </span>
                            {u.isVerified && <VerifiedBadge size="xs" />}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                            <span>@{u.username}</span>
                            <span className="text-zinc-600">•</span>
                            <span className="text-[#00FF66] font-semibold flex items-center gap-0.5">
                              <UserCheck className="w-2.5 h-2.5" /> Friend
                            </span>
                          </div>
                        </div>
                      </div>

                      <div
                        className={`w-5 h-5 rounded-lg flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-[#00FF66] border-[#00FF66] text-black shadow-[0_0_8px_rgba(0,255,102,0.4)]'
                            : 'border-zinc-700 bg-zinc-800'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20 font-medium">
              {errorMsg}
            </p>
          )}

          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold text-xs rounded-xl border border-zinc-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !groupName.trim() || selectedUserIds.length === 0}
              className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-[#00FF66] text-black font-extrabold text-xs rounded-xl shadow-lg shadow-purple-500/25 hover:opacity-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              {loading ? 'Creating Group...' : 'Create Group Chat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

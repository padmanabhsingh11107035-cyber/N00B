import React, { useState, useRef } from 'react';
import {
  X,
  Users,
  Shield,
  Crown,
  UserPlus,
  Trash2,
  Edit2,
  Check,
  Upload,
  Search,
  LogOut,
  AlertCircle
} from 'lucide-react';
import { ChatConversation, User } from '../../types';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import {
  updateGroupDetails,
  manageGroupAdmin,
  removeGroupMember,
  addGroupMembers
} from '../../services/api';

interface GroupDetailsModalProps {
  isOpen: boolean;
  chat: ChatConversation;
  currentUser: User;
  allUsers: User[];
  onClose: () => void;
  onChatUpdated: (updatedChat: ChatConversation) => void;
}

export const GroupDetailsModal: React.FC<GroupDetailsModalProps> = ({
  isOpen,
  chat,
  currentUser,
  allUsers,
  onClose,
  onChatUpdated
}) => {
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [groupName, setGroupName] = useState(chat.name || 'Group Chat');
  const [avatarUrl, setAvatarUrl] = useState(chat.avatar || '');
  const [description, setDescription] = useState(chat.description || '');
  const [isUploading, setIsUploading] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [selectedNewUserIds, setSelectedNewUserIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const isCreator = chat.creatorId === currentUser.id;
  const isAdmin = isCreator || chat.adminIds?.includes(currentUser.id) || false;

  // Filter friends available to add who aren't already in the group
  const currentParticipantIds = (chat.participants || []).map((p) => p.id);
  const availableFriendsToAdd = allUsers.filter((u) => {
    if (u.id === currentUser.id || currentParticipantIds.includes(u.id) || u.isAi) return false;
    const isFriend = u.isFollowing || currentUser.followingIds?.includes(u.id) || u.followers?.includes?.(currentUser.id);
    return isFriend || allUsers.length <= 4;
  });

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
        headers: { 'x-user-id': currentUser.id },
        body: formData
      });

      const data = await res.json();
      if (res.ok && data.url) {
        setAvatarUrl(data.url);
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          if (reader.result) setAvatarUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    } catch (err: any) {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) setAvatarUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveInfo = async () => {
    if (!groupName.trim()) {
      setErrorMsg('Group name cannot be empty');
      return;
    }
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await updateGroupDetails(chat.id, {
        name: groupName.trim(),
        avatar: avatarUrl || undefined,
        description: description.trim() || undefined
      });
      if (res.success && res.chat) {
        onChatUpdated(res.chat);
        setIsEditingInfo(false);
        setSuccessMsg('Group info updated successfully!');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update group');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAdmin = async (targetUserId: string, currentlyAdmin: boolean) => {
    try {
      setLoading(true);
      setErrorMsg('');
      const action = currentlyAdmin ? 'remove_admin' : 'make_admin';
      const res = await manageGroupAdmin(chat.id, targetUserId, action);
      if (res.success && res.chat) {
        onChatUpdated(res.chat);
        setSuccessMsg(currentlyAdmin ? 'Admin status removed.' : 'Promoted user to Group Admin!');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update admin role');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!confirm('Are you sure you want to remove this member from the group?')) return;
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await removeGroupMember(chat.id, targetUserId);
      if (res.success && res.chat) {
        onChatUpdated(res.chat);
        setSuccessMsg('Member removed from group.');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to remove member');
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Are you sure you want to leave this group chat?')) return;
    try {
      setLoading(true);
      const res = await removeGroupMember(chat.id, currentUser.id);
      if (res.success) {
        onClose();
        window.location.reload();
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to leave group');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSelectedMembers = async () => {
    if (selectedNewUserIds.length === 0) return;
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await addGroupMembers(chat.id, selectedNewUserIds);
      if (res.success && res.chat) {
        onChatUpdated(res.chat);
        setSelectedNewUserIds([]);
        setShowAddMembers(false);
        setSuccessMsg('Added friends to the group!');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to add members');
    } finally {
      setLoading(false);
    }
  };

  const filteredMembers = (chat.participants || []).filter((p) => {
    const q = memberSearch.toLowerCase();
    return (
      (p.username && p.username.toLowerCase().includes(q)) ||
      (p.displayName && p.displayName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Group Information</h3>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold uppercase border border-purple-500/30">
                  group
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">Manage members, admins, and group details</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notifications */}
        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-2.5 rounded-xl bg-[#00FF66]/10 border border-[#00FF66]/20 text-xs text-[#00FF66] flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Group Profile Header Card */}
        <div className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <img
                src={avatarUrl || chat.avatar || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=400&auto=format&fit=crop&q=80'}
                alt=""
                className="w-16 h-16 rounded-2xl object-cover ring-2 ring-purple-500/40"
              />
              <span className="absolute -bottom-1 -right-1 px-1 py-0.2 rounded bg-purple-600 text-white text-[8px] font-bold uppercase">
                group
              </span>
            </div>

            <div className="flex-1 min-w-0">
              {isEditingInfo ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Group Name"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-[#00FF66]"
                  />
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
                      className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold rounded-lg border border-white/10 flex items-center gap-1 cursor-pointer"
                    >
                      <Upload className="w-3 h-3 text-[#00FF66]" />
                      {isUploading ? 'Uploading...' : 'Change Photo'}
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveInfo}
                      disabled={loading}
                      className="px-3 py-1 bg-[#00FF66] text-black font-extrabold text-[10px] rounded-lg cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEditingInfo(false)}
                      className="px-2 py-1 bg-zinc-800 text-zinc-400 text-[10px] rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white truncate">{chat.name || 'Group Chat'}</h4>
                    {isAdmin && (
                      <button
                        onClick={() => setIsEditingInfo(true)}
                        className="p-1 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
                        title="Edit group name and photo"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400">
                    <span>{(chat.participants || []).length} members</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-purple-300 font-semibold">
                      <Shield className="w-3 h-3" /> {chat.adminIds?.length || 1} Admins
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Member Management Section */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-purple-400" />
              Members ({(chat.participants || []).length})
            </span>

            {isAdmin && (
              <button
                onClick={() => setShowAddMembers(!showAddMembers)}
                className="px-2.5 py-1 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Friends</span>
              </button>
            )}
          </div>

          {/* Add Friends Drawer */}
          {showAddMembers && (
            <div className="p-3 rounded-2xl bg-zinc-900 border border-purple-500/30 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Select Friends to Add</span>
                <span className="text-[10px] text-zinc-400">{selectedNewUserIds.length} selected</span>
              </div>

              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {availableFriendsToAdd.length === 0 ? (
                  <p className="text-[11px] text-zinc-500 p-2 text-center">All your connected friends are already in this group!</p>
                ) : (
                  availableFriendsToAdd.map((u) => {
                    const isSelected = selectedNewUserIds.includes(u.id);
                    return (
                      <div
                        key={u.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedNewUserIds(selectedNewUserIds.filter((id) => id !== u.id));
                          } else {
                            setSelectedNewUserIds([...selectedNewUserIds, u.id]);
                          }
                        }}
                        className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                          isSelected ? 'bg-purple-950/50 border border-purple-500/50' : 'bg-zinc-950/70 hover:bg-zinc-800'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <img src={u.avatar} alt="" className="w-6 h-6 rounded-full object-cover" />
                          <span className="text-xs text-white font-bold">{u.displayName || u.username}</span>
                        </div>
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center border ${
                            isSelected ? 'bg-[#00FF66] border-[#00FF66] text-black' : 'border-zinc-700 bg-zinc-800'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {availableFriendsToAdd.length > 0 && (
                <button
                  type="button"
                  onClick={handleAddSelectedMembers}
                  disabled={loading || selectedNewUserIds.length === 0}
                  className="w-full py-2 bg-[#00FF66] text-black font-extrabold text-xs rounded-xl hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                >
                  Add {selectedNewUserIds.length} Friends to Group
                </button>
              )}
            </div>
          )}

          {/* Search Member list */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white">
            <Search className="w-3.5 h-3.5 text-zinc-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search group members..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              className="w-full bg-transparent focus:outline-none placeholder-zinc-500"
            />
          </div>

          {/* Member List */}
          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 divide-y divide-zinc-900/60">
            {filteredMembers.map((member) => {
              const isNoobMaster = member.id === 'u_noob_admin' || member.username?.toLowerCase() === 'noob';
              const isMemberCreator = chat.creatorId === member.id;
              const isMemberAdmin = isNoobMaster || isMemberCreator || chat.adminIds?.includes(member.id);
              const isMe = member.id === currentUser.id;

              return (
                <div
                  key={member.id}
                  className="pt-1.5 flex items-center justify-between p-2 rounded-xl bg-zinc-900/40 hover:bg-zinc-900/80 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={member.avatar}
                      alt={member.username}
                      className="w-8 h-8 rounded-full object-cover shrink-0"
                    />
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-white truncate">
                          {member.displayName || member.username}
                        </span>
                        {member.isVerified && <VerifiedBadge size="xs" />}
                        {isMe && <span className="text-[10px] text-[#00FF66] font-semibold">(You)</span>}
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                        <span>@{member.username}</span>
                        <span className="text-zinc-600">•</span>
                        {isNoobMaster ? (
                          <span className="text-[#00FF66] font-black flex items-center gap-0.5">
                            <Shield className="w-2.5 h-2.5 fill-[#00FF66]" /> NOOB Master Admin
                          </span>
                        ) : isMemberCreator ? (
                          <span className="text-amber-400 font-bold flex items-center gap-0.5">
                            <Crown className="w-2.5 h-2.5 fill-amber-400" /> Creator &amp; Admin
                          </span>
                        ) : isMemberAdmin ? (
                          <span className="text-purple-400 font-bold flex items-center gap-0.5">
                            <Shield className="w-2.5 h-2.5" /> Group Admin
                          </span>
                        ) : (
                          <span className="text-zinc-500">Member</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions for Admins */}
                  {isAdmin && !isMe && !isNoobMaster && (
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {!isMemberCreator && (
                        <button
                          onClick={() => handleToggleAdmin(member.id, !!isMemberAdmin)}
                          disabled={loading}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                            isMemberAdmin
                              ? 'bg-purple-950/40 border-purple-500/40 text-purple-300 hover:bg-purple-900/50'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:text-white'
                          }`}
                          title={isMemberAdmin ? 'Dismiss Admin status' : 'Make Group Admin'}
                        >
                          {isMemberAdmin ? 'Dismiss Admin' : 'Make Admin'}
                        </button>
                      )}

                      {!isMemberCreator && (
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          disabled={loading}
                          className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors cursor-pointer"
                          title="Remove from group"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between">
          {!isCreator && !chat.isGlobalDefault && (
            <button
              type="button"
              onClick={handleLeaveGroup}
              disabled={loading}
              className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-xs rounded-xl border border-red-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Leave Group</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-xs rounded-xl cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

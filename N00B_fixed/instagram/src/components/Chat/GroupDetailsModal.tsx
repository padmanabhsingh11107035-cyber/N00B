import React, { useState, useRef } from 'react';
import {
  ChevronLeft,
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
  AlertCircle,
  Lock
} from 'lucide-react';
import './groupDetails.css';
import { ChatConversation, User } from '../../types';
import { VerifiedBadge } from '../Common/VerifiedBadge';
import {
  updateGroupDetails,
  manageGroupAdmin,
  removeGroupMember,
  addGroupMembers,
  setGroupSendPolicy,
  uploadMediaFile
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
  // The NOOB master admin account isn't limited to friends — it can add any
  // registered user to a group, follow relationship or not.
  const isMasterAdmin = !!currentUser.isAdmin || currentUser.username?.toLowerCase() === 'noob' || currentUser.id === 'u_noob_admin';

  // Filter friends available to add who aren't already in the group
  const currentParticipantIds = (chat.participants || []).map((p) => p.id);
  const availableFriendsToAdd = allUsers.filter((u) => {
    if (u.id === currentUser.id || currentParticipantIds.includes(u.id) || u.isAi) return false;
    if (isMasterAdmin) return true;
    const isFriend = u.isFollowing || currentUser.followingIds?.includes(u.id) || u.followers?.includes?.(currentUser.id);
    return isFriend || allUsers.length <= 4;
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      setErrorMsg('');
      setSuccessMsg('');
      // Routes through the same invisible client-side compression every
      // other upload in the app uses, instead of sending the raw
      // camera-resolution file straight to B2.
      const data = await uploadMediaFile(file, 'avatars');
      if (data.success && data.url) {
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
      setSuccessMsg('');
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
      } else {
        setErrorMsg((res as any).error || 'Could not update the group.');
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
      setSuccessMsg('');
      const action = currentlyAdmin ? 'remove_admin' : 'make_admin';
      const res = await manageGroupAdmin(chat.id, targetUserId, action);
      if (res.success && res.chat) {
        onChatUpdated(res.chat);
        setSuccessMsg(currentlyAdmin ? 'Admin status removed.' : 'Promoted user to Group Admin!');
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        setErrorMsg((res as any).error || 'Could not change admin roles.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update admin role');
    } finally {
      setLoading(false);
    }
  };

  // Admins only: switch "only admins can send messages" on or off. Everyone in the group sees a notice in the chat.
  const handleToggleSendPolicy = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      setSuccessMsg('');
      const res = await setGroupSendPolicy(chat.id, !chat.onlyAdminsCanSend);
      if (res.success && res.chat) {
        onChatUpdated(res.chat);
        setSuccessMsg(res.chat.onlyAdminsCanSend ? 'Only admins can send messages now.' : 'Everyone can send messages again.');
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        setErrorMsg(res.error || 'Could not change this setting.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not change this setting.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!confirm('Are you sure you want to remove this member from the group?')) return;
    try {
      setLoading(true);
      setErrorMsg('');
      setSuccessMsg('');
      const res = await removeGroupMember(chat.id, targetUserId);
      if (res.success && res.chat) {
        onChatUpdated(res.chat);
        setSuccessMsg('Member removed from group.');
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        setErrorMsg((res as any).error || 'Could not remove that member.');
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
      } else {
        setErrorMsg((res as any).error || 'Could not leave the group.');
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
      setSuccessMsg('');
      const res = await addGroupMembers(chat.id, selectedNewUserIds);
      if (res.success && res.chat) {
        onChatUpdated(res.chat);
        setSelectedNewUserIds([]);
        setShowAddMembers(false);
        setSuccessMsg('Added friends to the group!');
        setTimeout(() => setSuccessMsg(''), 3000);
      } else {
        setErrorMsg((res as any).error || 'Could not add members.');
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
    <div className="gd-root" role="dialog" aria-modal="true" aria-label="Group information" data-testid="group-details-page">
      <div className="gd-bar">
        <button type="button" className="gd-back" onClick={onClose} aria-label="Back" data-testid="group-details-back"><ChevronLeft className="w-5 h-5" /></button>
        <h1 className="gd-title">Group information</h1>
      </div>

      <div className="gd-body">
        <div className="gd-col">
          {errorMsg && <div className="gd-msg err"><AlertCircle className="w-4 h-4 shrink-0" /><span>{errorMsg}</span></div>}
          {successMsg && <div className="gd-msg ok"><Check className="w-4 h-4 shrink-0" /><span>{successMsg}</span></div>}

          {/* The group */}
          <div className="gd-hero">
            <div className="gd-avatar"><img src={avatarUrl || chat.avatar || '/noob-logo-circle.png'} alt="" /></div>
            {isEditingInfo ? (
              <div className="gd-edit">
                <input type="text" className="gd-input" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name" />
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                <button type="button" className="gd-btn soft" onClick={() => fileInputRef.current?.click()} disabled={isUploading}><Upload className="w-4 h-4" />{isUploading ? 'Uploading...' : 'Change photo'}</button>
                <div className="gd-row2">
                  <button type="button" className="gd-btn soft" style={{ flex: 1 }} onClick={() => setIsEditingInfo(false)}>Cancel</button>
                  <button type="button" className="gd-btn green" style={{ flex: 1 }} onClick={handleSaveInfo} disabled={loading}>Save</button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="gd-name">{chat.name || 'Group Chat'}</h2>
                <div className="gd-sub">
                  <span>{(chat.participants || []).length} members</span>
                  <span className="gd-pill"><Shield className="w-3.5 h-3.5" />{chat.adminIds?.length || 1} admins</span>
                </div>
                {isAdmin && <button type="button" className="gd-link" onClick={() => setIsEditingInfo(true)}><Edit2 className="w-4 h-4" />Edit name and photo</button>}
              </>
            )}
          </div>

          {/* Who may write in this group */}
          {(isAdmin || chat.onlyAdminsCanSend) && (
            <div className="gd-card gd-switch-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>Only admins can send messages</b>
                <span>{isAdmin ? 'Members can read the chat, but only admins can write in it.' : 'Right now only the group admins can write in this chat.'}</span>
              </div>
              {isAdmin && (
                <button type="button" role="switch" aria-checked={!!chat.onlyAdminsCanSend} aria-label="Only admins can send messages" onClick={handleToggleSendPolicy} disabled={loading} className="gd-switch"><i /></button>
              )}
            </div>
          )}

          {/* Members */}
          <div className="gd-sec">
            <h2>Members ({(chat.participants || []).length})</h2>
            {isAdmin && !chat.isGlobalDefault && (
              <button type="button" className="gd-chip" onClick={() => setShowAddMembers(!showAddMembers)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <UserPlus className="w-4 h-4" />{isMasterAdmin ? 'Add members' : 'Add friends'}
              </button>
            )}
          </div>

          {showAddMembers && (
            <div className="gd-add">
              <div className="gd-sec"><b>{isMasterAdmin ? 'Pick users to add' : 'Pick friends to add'}</b><span style={{ color: '#64748b', fontSize: 13 }}>{selectedNewUserIds.length} selected</span></div>
              {availableFriendsToAdd.length === 0 ? (
                <p className="gd-empty">{isMasterAdmin ? 'Every registered user is already in this group.' : 'All your friends are already in this group.'}</p>
              ) : (
                <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {availableFriendsToAdd.map((u) => {
                    const on = selectedNewUserIds.includes(u.id);
                    return (
                      <div key={u.id} className={`gd-pick ${on ? 'on' : ''}`} onClick={() => setSelectedNewUserIds(on ? selectedNewUserIds.filter((id) => id !== u.id) : [...selectedNewUserIds, u.id])}>
                        <img src={u.avatar} alt="" /><b>{u.displayName || u.username}</b>
                        <span className="gd-tick">{on && <Check className="w-4 h-4 stroke-[3]" />}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {availableFriendsToAdd.length > 0 && (
                <button type="button" className="gd-btn green" onClick={handleAddSelectedMembers} disabled={loading || selectedNewUserIds.length === 0}>
                  Add {selectedNewUserIds.length} {isMasterAdmin ? 'users' : 'friends'} to the group
                </button>
              )}
            </div>
          )}

          <label className="gd-search"><Search className="w-5 h-5 shrink-0" /><input type="text" placeholder="Search members" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} /></label>

          <div className="gd-list">
            {filteredMembers.length === 0 && <p className="gd-empty">No one matches that search.</p>}
            {filteredMembers.map((member) => {
              const isNoobMaster = member.id === 'u_noob_admin' || member.username?.toLowerCase() === 'noob';
              const isMemberCreator = chat.creatorId === member.id;
              const isMemberAdmin = isNoobMaster || isMemberCreator || chat.adminIds?.includes(member.id);
              const isMe = member.id === currentUser.id;
              return (
                <div key={member.id} className="gd-m">
                  <img src={member.avatar} alt={member.username} />
                  <div className="gd-m-t">
                    <div className="gd-m-n">
                      <span>{member.displayName || member.username}</span>
                      {member.isVerified && <VerifiedBadge size="xs" />}
                      {isMe && <span style={{ color: '#0e6b4a', fontSize: 12, fontWeight: 700 }}>(You)</span>}
                    </div>
                    <div className="gd-m-s">
                      <span>@{member.username}</span>
                      {isNoobMaster ? <span className="gd-role"><Shield className="w-3.5 h-3.5" />NOOB admin</span>
                        : isMemberCreator ? <span className="gd-role gold"><Crown className="w-3.5 h-3.5" />Creator</span>
                        : isMemberAdmin ? <span className="gd-role"><Shield className="w-3.5 h-3.5" />Admin</span> : null}
                    </div>
                  </div>
                  {isAdmin && !isMe && !isNoobMaster && (
                    <div className="gd-acts">
                      {!isMemberCreator && (
                        <button type="button" className={`gd-chip ${isMemberAdmin ? 'off' : ''}`} onClick={() => handleToggleAdmin(member.id, !!isMemberAdmin)} disabled={loading} title={isMemberAdmin ? 'Dismiss admin' : 'Make admin'}>
                          {isMemberAdmin ? 'Dismiss' : 'Make admin'}
                        </button>
                      )}
                      {!isMemberCreator && !chat.isGlobalDefault && (
                        <button type="button" className="gd-del" onClick={() => handleRemoveMember(member.id)} disabled={loading} title="Remove from group" aria-label="Remove from group"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="gd-foot">
        <div className="gd-foot-in">
          {!isCreator && !chat.isGlobalDefault && (
            <button type="button" className="gd-btn red" onClick={handleLeaveGroup} disabled={loading}><LogOut className="w-4 h-4" />Leave group</button>
          )}
          <button type="button" className="gd-btn green" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};

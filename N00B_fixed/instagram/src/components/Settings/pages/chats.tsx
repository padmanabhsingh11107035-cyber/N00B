import React from 'react';
import { Bell, Check, Eye, Keyboard, MessageCircle, Pin, Trash2, Users, Vibrate, Volume2, Lock, Layers, ScanEye } from 'lucide-react';
import { PageShell, Section, ToggleRow, Choice, useFlash } from '../kit';
import { updateSettings, useAccountSettings, type AccountSettings } from '../../../services/settingsApi';

// "Chats" settings: who sees your last seen and online status, who can write to you or add you to a group, and how the chat list and the chats look and sound.
// Last seen, who can add you to a group, who can write to you, read receipts and online status are kept by the server (they decide what OTHER people may see or do);
// the rest are the account's own choices for how its chats look and behave, saved with the account so they follow the person to every device.

type FlashFn = (text: string, tone?: 'info' | 'good' | 'bad') => void;
async function save(patch: Partial<AccountSettings>, show: FlashFn) {
  const r = await updateSettings(patch);
  if (!r.success) show(r.error || 'Could not save that setting.', 'bad');
}

/** How many switches and choices are on this page (the tests count them). */
export const CHAT_SETTING_KEYS = [
  'chat.lastSeen', 'activity.status', 'msg.readReceipts', 'chat.typing',
  'msg.who', 'chat.groupAdds', 'msg.storyReplies',
  'chat.confirmDelete', 'chat.timeFormat', 'chat.encryptionNotice',
  'chat.compactList', 'chat.previewInList', 'chat.listAvatars', 'chat.pinnedOnTop', 'chat.unreadBadges',
  'chat.fontSize', 'chat.wallpaper',
  'chat.sounds', 'chat.vibrate', 'notif.messages',
  'chat.autoLoad'
] as const;

export const ChatSettingsPage: React.FC<{ back: () => void }> = ({ back }) => {
  const s = useAccountSettings();
  const [flash, show] = useFlash();
  const tog = (key: keyof AccountSettings) => (v: boolean) => save({ [key]: v } as Partial<AccountSettings>, show);
  const pick = (key: keyof AccountSettings) => (v: unknown) => save({ [key]: v } as Partial<AccountSettings>, show);
  return (
    <PageShell title="Chats" subtitle="Last seen, privacy, look and sounds" onBack={back}>
      {flash}

      <Section title="Who can see when you were last on" note="If you hide your last seen you will not see anybody else's either. People you are not connected to never see it.">
        <Choice value={s['chat.lastSeen']} onChange={pick('chat.lastSeen')} options={[
          { value: 'everyone', label: 'Everyone you chat with or follow' },
          { value: 'contacts', label: 'Only people you follow and people who follow you' },
          { value: 'nobody', label: 'Nobody', sub: 'Your last seen is hidden' }
        ]} />
      </Section>

      <Section title="What others can see about you">
        <ToggleRow icon={Eye} label="Online status" sub="Show a green dot while you are on NOOB" on={s['activity.status']} onChange={tog('activity.status')} testId="chat-online" />
        <ToggleRow icon={Check} label="Read receipts" sub="Let people see when you have read their message (off: you do not see theirs either)" on={s['msg.readReceipts']} onChange={tog('msg.readReceipts')} testId="chat-receipts" />
        <ToggleRow icon={Keyboard} label="Typing indicator" sub="Let people see that you are typing" on={s['chat.typing']} onChange={tog('chat.typing')} testId="chat-typing" />
      </Section>

      <Section title="Who can contact you">
        <Choice value={s['msg.who']} onChange={pick('msg.who')} options={[
          { value: 'connected', label: 'Start a chat: people you follow and people who follow you' },
          { value: 'following', label: 'Start a chat: only people you follow' },
          { value: 'nobody', label: 'Start a chat: no one' }
        ]} />
      </Section>
      <Section title="Who can add you to groups" note="Someone who is not allowed to add you is simply not added; the rest of the group is made as usual.">
        <Choice value={s['chat.groupAdds']} onChange={pick('chat.groupAdds')} options={[
          { value: 'everyone', label: 'Everyone' },
          { value: 'contacts', label: 'Only people you follow and people who follow you' },
          { value: 'nobody', label: 'Nobody', sub: 'You join groups only yourself' }
        ]} />
      </Section>
      <Section title="Who can reply to your stories">
        <Choice value={s['msg.storyReplies']} onChange={pick('msg.storyReplies')} options={[
          { value: 'everyone', label: 'Everyone who can see your story' },
          { value: 'following', label: 'People you follow' },
          { value: 'off', label: 'Off' }
        ]} />
      </Section>

      <Section title="Messages">
        <ToggleRow icon={Trash2} label="Ask before deleting a message" on={s['chat.confirmDelete']} onChange={tog('chat.confirmDelete')} testId="chat-confirm-delete" />
        <ToggleRow icon={Lock} label="Show the encryption notice" sub="The note at the top of a chat about end-to-end encryption" on={s['chat.encryptionNotice']} onChange={tog('chat.encryptionNotice')} testId="chat-enc-notice" />
      </Section>
      <Section title="Time in chats">
        <Choice value={s['chat.timeFormat']} onChange={pick('chat.timeFormat')} options={[
          { value: '12h', label: '12-hour clock', sub: '5:42 PM' },
          { value: '24h', label: '24-hour clock', sub: '17:42' }
        ]} />
      </Section>

      <Section title="Chat list">
        <ToggleRow icon={Layers} label="Compact list" sub="Smaller rows, so more chats fit on the screen" on={s['chat.compactList']} onChange={tog('chat.compactList')} testId="chat-compact" />
        <ToggleRow icon={MessageCircle} label="Show message previews" sub="The last message under each name" on={s['chat.previewInList']} onChange={tog('chat.previewInList')} testId="chat-preview" />
        <ToggleRow icon={Users} label="Show profile pictures" on={s['chat.listAvatars']} onChange={tog('chat.listAvatars')} testId="chat-avatars" />
        <ToggleRow icon={Pin} label="Keep pinned chats on top" on={s['chat.pinnedOnTop']} onChange={tog('chat.pinnedOnTop')} testId="chat-pinned" />
        <ToggleRow icon={ScanEye} label="Show unread counts" sub="The number on a chat that has new messages" on={s['chat.unreadBadges']} onChange={tog('chat.unreadBadges')} testId="chat-badges" />
      </Section>

      <Section title="Text size in chats">
        <Choice value={s['chat.fontSize']} onChange={pick('chat.fontSize')} options={[
          { value: 'small', label: 'Small' },
          { value: 'medium', label: 'Medium' },
          { value: 'large', label: 'Large' }
        ]} />
      </Section>
      <Section title="Chat background">
        <Choice value={s['chat.wallpaper']} onChange={pick('chat.wallpaper')} options={[
          { value: 'doodle', label: 'Doodles', sub: 'The NOOB pattern' },
          { value: 'plain', label: 'Plain', sub: 'No pattern' },
          { value: 'dark', label: 'Dark', sub: 'Always dark, in any theme' }
        ]} />
      </Section>

      <Section title="Sounds and alerts">
        <ToggleRow icon={Volume2} label="Chat sounds" sub="A soft sound when a message comes in or goes out of the chat you have open" on={s['chat.sounds']} onChange={tog('chat.sounds')} testId="chat-sounds" />
        <ToggleRow icon={Vibrate} label="Vibrate on new messages" on={s['chat.vibrate']} onChange={tog('chat.vibrate')} testId="chat-vibrate" />
        <ToggleRow icon={Bell} label="Message notifications" sub="Alerts for new messages" on={s['notif.messages']} onChange={tog('notif.messages')} testId="chat-notifs" />
      </Section>

      <Section title="Photos and videos in chats" note="When a picture or video is not loaded, you tap it to load it.">
        <Choice value={s['chat.autoLoad']} onChange={pick('chat.autoLoad')} options={[
          { value: 'always', label: 'Always load automatically' },
          { value: 'wifi', label: 'Only on Wi-Fi', sub: 'Not on mobile data' },
          { value: 'never', label: 'Never load automatically' }
        ]} />
      </Section>
    </PageShell>
  );
};

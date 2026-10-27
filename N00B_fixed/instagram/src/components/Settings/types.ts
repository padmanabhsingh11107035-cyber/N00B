import type React from 'react';
import type { User } from '../../types';

// What a page of "Settings and activity" is given, and what it can ask the profile page to do (open one of the older windows that already exist, switch the profile's tab,
// log out...). Keeping these in one place means every page is built the same way and the hub never needs to know how the profile page opens its windows.

export type ProfileTab = 'posts' | 'reels' | 'feed' | 'saved' | 'liked' | 'archive';

export interface SettingsActions {
  editProfile: () => void;
  showProfileTab: (tab: ProfileTab) => void;     // closes Settings and shows that tab of the profile
  openLanguagePicker: () => void;
  openTranslator: () => void;
  openDevices: () => void;
  openInstall: () => void;
  openBlocked: () => void;
  openHideProfile: () => void;
  openPro: () => void;
  openGetVerified: () => void;
  openSupport: () => void;
  openSuggestionBox: () => void;                 // send feedback, an idea or a problem to the team
  openTerms: () => void;
  openPrivacyPolicy: () => void;
  openE2ee: () => void;
  openWallet: () => void;
  openQrScanner: () => void;
  openCalculator: () => void;
  openFollowUs: () => void;
  openLiveAvatar: () => void;
  openAvatars: () => void;
  openAdmin: () => void;
  openSwitchAccount: () => void;
  openExport: () => void;
  openDeleteAccount: () => void;
  openProfessionalDashboard: () => void;
  openProfileQr: () => void;
  logout: () => void;
  /** Ends Settings (used after something that leaves the page, like logging out). */
  close: () => void;
}

export interface SettingsContext {
  currentUser: User;
  allUsers: User[];
  onUserUpdated: (user: User) => void;
  actions: SettingsActions;
  /** The person is an administrator of some kind (the Admin Control Panel row is shown). */
  isStaff: boolean;
  canLogout: boolean;
  canDeleteAccount: boolean;
}

export interface PageProps {
  ctx: SettingsContext;
  go: (page: string) => void;
  back: () => void;
}

export type PageComponent = React.ComponentType<PageProps>;

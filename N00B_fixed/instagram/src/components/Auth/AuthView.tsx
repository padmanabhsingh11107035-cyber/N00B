import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Sparkles,
  User as UserIcon,
  Lock,
  Mail,
  Phone,
  Globe,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Camera,
  ShieldAlert,
  ArrowRight,
  RefreshCw,
  Trash2,
  Heart,
  Users,
  Smile,
  FileText,
  ShieldCheck,
  Briefcase,
  Upload,
  Image as ImageIcon,
  Check,
  ChevronDown,
  Flame,
  Zap,
  Star,
  HelpCircle,
  CalendarDays
} from 'lucide-react';
import { User, AccountType } from '../../types';
import { loginUser, signupUser, verifyUsernameExists, recoverAccountAccess } from '../../services/api';
import { TermsAndConditions } from '../Legal/TermsAndConditions';
import { PrivacyPolicy } from '../Legal/PrivacyPolicy';
import { BirthdayWheelPicker } from './BirthdayWheelPicker';
import { NoobLogo } from '../Common/NoobLogo';
import { NoobCircleLogo } from '../Common/NoobCircleLogo';
import confetti from 'canvas-confetti';

interface AuthViewProps {
  onAuthSuccess: (user: User) => void;
  // Shown once, e.g. when a session was force-ended (account suspended)
  // rather than the user choosing to log out themselves.
  notice?: string;
}

// Generate random 5-character captcha code
const generateCaptchaCode = (): string => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Curated 2D Cartoon and 2D Nature avatars. `gender` drives which ones show
// in the picker for a given selected gender ('unisex' always shows).
const PRESET_2D_AVATARS = [
  // --- Male-presenting ---
  {
    id: 'm1',
    category: '2D Cartoon',
    label: 'Anime Guy',
    gender: 'male' as const,
    url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&auto=format&fit=crop&q=80'
  },
  {
    id: 'm2',
    category: '2D Cartoon',
    label: 'Felix',
    gender: 'male' as const,
    url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=b6e3f4,c0aede,d1d4f9'
  },
  {
    id: 'm3',
    category: '2D Cartoon',
    label: 'Liam Cool',
    gender: 'male' as const,
    url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Liam&backgroundColor=b6e3f4'
  },
  {
    id: 'm4',
    category: '2D Cartoon',
    label: 'Arjun Bold',
    gender: 'male' as const,
    url: 'https://api.dicebear.com/7.x/personas/svg?seed=Arjun&backgroundColor=c0aede'
  },
  {
    id: 'm5',
    category: '2D Cartoon',
    label: 'Kai Warrior',
    gender: 'male' as const,
    url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Kai&backgroundColor=b6e3f4'
  },
  // --- Female-presenting ---
  {
    id: 'f1',
    category: '2D Cartoon',
    label: 'Aria Girl',
    gender: 'female' as const,
    url: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Aria&backgroundColor=ffd5dc,d1d4f9'
  },
  {
    id: 'f2',
    category: '2D Cartoon',
    label: 'Priya Rose',
    gender: 'female' as const,
    url: 'https://api.dicebear.com/7.x/lorelei/svg?seed=Priya&backgroundColor=ffd5dc'
  },
  {
    id: 'f3',
    category: '2D Cartoon',
    label: 'Zara Chic',
    gender: 'female' as const,
    url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Zara&backgroundColor=ffdfbf'
  },
  {
    id: 'f4',
    category: '2D Cartoon',
    label: 'Maya Bloom',
    gender: 'female' as const,
    url: 'https://api.dicebear.com/7.x/personas/svg?seed=Maya&backgroundColor=ffd5dc'
  },
  {
    id: 'f5',
    category: '2D Cartoon',
    label: 'Ivy Belle',
    gender: 'female' as const,
    url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Ivy&backgroundColor=ffd5dc'
  },
  // --- Unisex characters ---
  {
    id: 'u1',
    category: '2D Cartoon',
    label: 'Cute Bot',
    gender: 'unisex' as const,
    url: 'https://api.dicebear.com/7.x/bottts/svg?seed=Sparky&backgroundColor=ffdfbf,ffd5dc'
  },
  {
    id: 'u2',
    category: '2D Cartoon',
    label: 'Pixel Pro',
    gender: 'unisex' as const,
    url: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=GamerNoob'
  },
  // --- Nature scenes (not people, always shown) ---
  {
    id: 'n1',
    category: '2D Nature',
    label: 'Fuji Sunset',
    gender: 'unisex' as const,
    url: 'https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?w=400&auto=format&fit=crop&q=80'
  },
  {
    id: 'n2',
    category: '2D Nature',
    label: 'Botanical Leaf',
    gender: 'unisex' as const,
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=400&auto=format&fit=crop&q=80'
  },
  {
    id: 'n3',
    category: '2D Nature',
    label: 'Cherry Blossom',
    gender: 'unisex' as const,
    url: 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=400&auto=format&fit=crop&q=80'
  },
  {
    id: 'n4',
    category: '2D Nature',
    label: 'Aurora Night',
    gender: 'unisex' as const,
    url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400&auto=format&fit=crop&q=80'
  }
];

// Country Options with Flag + Name + Number Code
export const COUNTRY_OPTIONS = [
  { flag: '🇮🇳', code: '+91', name: 'India', fullLabel: '🇮🇳 India (+91)' },
  { flag: '🇺🇸', code: '+1', name: 'United States', fullLabel: '🇺🇸 United States (+1)' },
  { flag: '🇬🇧', code: '+44', name: 'United Kingdom', fullLabel: '🇬🇧 United Kingdom (+44)' },
  { flag: '🇨🇦', code: '+1', name: 'Canada', fullLabel: '🇨🇦 Canada (+1)' },
  { flag: '🇦🇺', code: '+61', name: 'Australia', fullLabel: '🇦🇺 Australia (+61)' },
  { flag: '🇩🇪', code: '+49', name: 'Germany', fullLabel: '🇩🇪 Germany (+49)' },
  { flag: '🇫🇷', code: '+33', name: 'France', fullLabel: '🇫🇷 France (+33)' },
  { flag: '🇯🇵', code: '+81', name: 'Japan', fullLabel: '🇯🇵 Japan (+81)' },
  { flag: '🇧🇷', code: '+55', name: 'Brazil', fullLabel: '🇧🇷 Brazil (+55)' },
  { flag: '🇦🇪', code: '+971', name: 'United Arab Emirates', fullLabel: '🇦🇪 UAE (+971)' },
  { flag: '🇸🇬', code: '+65', name: 'Singapore', fullLabel: '🇸🇬 Singapore (+65)' },
  { flag: '🇳🇿', code: '+64', name: 'New Zealand', fullLabel: '🇳🇿 New Zealand (+64)' },
  { flag: '🇿🇦', code: '+27', name: 'South Africa', fullLabel: '🇿🇦 South Africa (+27)' },
  { flag: '🇮🇹', code: '+39', name: 'Italy', fullLabel: '🇮🇹 Italy (+39)' },
  { flag: '🇪🇸', code: '+34', name: 'Spain', fullLabel: '🇪🇸 Spain (+34)' },
  { flag: '🇷🇺', code: '+7', name: 'Russia', fullLabel: '🇷🇺 Russia (+7)' },
  { flag: '🇲🇽', code: '+52', name: 'Mexico', fullLabel: '🇲🇽 Mexico (+52)' },
  { flag: '🇰🇷', code: '+82', name: 'South Korea', fullLabel: '🇰🇷 South Korea (+82)' },
  { flag: '🇳🇬', code: '+234', name: 'Nigeria', fullLabel: '🇳🇬 Nigeria (+234)' },
  { flag: '🇮🇩', code: '+62', name: 'Indonesia', fullLabel: '🇮🇩 Indonesia (+62)' },
  { flag: '🇸🇦', code: '+966', name: 'Saudi Arabia', fullLabel: '🇸🇦 Saudi Arabia (+966)' }
];

export const GENDER_OPTIONS = [
  { id: 'Female', label: 'Female', emoji: '👩' },
  { id: 'Male', label: 'Male', emoji: '👨' },
  { id: 'Non-binary', label: 'Non-binary', emoji: '🧑' },
  { id: 'Other', label: 'Other', emoji: '✨' },
  { id: 'Prefer not to say', label: 'Prefer not to say', emoji: '🔒' }
];

const BUSINESS_CATEGORIES = [
  'Creator & Influencer',
  'Gaming & Esports',
  'Music & Audio Producer',
  'Art & Digital Design',
  'Brand & Retail Store',
  'Tech & AI Developer',
  'Fitness & Wellness',
  'Local Business & Cafe'
];

export const AuthView: React.FC<AuthViewProps> = ({ onAuthSuccess, notice }) => {
  const [mode, setMode] = useState<'signup' | 'login'>('login');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(notice || null);
  const [showPassword, setShowPassword] = useState(false);

  // Legal Modals
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);

  // Sign up form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('🇮🇳 India (+91)'); // Default India with number, name & flag
  const [mobileNumber, setMobileNumber] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('Prefer not to say');
  const [password, setPassword] = useState('');
  const [userId, setUserId] = useState('');
  const [bio, setBio] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('public');
  const [businessCategory, setBusinessCategory] = useState(BUSINESS_CATEGORIES[0]);
  const [selectedAvatar, setSelectedAvatar] = useState(PRESET_2D_AVATARS[0].url);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Honeypot field for bot attack proofing (invisible to humans, bots will fill it)
  const [honeypotValue, setHoneypotValue] = useState('');

  // Captcha state (random captcha only while creating account)
  const [captchaCode, setCaptchaCode] = useState<string>('');
  const [userCaptchaInput, setUserCaptchaInput] = useState<string>('');

  // Generate captcha on mount or when mode changes to signup
  useEffect(() => {
    setCaptchaCode(generateCaptchaCode());
  }, [mode]);

  // If the picked avatar no longer matches the chosen gender's filtered
  // tray (e.g. a male avatar was selected before switching gender to
  // Female), fall back to the first avatar that's still visible instead of
  // leaving a hidden, stale selection.
  useEffect(() => {
    if (customAvatarUrl) return;
    const stillVisible = PRESET_2D_AVATARS.some(
      (av) =>
        av.url === selectedAvatar &&
        (gender === 'Male'
          ? av.gender === 'male' || av.gender === 'unisex'
          : gender === 'Female'
          ? av.gender === 'female' || av.gender === 'unisex'
          : true)
    );
    if (!stillVisible) {
      const firstMatch = PRESET_2D_AVATARS.find((av) =>
        gender === 'Male'
          ? av.gender === 'male' || av.gender === 'unisex'
          : gender === 'Female'
          ? av.gender === 'female' || av.gender === 'unisex'
          : true
      );
      if (firstMatch) setSelectedAvatar(firstMatch.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender]);

  const handleRefreshCaptcha = () => {
    setCaptchaCode(generateCaptchaCode());
    setUserCaptchaInput('');
  };

  // Bumped by the "Shuffle" button to force fresh random suggestions without
  // requiring the name to change.
  const [suggestionSeed, setSuggestionSeed] = useState(0);

  // Generate varied, partly-randomized User ID suggestions from the entered
  // name — a mix of plain, underscored, and alphanumeric styles — regenerated
  // either when the name changes or the user asks for a fresh batch.
  const dynamicSuggestions = useMemo(() => {
    const words = fullName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);
    const first = words[0] || '';
    const rest = words.slice(1).join('');

    if (!first || first.length < 2) {
      return [];
    }

    const rand = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1));
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const randomLetters = (n: number) => Array.from({ length: n }, () => letters[rand(0, 25)]).join('');

    const candidates = [
      `${first}${rand(10, 99)}`,
      `${first}_${rand(100, 999)}`,
      rest ? `${first}.${rest}` : `${first}_noob`,
      rest ? `${first}${rest[0]}${rand(10, 99)}` : `${first}${randomLetters(2)}${rand(1, 9)}`,
      `the_${first}${rand(1, 999)}`,
      rest ? `${first[0]}${rest}${rand(1, 99)}` : `real_${first}${rand(100, 999)}`
    ];

    return Array.from(new Set(candidates)).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, suggestionSeed]);

  // File upload ref for custom image
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Forgot Password recovery flow: gated on a valid, already-entered
  // username (checked before the form even opens), then requires the
  // mobile number, date of birth, and email on file to all match before
  // granting access — there's no email/SMS reset link infrastructure, so
  // this identity check stands in for one.
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotMobileNumber, setForgotMobileNumber] = useState('');
  const [forgotDateOfBirth, setForgotDateOfBirth] = useState('');
  const [showForgotBirthdayPicker, setShowForgotBirthdayPicker] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Handle local file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage('Uploaded image must be under 5MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setCustomAvatarUrl(result);
          setSelectedAvatar(result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle Signup submission
  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Bot attack check: If honeypot is filled, silently reject or flag
    if (honeypotValue) {
      console.warn('Bot attack detected via honeypot.');
      setErrorMessage('Security validation failed.');
      return;
    }

    if (!fullName.trim()) {
      setErrorMessage('Please enter your name.');
      return;
    }
    if (!email.trim()) {
      setErrorMessage('Please enter your Email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter a password.');
      return;
    }
    if (!mobileNumber.trim()) {
      setErrorMessage('Please enter your mobile number.');
      return;
    }

    if (!dateOfBirth) {
      setErrorMessage('Please enter your date of birth.');
      return;
    }
    const birthDate = new Date(dateOfBirth);
    if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
      setErrorMessage('Please enter a valid date of birth.');
      return;
    }
    const ageInYears = (Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (ageInYears < 13) {
      setErrorMessage('You must be at least 13 years old to create a NOOB account.');
      return;
    }
    if (ageInYears > 82) {
      setErrorMessage('NOOB accounts are only available to users 82 years old or younger.');
      return;
    }

    const cleanUsername = userId.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
    if (!cleanUsername || cleanUsername.length < 3) {
      setErrorMessage('User ID must be at least 3 alphanumeric characters.');
      return;
    }

    if (!bio.trim()) {
      setErrorMessage('Please enter your bio. Bio is compulsory for all NOOB accounts.');
      return;
    }

    // Verify Captcha (case-insensitive)
    if (!userCaptchaInput.trim() || userCaptchaInput.trim().toUpperCase() !== captchaCode.toUpperCase()) {
      setErrorMessage('Security Captcha does not match. Please enter the correct 5-character code.');
      handleRefreshCaptcha();
      return;
    }

    if (!agreedToTerms) {
      setErrorMessage("Please check the box to agree to NOOB's general terms and privacy policy.");
      return;
    }

    try {
      setLoading(true);
      const avatarUrl = customAvatarUrl.trim() || selectedAvatar;
      const res = await signupUser({
        firstName: fullName.trim(),
        displayName: fullName.trim(),
        username: cleanUsername,
        email: email.trim(),
        countryCode,
        mobileNumber: mobileNumber.trim(),
        dateOfBirth,
        gender,
        password,
        avatar: avatarUrl,
        bio: bio.trim(),
        accountType,
        businessCategory: accountType === 'business' ? businessCategory : undefined,
        businessEmail: accountType === 'business' ? email.trim() : undefined,
        businessPhone: accountType === 'business' ? mobileNumber.trim() : undefined,
        agreedToTerms: true
      });

      if (res.success && res.user) {
        confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
        onAuthSuccess(res.user);
      } else {
        setErrorMessage(res.error || 'Account creation failed. User ID may already exist.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error communicating with server.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Login submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!loginIdentifier.trim()) {
      setErrorMessage('Please enter your User ID or Email');
      return;
    }
    if (!loginPassword) {
      setErrorMessage('Please enter your Password');
      return;
    }

    try {
      setLoading(true);
      const res = await loginUser({
        identifier: loginIdentifier.trim(),
        password: loginPassword
      });

      if (res.success && res.user) {
        onAuthSuccess(res.user);
      } else {
        setErrorMessage(res.error || 'Authentication failed. Please check your credentials.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Server connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 1: only opens the recovery form once the typed-in username is
  // confirmed to actually exist.
  const handleOpenForgotPassword = async () => {
    setErrorMessage(null);
    const uname = loginIdentifier.trim();
    if (!uname) {
      setErrorMessage('Please enter your username above first, then tap Forgot Password.');
      return;
    }
    try {
      setForgotLoading(true);
      const res = await verifyUsernameExists(uname);
      if (res.exists) {
        setForgotUsername(uname);
        setForgotMobileNumber('');
        setForgotDateOfBirth('');
        setForgotEmail('');
        setForgotError(null);
        setShowForgotPassword(true);
      } else {
        setErrorMessage(res.error || 'No account found with that username.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Server connection error. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  // Step 2: mobile number, date of birth, and email must ALL match the
  // account on file — a partial match still fails, and the server never
  // says which field was wrong.
  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    if (!forgotMobileNumber.trim() || !forgotDateOfBirth || !forgotEmail.trim()) {
      setForgotError('Please fill in your mobile number, date of birth, and email.');
      return;
    }
    try {
      setForgotLoading(true);
      const res = await recoverAccountAccess({
        username: forgotUsername,
        mobileNumber: forgotMobileNumber.trim(),
        dateOfBirth: forgotDateOfBirth,
        email: forgotEmail.trim()
      });
      if (res.success && res.user) {
        setShowForgotPassword(false);
        onAuthSuccess(res.user);
      } else {
        setForgotError(res.error || 'The details you entered do not match our records.');
      }
    } catch (err: any) {
      setForgotError(err.message || 'Server connection error. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  };

  // Quick Demo Account Helper
  const handleQuickDemo = (type: AccountType) => {
    const randomNum = Math.floor(100 + Math.random() * 900);
    const uname = type === 'business' ? `noob_brand_${randomNum}` : type === 'private' ? `secret_vibe_${randomNum}` : `cool_noob_${randomNum}`;
    setFullName(type === 'business' ? 'Apex Studio' : type === 'private' ? 'Rohan Sharma' : 'Aarav Verma');
    setEmail(`${uname}@noob.social`);
    setUserId(uname);
    setCountryCode('🇮🇳 India (+91)');
    setMobileNumber(`98765${Math.floor(10000 + Math.random() * 89999)}`);
    setGender(type === 'private' ? 'Female' : 'Male');
    setPassword('secretPass123');
    setAccountType(type);
    setBio(
      type === 'business'
        ? '🚀 Official Brand on NOOB | Creating next-gen experiences & reels'
        : type === 'private'
        ? '🔒 Private circle only | Close friends & real connections'
        : '🎉 Having fun, sharing memes & vibing with everyone!'
    );
    setAgreedToTerms(true);
    setMode('signup');
  };

  return (
    <div className="min-h-screen w-full bg-[#070709] text-white flex flex-col justify-between items-center p-3 sm:p-6 md:p-8 relative selection:bg-indigo-500 selection:text-white overflow-x-hidden">
      {/* Premium Gen Z Background glow accents */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[650px] h-[360px] bg-gradient-to-b from-indigo-600/25 via-violet-500/15 to-transparent rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[280px] bg-cyan-500/15 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute top-1/2 left-5 w-[300px] h-[300px] bg-[#00FF66]/10 rounded-full blur-[120px] pointer-events-none" />
      {/* Corner gradient "blob" accents for depth, with a small crown resting on the left one */}
      <div className="absolute bottom-0 left-0 w-[220px] h-[180px] sm:w-[380px] sm:h-[320px] bg-gradient-to-tr from-[#00FF66]/25 via-cyan-500/10 to-transparent rounded-tr-[100%] blur-3xl pointer-events-none" />
      <svg viewBox="0 0 24 24" className="hidden sm:block absolute bottom-[26%] left-[6%] w-6 h-6 text-amber-400/70 -rotate-12 pointer-events-none select-none z-[1]" fill="currentColor" aria-hidden="true"><path d="M3 8l4 3 5-6 5 6 4-3-2 10H5L3 8z" /></svg>
      <div className="hidden sm:block absolute top-0 right-0 w-[320px] h-[260px] bg-gradient-to-bl from-violet-500/15 to-transparent rounded-bl-[100%] blur-3xl pointer-events-none" />

      {/* Small picture-frame + heart accent, bottom-right corner */}
      <svg viewBox="0 0 24 24" className="hidden sm:block absolute bottom-[6%] right-[4%] w-10 h-10 text-white/20 pointer-events-none select-none z-[1]" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M9 15.5s-3.2-2-4.3-3.9C3.8 9.9 4.9 8 6.5 8c.9 0 1.6.55 2 1.3.4-.75 1.1-1.3 2-1.3 1.6 0 2.7 1.9 1.8 3.6C11.2 13.5 9 15.5 9 15.5z" fill="currentColor" stroke="none" />
      </svg>

      {/* Scattered hand-drawn doodles & callouts — smaller on phones, full size from sm: up */}
      <div className="absolute inset-0 pointer-events-none select-none z-[1] overflow-hidden" aria-hidden="true">
        {/* Top-left: "Make Friends" polaroid callout */}
        <div className="absolute top-[6%] left-[3%] sm:left-[5%] -rotate-6 text-center">
          <div className="w-14 h-14 sm:w-24 sm:h-24 border-2 border-white/25 rounded-lg sm:rounded-xl p-1 sm:p-1.5 bg-white/[0.02]">
            <div className="w-full h-full border border-dashed border-white/20 rounded sm:rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 sm:w-8 sm:h-8 text-white/30" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" /></svg>
            </div>
          </div>
          <span className="font-script text-sm sm:text-xl text-cyan-300/80 block mt-0.5 sm:mt-1 whitespace-nowrap">Make Friends ♡</span>
        </div>

        {/* Left, mid: phone mockup with a "story" preview */}
        <div className="hidden sm:block absolute top-[30%] left-[3%] w-28 -rotate-3">
          <div className="rounded-[22px] border-2 border-white/15 bg-zinc-900/40 p-1.5 shadow-2xl">
            <div className="rounded-2xl overflow-hidden aspect-[9/16] bg-gradient-to-b from-orange-400/70 via-pink-500/50 to-indigo-700/70 relative">
              <div className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-white/20 border border-white/40" />
              <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between text-white/70">
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M12 21s-7-4.35-9.5-8.5C.5 8.5 3 5 6.5 5c2 0 3.5 1.2 4.5 2.8C12 6.2 13.5 5 15.5 5 19 5 21.5 8.5 20 12.5 17.5 16.65 12 21 12 21z" /></svg>
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4h12v16l-6-4-6 4V4z" /></svg>
              </div>
            </div>
          </div>
        </div>

        {/* Top-right: "Good Vibes Only" */}
        <div className="absolute top-[7%] right-[3%] sm:right-[6%] rotate-3 text-right">
          <span className="font-script text-base sm:text-2xl text-violet-300/80 leading-tight block whitespace-nowrap">Good Vibes<br />Only</span>
          <svg viewBox="0 0 100 10" className="w-16 h-2.5 sm:w-24 sm:h-3 text-violet-300/60 ml-auto mt-0.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6 Q 25 2 50 6 T 98 5" /></svg>
        </div>

        {/* Right, mid: stacked colorful icon badges */}
        <div className="absolute top-[26%] sm:top-[32%] right-[3%] sm:right-[7%] flex flex-col gap-1.5 sm:gap-2.5">
          <div className="w-6 h-6 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 flex items-center justify-center rotate-6 shadow-lg shadow-pink-500/20">
            <svg viewBox="0 0 24 24" className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="currentColor"><path d="M12 21s-7-4.35-9.5-8.5C.5 8.5 3 5 6.5 5c2 0 3.5 1.2 4.5 2.8C12 6.2 13.5 5 15.5 5 19 5 21.5 8.5 20 12.5 17.5 16.65 12 21 12 21z" /></svg>
          </div>
          <div className="w-6 h-6 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center -rotate-3 shadow-lg shadow-cyan-500/20 ml-2 sm:ml-3">
            <svg viewBox="0 0 24 24" className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 8.5 8.5 0 0 1-4-.9L3 20l1.9-5A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 17 0z" /></svg>
          </div>
          <div className="w-6 h-6 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center rotate-6 shadow-lg shadow-violet-500/20">
            <svg viewBox="0 0 24 24" className="w-3 h-3 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" /><path d="M18 8h4M20 6v4" /></svg>
          </div>
        </div>

        {/* Left, lower: "Real People, Real Connections" */}
        <div className="absolute bottom-[16%] sm:bottom-[20%] left-[2%] sm:left-[4%] -rotate-3">
          <span className="font-script text-sm sm:text-xl text-emerald-300/80 leading-tight block whitespace-nowrap">Real People<br />Real Connections</span>
        </div>

        {/* Right, lower: feature list */}
        <div className="absolute bottom-[18%] sm:bottom-[22%] right-[2%] sm:right-[5%] rotate-2 text-left">
          <span className="font-script text-sm sm:text-xl text-pink-300/80 leading-tight block whitespace-nowrap">Post • Reels<br />Chat • Follow</span>
          <svg viewBox="0 0 100 10" className="w-16 h-2.5 sm:w-24 sm:h-3 text-pink-300/60 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6 Q 25 2 50 6 T 98 5" /></svg>
        </div>

        {/* Small scattered sparkles, hearts & a paper-plane for texture */}
        <svg viewBox="0 0 24 24" className="absolute top-[20%] left-[15%] sm:left-[18%] w-3 h-3 sm:w-4 sm:h-4 text-amber-300/50 rotate-12" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" /></svg>
        <svg viewBox="0 0 24 24" className="hidden sm:block absolute top-[6%] left-[38%] w-5 h-5 text-white/30 rotate-[20deg]" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></svg>
        <svg viewBox="0 0 24 24" className="absolute bottom-[16%] left-[20%] sm:left-[24%] w-3 h-3 sm:w-4 sm:h-4 text-violet-300/40 -rotate-12" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" /></svg>
        <svg viewBox="0 0 24 24" className="absolute top-[45%] sm:top-[48%] right-[10%] sm:right-[14%] w-3 h-3 sm:w-4 sm:h-4 text-emerald-300/40 rotate-6" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" /></svg>
        <svg viewBox="0 0 24 24" className="hidden sm:block absolute bottom-[8%] right-[22%] w-5 h-5 text-amber-300/50 -rotate-6" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" /></svg>
      </div>

      {/* Top Header: Circular brand badge + wordmark, centered */}
      <header className="w-full max-w-lg flex flex-col items-center justify-center z-10 pt-2 pb-2">
        <div className="relative transition-transform hover:scale-[1.02]">
          {/* Circular gradient-ring badge */}
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-[#00FF66] via-cyan-400 to-indigo-600 p-[3px] shadow-[0_0_35px_rgba(0,255,102,0.35)]">
            <div className="w-full h-full rounded-full bg-black flex flex-col items-center justify-center overflow-hidden relative">
              {/* Faint phone-outline silhouette behind the wordmark */}
              <svg viewBox="0 0 24 24" className="absolute w-11 h-11 sm:w-14 sm:h-14 text-white/10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="7" y="2" width="10" height="20" rx="2" /></svg>
              {/* Crown accent */}
              <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 -mb-0.5 relative" fill="currentColor"><path d="M3 8l4 3 5-6 5 6 4-3-2 10H5L3 8z" /></svg>
              <span className="font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-[#00FF66] to-cyan-300 text-lg sm:text-xl tracking-tighter leading-none relative">
                NOOB
              </span>
              {/* Tiny heart accent, left side */}
              <svg viewBox="0 0 24 24" className="absolute top-2.5 left-2 w-2.5 h-2.5 text-[#00FF66]/70 relative" fill="currentColor"><path d="M12 21s-7-4.35-9.5-8.5C.5 8.5 3 5 6.5 5c2 0 3.5 1.2 4.5 2.8C12 6.2 13.5 5 15.5 5 19 5 21.5 8.5 20 12.5 17.5 16.65 12 21 12 21z" /></svg>
              {/* Tiny chat-bubble accent */}
              <svg viewBox="0 0 24 24" className="absolute top-2 right-2 w-3 h-3 text-cyan-300/70" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.5 8.5 8.5 0 0 1-4-.9L3 20l1.9-5A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 17 0z" /></svg>
            </div>
          </div>
          {/* Sparkle accent beside the badge */}
          <svg viewBox="0 0 24 24" className="absolute -top-1 -right-2 w-5 h-5 text-amber-300 rotate-12" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" /></svg>
          {/* Tiny confetti dashes around the badge */}
          <span className="absolute -top-2 left-1 w-2.5 h-0.5 rounded-full bg-amber-300 -rotate-45" />
          <span className="absolute top-1 -left-3 w-2 h-0.5 rounded-full bg-cyan-300 rotate-12" />
          <span className="absolute -bottom-1 -left-2 w-2.5 h-0.5 rounded-full bg-pink-400 rotate-45" />
          {/* Tiny paper-plane accent */}
          <svg viewBox="0 0 24 24" className="absolute -bottom-2 -right-1 w-3.5 h-3.5 text-teal-300/80 rotate-[15deg]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></svg>
        </div>

        {/* "NOOB" text lockup below the badge */}
        <span className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-100 to-zinc-300 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
          NOOB
        </span>

        {/* Tagline */}
        <div className="flex items-center gap-2 mt-1 text-xs sm:text-sm font-bold tracking-wide">
          <span className="text-[#00FF66]">Connect</span>
          <span className="text-zinc-600">•</span>
          <span className="text-cyan-400">Share</span>
          <span className="text-zinc-600">•</span>
          <span className="text-violet-400">Grow</span>
        </div>
      </header>

      {/* Main Authentication Card */}
      <main className="w-full max-w-lg my-auto z-10 py-3">
        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2.5 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-red-400 hover:text-white text-sm font-bold">✕</button>
          </div>
        )}

        <div className="bg-zinc-950/95 backdrop-blur-2xl border border-white/10 rounded-[32px] p-5 sm:p-8 shadow-2xl shadow-black relative overflow-hidden ring-1 ring-white/5">
          {/* Top Option: Only Log In indicator at top for login page */}
          {mode === 'login' ? (
            <div className="flex items-center justify-center p-1 bg-zinc-900/90 rounded-2xl border border-white/5 mb-5">
              <div className="w-full py-2.5 text-xs font-extrabold rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500 text-white shadow-md shadow-indigo-500/25 flex items-center justify-center gap-1.5 select-none">
                <Lock className="w-3.5 h-3.5" />
                <span>Log In to Your Account</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-1 bg-zinc-900/90 rounded-2xl border border-white/5 mb-5 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-white">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span>Create New Account</span>
              </div>
              <button
                type="button"
                onClick={() => { setMode('login'); setErrorMessage(null); }}
                className="text-xs font-bold text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
              >
                ← Back to Log In
              </button>
            </div>
          )}

          {/* ================= SIGN UP FORM ================= */}
          {mode === 'signup' && (
            <form onSubmit={handleSignupSubmit} className="space-y-4">
              {/* Hidden honeypot field for bot attack protection */}
              <input
                type="text"
                name="website_honeypot"
                value={honeypotValue}
                onChange={(e) => setHoneypotValue(e.target.value)}
                style={{ display: 'none', position: 'absolute', left: '-9999px' }}
                tabIndex={-1}
                autoComplete="off"
              />

              {/* Row 1: Name */}
              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1.5">
                  Name <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Aarav Verma"
                  className="w-full bg-[#141418] text-sm text-white px-3.5 py-3 rounded-2xl border border-white/10 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-all placeholder:text-zinc-600"
                />
              </div>

              {/* Dynamic User ID suggestions - ONLY AFTER user enters name */}
              {dynamicSuggestions.length > 0 && (
                <div className="p-3 bg-zinc-900/70 border border-cyan-500/20 rounded-2xl space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" />
                      Suggested User IDs:
                    </span>
                    <button
                      type="button"
                      onClick={() => setSuggestionSeed((s) => s + 1)}
                      className="text-[10px] text-cyan-300 hover:text-cyan-200 font-bold cursor-pointer flex items-center gap-1"
                    >
                      🔀 Shuffle
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {dynamicSuggestions.map((suggestedId) => (
                      <button
                        key={suggestedId}
                        type="button"
                        onClick={() => setUserId(suggestedId)}
                        className={`text-xs px-3 py-1.5 rounded-xl font-mono font-bold transition-all cursor-pointer ${
                          userId === suggestedId
                            ? 'bg-gradient-to-r from-cyan-400 to-indigo-500 text-black shadow-md shadow-cyan-500/30'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white border border-white/10'
                        }`}
                      >
                        @{suggestedId}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Row 2: User ID Input */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                    <span>User ID / Username</span>
                    <span className="text-cyan-400">*</span>
                  </label>
                  <span className="text-[11px] text-[#00FF66] font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Unique Handle
                  </span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-cyan-400 font-bold">
                    @
                  </div>
                  <input
                    type="text"
                    required
                    value={userId}
                    onChange={(e) => setUserId(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                    placeholder="Enter or pick username"
                    className="w-full bg-[#141418] text-sm text-white pl-8 pr-4 py-3 rounded-2xl border border-white/10 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-all placeholder:text-zinc-600 font-mono"
                  />
                </div>
              </div>

              {/* Row 3: Gender Option */}
              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1.5">
                  Gender <span className="text-cyan-400">*</span>
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {GENDER_OPTIONS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGender(g.id)}
                      className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                        gender === g.id
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-500/20'
                          : 'bg-[#141418] border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
                      }`}
                    >
                      <span className="text-sm">{g.emoji}</span>
                      <span className="text-[11px] truncate w-full text-center">{g.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 4: Email */}
              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1.5">
                  Email Address <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-[#141418] text-sm text-white px-3.5 py-3 rounded-2xl border border-white/10 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-all placeholder:text-zinc-600"
                />
              </div>

              {/* Row 5: Country (Number + Name + Flag) & Mobile Number */}
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-6">
                    <label className="text-xs font-bold text-zinc-300 block mb-1.5">
                      Country (Flag, Name &amp; Code)
                    </label>
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      className="w-full bg-[#141418] text-xs text-white px-3 py-3 rounded-2xl border border-white/10 focus:border-cyan-400 outline-none transition-all cursor-pointer font-medium"
                    >
                      {COUNTRY_OPTIONS.map((c, i) => (
                        <option key={i} value={c.fullLabel}>
                          {c.fullLabel}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-6">
                    <label className="text-xs font-bold text-zinc-300 block mb-1.5">
                      Mobile Number <span className="text-cyan-400">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full bg-[#141418] text-sm text-white px-3.5 py-3 rounded-2xl border border-white/10 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-all placeholder:text-zinc-600"
                    />
                  </div>
                </div>
              </div>

              {/* Row 5.5: Date of Birth (must be 13+ to create an account) */}
              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1.5">
                  Date of Birth <span className="text-cyan-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowBirthdayPicker(true)}
                  className="w-full flex items-center justify-between bg-[#141418] text-sm px-3.5 py-3 rounded-2xl border border-white/10 hover:border-cyan-400/60 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-all cursor-pointer text-left"
                >
                  <span className={dateOfBirth ? 'text-white font-medium' : 'text-zinc-500'}>
                    {dateOfBirth
                      ? new Date(dateOfBirth).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
                      : 'Select your date of birth'}
                  </span>
                  <CalendarDays className="w-4 h-4 text-cyan-400 shrink-0" />
                </button>
                <p className="text-[10px] text-zinc-500 mt-1">You must be between 13 and 82 years old to use NOOB.</p>
              </div>

              {/* Row 6: Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-zinc-300">
                    Password <span className="text-cyan-400">*</span>
                  </label>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    className="w-full bg-[#141418] text-sm text-white px-3.5 pr-16 py-3 rounded-2xl border border-white/10 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-all placeholder:text-zinc-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-xs font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {/* Row 7: Account Types (Public, Private, Business) */}
              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1.5">
                  Account Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {/* Public */}
                  <button
                    type="button"
                    onClick={() => setAccountType('public')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      accountType === 'public'
                        ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500'
                        : 'border-white/10 bg-[#141418] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm">🌐</span>
                      {accountType === 'public' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                    </div>
                    <span className="text-xs font-bold text-white block">Public</span>
                    <span className="text-[10px] text-zinc-400 leading-tight block mt-0.5">
                      Open to all
                    </span>
                  </button>

                  {/* Private */}
                  <button
                    type="button"
                    onClick={() => setAccountType('private')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      accountType === 'private'
                        ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/10 ring-1 ring-purple-500'
                        : 'border-white/10 bg-[#141418] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm">🔒</span>
                      {accountType === 'private' && <Check className="w-3.5 h-3.5 text-purple-400" />}
                    </div>
                    <span className="text-xs font-bold text-white block">Private</span>
                    <span className="text-[10px] text-zinc-400 leading-tight block mt-0.5">
                      Follow approval
                    </span>
                  </button>

                  {/* Business */}
                  <button
                    type="button"
                    onClick={() => setAccountType('business')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      accountType === 'business'
                        ? 'border-[#00FF66] bg-emerald-500/10 shadow-lg shadow-emerald-500/10 ring-1 ring-[#00FF66]'
                        : 'border-white/10 bg-[#141418] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm">💼</span>
                      {accountType === 'business' && <Check className="w-3.5 h-3.5 text-[#00FF66]" />}
                    </div>
                    <span className="text-xs font-bold text-white block">Business</span>
                    <span className="text-[10px] text-zinc-400 leading-tight block mt-0.5">
                      Insights &amp; Stats
                    </span>
                  </button>
                </div>
              </div>

              {/* Row 8: Avatar Picker */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                    <span>Profile</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-normal">2D Art</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Upload Custom</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>

                {/* Avatar Tray */}
                <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none">
                  {customAvatarUrl && (
                    <div className="relative shrink-0 w-12 h-12 rounded-2xl overflow-hidden border-2 border-cyan-400 shadow-lg shadow-cyan-500/30">
                      <img src={customAvatarUrl} alt="custom upload" className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-cyan-400 text-black rounded-tl flex items-center justify-center text-[8px] font-bold">✓</span>
                    </div>
                  )}

                  {PRESET_2D_AVATARS.filter((av) =>
                    gender === 'Male'
                      ? av.gender === 'male' || av.gender === 'unisex'
                      : gender === 'Female'
                      ? av.gender === 'female' || av.gender === 'unisex'
                      : true
                  ).map((av) => (
                    <button
                      key={av.id}
                      type="button"
                      onClick={() => { setSelectedAvatar(av.url); setCustomAvatarUrl(''); }}
                      className={`relative shrink-0 w-12 h-12 rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${
                        selectedAvatar === av.url && !customAvatarUrl
                          ? 'border-cyan-400 scale-110 shadow-lg shadow-cyan-500/30 ring-2 ring-cyan-400/40'
                          : 'border-white/10 opacity-75 hover:opacity-100 hover:border-white/30'
                      }`}
                      title={`${av.label} (${av.category})`}
                    >
                      <img
                        src={av.url}
                        alt={av.label}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const img = e.currentTarget;
                          if (!img.dataset.hasFailed) {
                            img.dataset.hasFailed = 'true';
                            img.src = `https://api.dicebear.com/7.x/adventurer/svg?seed=${av.id}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
                          }
                        }}
                      />
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      const seed = Math.random().toString(36).substring(2, 8);
                      const dicebear = `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
                      setCustomAvatarUrl(dicebear);
                      setSelectedAvatar(dicebear);
                    }}
                    className="shrink-0 w-12 h-12 rounded-2xl bg-zinc-900 border border-white/10 flex items-center justify-center text-zinc-400 hover:text-white hover:border-cyan-400 transition-all cursor-pointer"
                    title="Generate random character"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Row 9: Bio / Tagline (Compulsory) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-zinc-300">
                    Bio / Status <span className="text-cyan-400 font-bold">* (Compulsory)</span>
                  </label>
                  <span className="text-[10px] text-zinc-500">Required</span>
                </div>
                <input
                  type="text"
                  required
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Introduce yourself, your vibes or gaming tag... (Required)"
                  className={`w-full bg-[#141418] text-xs text-white px-3.5 py-3 rounded-2xl border ${
                    !bio.trim() ? 'border-cyan-500/40 focus:border-cyan-400' : 'border-white/10 focus:border-cyan-400'
                  } outline-none transition-all placeholder:text-zinc-600`}
                />
              </div>

              {/* Row 10: Bot Attack Proof Security Captcha */}
              <div className="p-3.5 bg-[#101014] border border-white/10 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#00FF66]" />
                    <span>Bot Defense Verification</span>
                    <span className="text-cyan-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleRefreshCaptcha}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold cursor-pointer"
                    title="Generate new captcha"
                  >
                    <RefreshCw className="w-3 h-3" /> New Code
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    onClick={handleRefreshCaptcha}
                    className="relative px-4 py-2.5 bg-zinc-950 rounded-xl border border-zinc-700/80 select-none cursor-pointer flex items-center justify-center tracking-[0.35em] font-mono text-lg font-black shadow-inner overflow-hidden min-w-[130px]"
                    title="Click to refresh captcha"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 via-transparent to-[#00FF66]/10 pointer-events-none" />
                    <div className="absolute inset-x-0 top-1/2 h-[1px] bg-white/20 -rotate-6 pointer-events-none" />
                    <div className="absolute inset-x-0 top-1/3 h-[1px] bg-cyan-400/20 rotate-3 pointer-events-none" />

                    <div className="flex items-center gap-1 relative z-10">
                      {captchaCode.split('').map((char, index) => {
                        const rotations = ['-rotate-6', 'rotate-3', '-rotate-3', 'rotate-6', '-rotate-12'];
                        const colors = ['text-cyan-400', 'text-[#00FF66]', 'text-indigo-400', 'text-yellow-400', 'text-purple-400'];
                        return (
                          <span
                            key={index}
                            className={`inline-block ${rotations[index % rotations.length]} ${colors[index % colors.length]} drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]`}
                          >
                            {char}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex-1">
                    <input
                      type="text"
                      required
                      maxLength={5}
                      value={userCaptchaInput}
                      onChange={(e) => setUserCaptchaInput(e.target.value.toUpperCase())}
                      placeholder="Type 5-char code"
                      className="w-full bg-[#141418] text-sm font-mono tracking-widest text-white px-3 py-2.5 rounded-xl border border-white/10 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-all placeholder:text-zinc-600 uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Row 11: Mandatory Terms Checkbox */}
              <div className="pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-cyan-400 focus:ring-0 cursor-pointer accent-cyan-400"
                  />
                  <span className="text-xs text-zinc-300 leading-snug">
                    I agree to NOOB&apos;s{' '}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setShowTermsModal(true); }}
                      className="text-cyan-400 underline font-semibold hover:text-cyan-300 cursor-pointer"
                    >
                      Terms of Service
                    </button>{' '}
                    and{' '}
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setShowPrivacyModal(true); }}
                      className="text-cyan-400 underline font-semibold hover:text-cyan-300 cursor-pointer"
                    >
                      Privacy Policy
                    </button>
                  </span>
                </label>
              </div>

              {/* Sign Up Button in Gen Z Vibrant Gradient */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-400 hover:from-violet-500 hover:via-indigo-500 hover:to-cyan-300 text-white font-extrabold text-sm shadow-xl shadow-indigo-500/25 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Join NOOB Now</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Quick Fill Presets */}
              <div className="pt-2 border-t border-white/5">
                <span className="text-[10px] text-zinc-500 block text-center mb-1.5 uppercase tracking-wider font-bold">
                  Quick Fill Presets
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickDemo('public')}
                    className="py-1.5 px-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-[10px] text-zinc-300 hover:text-white border border-white/5 transition-all cursor-pointer truncate"
                  >
                    🌐 Public User
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDemo('private')}
                    className="py-1.5 px-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-[10px] text-zinc-300 hover:text-white border border-white/5 transition-all cursor-pointer truncate"
                  >
                    🔒 Private User
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDemo('business')}
                    className="py-1.5 px-2 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-[10px] text-zinc-300 hover:text-white border border-white/5 transition-all cursor-pointer truncate"
                  >
                    💼 Business Pro
                  </button>
                </div>
              </div>

              <div className="text-center pt-1">
                <p className="text-xs text-zinc-400">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-blue-400 font-bold hover:underline cursor-pointer"
                  >
                    Log In
                  </button>
                </p>
              </div>
            </form>
          )}

          {/* ================= LOG IN FORM ================= */}
          {mode === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1.5">
                  User ID or Email
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="Enter your @user_id or email"
                    className="w-full bg-[#141418] text-sm text-white px-3.5 py-3 rounded-2xl border border-white/10 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-all placeholder:text-zinc-600"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-zinc-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-xs font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full bg-[#141418] text-sm text-white px-3.5 py-3 rounded-2xl border border-white/10 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-all placeholder:text-zinc-600"
                />
                <div className="text-right mt-1.5">
                  <button
                    type="button"
                    onClick={handleOpenForgotPassword}
                    disabled={forgotLoading}
                    className="text-xs font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer disabled:opacity-50"
                  >
                    {forgotLoading ? 'Checking...' : 'Forgot Password?'}
                  </button>
                </div>
              </div>

              {/* Login Button: Premium Gen Z vibrant gradient, with small flanking accent dashes */}
              <div className="relative mt-3">
                <svg viewBox="0 0 24 24" className="absolute -left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400/70 pointer-events-none select-none" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h10M4 12h16M4 18h10" /></svg>
                <svg viewBox="0 0 24 24" className="absolute -right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-violet-400/70 pointer-events-none select-none" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 6h10M4 12h16M4 18h10" /></svg>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-400 hover:from-violet-500 hover:via-indigo-500 hover:to-cyan-300 text-white font-black text-sm shadow-[0_0_25px_rgba(99,102,241,0.35)] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Log In to NOOB</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {/* Bottom "Create Account" Link strictly in Blue */}
              <div className="text-center pt-3 border-t border-white/5">
                <p className="text-xs text-zinc-400">
                  Don&apos;t have an account yet?{' '}
                  <button
                    type="button"
                    onClick={() => { setMode('signup'); setErrorMessage(null); }}
                    className="text-blue-400 font-bold hover:text-blue-300 hover:underline cursor-pointer transition-colors"
                  >
                    Create Account
                  </button>
                </p>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-lg z-10 py-3 text-center border-t border-white/5 mt-auto">
        <div className="flex items-center justify-center gap-4 text-xs text-zinc-500 mb-1">
          <button
            onClick={() => setShowTermsModal(true)}
            className="hover:text-zinc-300 transition-colors cursor-pointer"
          >
            Terms & Conditions
          </button>
          <span>•</span>
          <button
            onClick={() => setShowPrivacyModal(true)}
            className="hover:text-zinc-300 transition-colors cursor-pointer"
          >
            Privacy Policy
          </button>
        </div>
        <p className="text-[11px] text-zinc-600">
          © 2026 NOOB Social Platform
        </p>
      </footer>

      {/* Terms and Privacy Modals */}
      {showTermsModal && (
        <TermsAndConditions onClose={() => setShowTermsModal(false)} />
      )}
      {showPrivacyModal && (
        <PrivacyPolicy onClose={() => setShowPrivacyModal(false)} />
      )}

      {showBirthdayPicker && (
        <BirthdayWheelPicker
          value={dateOfBirth}
          maxDate={new Date(Date.now() - 13 * 365.25 * 24 * 60 * 60 * 1000)}
          minDate={new Date(Date.now() - 82 * 365.25 * 24 * 60 * 60 * 1000)}
          onClose={() => setShowBirthdayPicker(false)}
          onConfirm={(iso) => {
            setDateOfBirth(iso);
            setShowBirthdayPicker(false);
          }}
        />
      )}

      {/* Forgot Password recovery form — only reachable once the typed
          username was confirmed to exist (handleOpenForgotPassword) */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-sm bg-[#141418] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
              <h3 className="text-sm font-bold text-white">Recover @{forgotUsername}</h3>
              <button
                type="button"
                onClick={() => setShowForgotPassword(false)}
                className="w-8 h-8 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleForgotPasswordSubmit} className="p-4 space-y-3.5 overflow-y-auto">
              <p className="text-xs text-zinc-400 leading-relaxed">
                Enter the mobile number, date of birth, and email on this account. If everything matches, you'll be
                logged straight in — then head to Account Settings to set a new password.
              </p>

              {forgotError && (
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                  {forgotError}
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1.5">Mobile Number</label>
                <input
                  type="tel"
                  required
                  value={forgotMobileNumber}
                  onChange={(e) => setForgotMobileNumber(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full bg-black/40 text-sm text-white px-3.5 py-3 rounded-2xl border border-white/10 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-all placeholder:text-zinc-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1.5">Date of Birth</label>
                <button
                  type="button"
                  onClick={() => setShowForgotBirthdayPicker(true)}
                  className="w-full flex items-center justify-between bg-black/40 text-sm px-3.5 py-3 rounded-2xl border border-white/10 hover:border-cyan-400/60 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-all cursor-pointer text-left"
                >
                  <span className={forgotDateOfBirth ? 'text-white font-medium' : 'text-zinc-500'}>
                    {forgotDateOfBirth
                      ? new Date(forgotDateOfBirth).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
                      : 'Select your date of birth'}
                  </span>
                  <CalendarDays className="w-4 h-4 text-cyan-400 shrink-0" />
                </button>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-300 block mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-black/40 text-sm text-white px-3.5 py-3 rounded-2xl border border-white/10 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 outline-none transition-all placeholder:text-zinc-600"
                />
              </div>

              <button
                type="submit"
                disabled={forgotLoading}
                className="w-full py-3 bg-gradient-to-r from-cyan-400 to-indigo-500 text-black font-bold rounded-2xl cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {forgotLoading ? 'Verifying...' : 'Verify & Log In'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showForgotBirthdayPicker && (
        <BirthdayWheelPicker
          value={forgotDateOfBirth}
          maxDate={new Date(Date.now() - 13 * 365.25 * 24 * 60 * 60 * 1000)}
          minDate={new Date(Date.now() - 82 * 365.25 * 24 * 60 * 60 * 1000)}
          onClose={() => setShowForgotBirthdayPicker(false)}
          onConfirm={(iso) => {
            setForgotDateOfBirth(iso);
            setShowForgotBirthdayPicker(false);
          }}
        />
      )}
    </div>
  );
};

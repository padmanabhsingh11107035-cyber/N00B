import React, { useState, useEffect, useRef } from 'react';
import { useResumeState } from '../../utils/useResumeState';
import { Loader2, Mic, MicOff, PhoneOff, Send, Volume2, VolumeX } from 'lucide-react';
import { createSpeaker } from '../../utils/supportSpeech';
import { useFullPage } from '../../utils/fullPage';
import { useVisibleArea, visibleAreaStyle } from '../../utils/useVisualViewport';
import './supportDesk.css';
import { SupportChatPanel } from './SupportChatPanel';
import { SupportHeader, SupportHub, type SupportScreen } from './SupportHub';
import { SupportRatingSheet } from './SupportRatingSheet';
import { CallPage, FaqPage, ReportPage, TicketPage } from './SupportPages';
import type { Topic } from './supportTopics';

declare const __BUILD_ID__: string;
import { User } from '../../types';
import {
  askAiSupportAssistant, submitSafetyReport, submitSupportReview, fetchSupportRatingSummary, fetchUsers,
  fetchMyWalletTransfers, fetchWalletTransferDetail, submitAppSuggestion
} from '../../services/api';
import type { WalletTransferSummary, WalletTransferDetail } from '../../services/api';
import { formatPaymentId } from '../../utils/formatPoints';
import { wantsToEndSession, goodbyeMessage, goodbyeSpoken } from './supportIntents';
import confetti from 'canvas-confetti';

interface CustomerSupportModalProps {
  currentUser: User;
  onClose: () => void;
  onOpenTerms?: () => void;
  onOpenPrivacy?: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  time: string;
  model?: string;
  // "Payment Issue" quick action: a real, un-invented list of the user's own past NOOB Points payments to
  // pick from, or the full detail of the one they picked.
  transactions?: WalletTransferSummary[];
  transactionDetail?: WalletTransferDetail;
}

export const CustomerSupportModal: React.FC<CustomerSupportModalProps> = ({
  currentUser,
  onClose,
  onOpenTerms,
  onOpenPrivacy
}) => {
  // Support is a page of its own: while it is open the page behind it is hidden (not just covered), and it fills exactly the visible part of the screen (also when the keyboard is up).
  useFullPage(true);
  const visibleArea = useVisibleArea();
  // Opening support always shows the "Need help?" screen with its coloured options; the conversation and anything half-typed survive closing the app or refreshing (see utils/pageResume.ts).
  const [activeSupportTab, setActiveSupportTab] = useState<SupportScreen>('home');
  
  // Voice & Speech Synthesis / Recognition State (Used exclusively for Live Voice Call)
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [currentlySpeakingMsgId, setCurrentlySpeakingMsgId] = useState<string | null>(null);

  // Live Call Simulation & Interactive Speech State
  const [isCallActive, setIsCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callStatus, setCallStatus] = useState<'connecting' | 'connected' | 'ended'>('connected');
  const [callInputText, setCallInputText] = useState('');
  const [isCallProcessing, setIsCallProcessing] = useState(false);
  const [callTranscript, setCallTranscript] = useState<Array<{ sender: 'ai' | 'user'; text: string; time: string }>>([]);
  const [callActiveTopic, setCallActiveTopic] = useState<string>('');
  const [lastAiReply, setLastAiReply] = useState<string>('');
  const [speechSupported, setSpeechSupported] = useState(true);
  // True when the mic has been "listening" for a while with nothing heard at
  // all — some mobile browsers/webviews grant mic permission and report
  // isListening but never deliver a single result, leaving the call stuck
  // silently forever with no way for the user to know voice isn't working.
  const [micStalled, setMicStalled] = useState(false);

  // Post-Chat Review & Rating State (Exclusively for Customer Support)
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [ratingSummary, setRatingSummary] = useState<{ average: number | null; count: number }>({ average: null, count: 0 });
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [isChatEnded, setIsChatEnded] = useState(false);

  // Trust & Safety Report State (Moved from chat)
  const [reportTargetId, setReportTargetId] = useState('');
  const [reportReason, setReportReason] = useResumeState(currentUser.id, 'support', 'reportReason', 'Cyber Bullying & Harassment');
  const [reportDetails, setReportDetails] = useResumeState(currentUser.id, 'support', 'reportDetails', '');
  const [reportSuccessMsg, setReportSuccessMsg] = useState('');
  const [reportErrorMsg, setReportErrorMsg] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Type-ahead for "who am I reporting": opens on focus (showing everyone, newest first, same as an
  // empty search) and narrows as you type — so picking the right account never depends on typing an
  // exact username or ID by hand.
  const [reportSearchOpen, setReportSearchOpen] = useState(false);
  const [reportResults, setReportResults] = useState<User[]>([]);
  const [reportSearching, setReportSearching] = useState(false);
  const reportSearchSeq = useRef(0);
  const reportFieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!reportSearchOpen) return;
    const mine = ++reportSearchSeq.current;
    const q = reportTargetId.trim().replace(/^@/, '');
    setReportSearching(true);
    const t = window.setTimeout(async () => {
      const list = await fetchUsers(q);
      if (mine !== reportSearchSeq.current) return;
      setReportResults(list);
      setReportSearching(false);
    }, q ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [reportTargetId, reportSearchOpen]);

  useEffect(() => {
    if (!reportSearchOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (reportFieldRef.current && !reportFieldRef.current.contains(e.target as Node)) setReportSearchOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [reportSearchOpen]);

  const reportChoices = reportResults.filter((u) => u.id !== currentUser.id).slice(0, 50);

  const pickReportTarget = (u: User) => {
    setReportTargetId(u.username);
    setReportSearchOpen(false);
    if (reportErrorMsg) setReportErrorMsg('');
  };

  const handleSafetyReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportErrorMsg('');
    setReportSearchOpen(false);
    const cleanTarget = reportTargetId.trim().replace(/^@/, '');
    if (!cleanTarget) return;

    if (
      cleanTarget.toLowerCase() === currentUser.username.toLowerCase() ||
      cleanTarget.toLowerCase() === currentUser.id.toLowerCase()
    ) {
      setReportErrorMsg('You cannot report or block your own account!');
      return;
    }

    setIsSubmittingReport(true);
    try {
      const res = await submitSafetyReport({
        targetUserId: cleanTarget,
        reason: reportReason,
        details: reportDetails
      });

      if (res.success) {
        setReportSuccessMsg(res.message || `Account @${cleanTarget} has been reported to Trust & Safety and blocked.`);
        confetti({ particleCount: 35, spread: 55, origin: { y: 0.6 } });
      } else {
        setReportErrorMsg(res.error || 'Account not found. Please verify the User ID or @username.');
      }
    } catch (err: any) {
      setReportErrorMsg(err?.message || 'Failed to submit report. Please check the username and try again.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Messages state with personalized greeting
  const buildGreeting = (): ChatMessage[] => {
    const userGender = (currentUser.gender || '').toLowerCase();
    let greetingTone = `Hey @${currentUser.username}!`;
    if (userGender.includes('female') || userGender.includes('woman') || userGender.includes('she')) {
      greetingTone = `✨ Welcome, ${currentUser.displayName || currentUser.username}!`;
    }
    return [
      {
        id: 'welcome_init',
        sender: 'bot',
        text: `${greetingTone} I am NoobBuddy, your NOOB AI support assistant. I know all about the feed, reels, chat, mini-games and points, music, your wallet, Shop NOOB, and our Terms & Privacy Policy. How can I help you today?`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
  };
  const [messages, setMessages] = useResumeState<ChatMessage[]>(currentUser.id, 'support', 'messages', buildGreeting());

  const [inputMessage, setInputMessage] = useResumeState(currentUser.id, 'support', 'inputMessage', '');
  const [isTyping, setIsTyping] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  // Set the moment someone picks a payment from "Payment Issue" — the very next message they send carries
  // its real details along to the AI (once), so it can actually help with that specific payment instead of
  // guessing or inventing one.
  const [activePaymentContext, setActivePaymentContext] = useState<WalletTransferDetail | null>(null);

  // Ticket form state
  const [ticketSubject, setTicketSubject] = useResumeState(currentUser.id, 'support', 'ticketSubject', '');
  const [ticketCategory, setTicketCategory] = useResumeState(currentUser.id, 'support', 'ticketCategory', 'Account & Verification');
  const [ticketDescription, setTicketDescription] = useResumeState(currentUser.id, 'support', 'ticketDescription', '');
  const [ticketSubmitted, setTicketSubmitted] = useState(false);
  const [ticketSending, setTicketSending] = useState(false);
  const [ticketError, setTicketError] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const callTimerRef = useRef<any>(null);

  // Auto scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Load the real aggregate support rating on open
  useEffect(() => {
    fetchSupportRatingSummary()
      .then(setRatingSummary)
      .catch(() => {});
  }, []);

  // Call timer effect
  useEffect(() => {
    if (isCallActive && callStatus === 'connected') {
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    }
    return () => {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [isCallActive, callStatus]);

  // Clean up SpeechSynthesis on unmount
  const isCallActiveRef = useRef(isCallActive);
  const isMutedRef = useRef(isMuted);
  const isSpeakingRef = useRef(isSpeaking);
  const isCallProcessingRef = useRef(isCallProcessing);
  const silenceTimerRef = useRef<any>(null);
  const micPermissionDeniedRef = useRef(false);
  const stallTimerRef = useRef<any>(null);
  const stalledStopRef = useRef(false);
  // The CURRENT value of the two voice switches. A function made earlier (for example the microphone's "I heard you" callback, which lives for the whole
  // listening session) must see today's choice, not the one from the moment it was made: that is why "voice off" did not always mean off, or on.
  const voiceEnabledRef = useRef(voiceEnabled);
  const isSpeakerOnRef = useRef(isSpeakerOn);
  voiceEnabledRef.current = voiceEnabled;
  isSpeakerOnRef.current = isSpeakerOn;
  const speakerRef = useRef<ReturnType<typeof createSpeaker> | null>(null);
  // shown in small print on the call screen: which voice is speaking, and which version of the app this phone is running (so a stale app is easy to spot)
  const [voiceInfo, setVoiceInfo] = useState('');
  const appVersion = (() => { try { return new Date(Number(__BUILD_ID__)).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); } catch { return ''; } })();
  // window.speechSynthesis.getVoices() famously returns an empty list until the browser has
  // finished loading its voice roster asynchronously — if speakText() calls it too early (which
  // it did, right when the call greeting fires), no voice ever gets chosen and the browser falls
  // back to its raw default, which on many platforms reads text in a flat, robotic, word-by-word
  // way with none of a real voice's natural pacing. Pre-warming this as soon as the support modal
  // opens gives the list real human time (opening the modal, then tapping "Start Call") to load
  // before it's ever needed, so even the very first thing spoken gets a proper voice.
  const cachedVoicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const loadVoices = () => {
      const list = window.speechSynthesis.getVoices();
      if (list.length) cachedVoicesRef.current = list;
    };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  useEffect(() => {
    isCallActiveRef.current = isCallActive;
  }, [isCallActive]);

  useEffect(() => {
    isMutedRef.current = isMuted;
    if (isMuted && isListening) {
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
      stalledStopRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsListening(false);
    } else if (!isMuted && isCallActive && !isSpeaking && !isCallProcessing && !isListening) {
      startVoiceListening();
    }
  }, [isMuted]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    isCallProcessingRef.current = isCallProcessing;
  }, [isCallProcessing]);

  useEffect(() => {
    return () => {
      speakerRef.current?.stop();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, []);

  // Puts the microphone fully OFF. On an iPhone (and on some Androids) the voice can not be heard properly while the microphone is listening: the phone
  // switches to "phone call" sound and the answer goes to the earpiece, very quietly, or not at all. That is why it only spoke once the microphone had been
  // muted. So the microphone is switched off BEFORE the assistant speaks, and switched on again when it has finished.
  const stopMicNow = () => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
    stalledStopRef.current = false;
    const rec = recognitionRef.current;
    if (rec) {
      rec.onresult = null;   // an old listening session must never answer, or restart itself, after this
      rec.onend = null;
      try { if (rec.abort) rec.abort(); else rec.stop(); } catch (e) {}
    }
    recognitionRef.current = null;
    setIsListening(false);
  };
  // iPhone Safari (16.4 and newer) lets a page say what the sound is for: "playback" makes the voice come out of the loudspeaker at full volume, "auto"
  // goes back to normal for listening. Phones that do not have it simply ignore this.
  const setAudioMode = (mode: 'playback' | 'auto') => {
    try { const a = (navigator as any).audioSession; if (a) a.type = mode; } catch (e) {}
  };
  const resumeListeningSoon = (ms = 450) => {
    setTimeout(() => {
      if (isCallActiveRef.current && !isMutedRef.current && !isCallProcessingRef.current && !isSpeakingRef.current) startVoiceListening();
    }, ms);
  };

  // The assistant's voice: a woman's voice, the most natural one this phone has for the language of each sentence (Hindi in Hindi, English in the Indian
  // accent), said sentence by sentence with small pauses, and with no punctuation ever read out aloud (see utils/supportSpeech.ts).
  const speakText = (text: string, msgId?: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    speakerRef.current?.stop();
    window.speechSynthesis.cancel();
    if (!voiceEnabledRef.current) return;
    if (!speakerRef.current) {
      speakerRef.current = createSpeaker({
        synth: window.speechSynthesis as any,
        Utterance: (window as any).SpeechSynthesisUtterance,
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (id) => window.clearTimeout(id as number)
      });
    }
    // the very first thing said in a call (the greeting) is said at once, inside the tap that started the call; later answers wait a moment
    // after the microphone has been switched off, so the phone has time to change its sound over
    const delay = recognitionRef.current ? 700 : 0;
    stopMicNow();
    setAudioMode('playback');
    isSpeakingRef.current = true;           // no listening session may start while the answer is being said
    setIsSpeaking(true);
    if (msgId) setCurrentlySpeakingMsgId(msgId);
    speakerRef.current.speak(text, {
      startDelayMs: delay,
      lang: 'en-IN',
      onVoice: (v) => setVoiceInfo(`${v.name} (${v.lang})`),
      onEnd: () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        setCurrentlySpeakingMsgId(null);
        setAudioMode('auto');
        if (isCallActiveRef.current && !isMutedRef.current && !isCallProcessingRef.current) resumeListeningSoon(400);   // listen again
      }
    });
  };

  const stopSpeaking = () => {
    speakerRef.current?.stop();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
    setIsSpeaking(false);
    setCurrentlySpeakingMsgId(null);
  };
  // the person silences the voice in the middle of a call: stop talking, and listen again
  const interruptSpeech = () => {
    stopSpeaking();
    if (isCallActiveRef.current && !isMutedRef.current && !isCallProcessingRef.current) resumeListeningSoon(400);
  };

  // Continuous speech recognition for hands-free AI voice calling
  const startVoiceListening = () => {
    if (isMutedRef.current || isSpeakingRef.current || isCallProcessingRef.current) {
      return;
    }

    if (micPermissionDeniedRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API not available');
      setSpeechSupported(false);
      return;
    }

    // Give up on a listening session that never hears anything, instead of
    // sitting in "Listening..." forever with no feedback — some mobile
    // browsers/webviews grant mic permission and fire onstart but never
    // deliver a single onresult (no audio actually reaches the recognition
    // service). Re-armed on every result so mid-sentence pauses don't trip it.
    const armStallTimer = () => {
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      stallTimerRef.current = setTimeout(() => {
        stalledStopRef.current = true;
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (e) {}
        }
      }, 9000);
    };

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';

      recognition.onstart = () => {
        setIsListening(true);
        setMicStalled(false);
        armStallTimer();
      };

      recognition.onresult = (event: any) => {
        if (!isCallActiveRef.current || isMutedRef.current || isSpeakingRef.current) return;
        let transcript = '';
        let hasFinal = false;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            hasFinal = true;
          }
        }

        const trimmed = transcript.trim();
        if (trimmed) {
          setMicStalled(false);
          armStallTimer();
          setCallInputText(trimmed);

          // Clear any active silence timer
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
          }

          // Automatically send user query once speech concludes
          const delay = hasFinal ? 700 : 1300;
          silenceTimerRef.current = setTimeout(() => {
            if (trimmed && isCallActiveRef.current && !isCallProcessingRef.current && !isSpeakingRef.current) {
              handleAskCallQuestion(trimmed);
            }
          }, delay);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition warning:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          micPermissionDeniedRef.current = true;
          setIsListening(false);
        } else if (event.error === 'audio-capture') {
          // No microphone hardware detected — stop retrying
          micPermissionDeniedRef.current = true;
          setSpeechSupported(false);
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        if (stallTimerRef.current) {
          clearTimeout(stallTimerRef.current);
          stallTimerRef.current = null;
        }
        if (stalledStopRef.current) {
          // We stopped this one ourselves because it never heard anything —
          // surface that to the user instead of silently restarting into
          // another identical, doomed listening loop.
          stalledStopRef.current = false;
          setMicStalled(true);
          return;
        }
        // Always spin up a brand-new recognition instance rather than
        // restarting this one: Chrome's continuous SpeechRecognition is
        // known to silently stop delivering results after a restart on the
        // same instance, even though the mic indicator stays lit. A fresh
        // instance each cycle avoids that "mic on, nothing heard" state.
        if (
          isCallActiveRef.current &&
          !isMutedRef.current &&
          !isSpeakingRef.current &&
          !isCallProcessingRef.current &&
          !micPermissionDeniedRef.current
        ) {
          setTimeout(() => startVoiceListening(), 250);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  // Speech Recognition Toggle for manual override
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsListening(false);
      return;
    }
    startVoiceListening();
  };

  // The person asked to end the chat (or the assistant understood that they did): the session ends and the 5-star review opens.
  const finishChatByRequest = () => {
    stopSpeaking();
    setIsChatEnded(true);
    setTimeout(() => setShowReviewModal(true), 1400);
  };

  // Send message to AI Support (Chat assistant does NOT speak, purely text)
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || isTyping) return;

    const userText = inputMessage.trim();
    const userMsgId = `msg_user_${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: userText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    const paymentContext = activePaymentContext;
    setActivePaymentContext(null);
    const messageForAssistant = paymentContext
      ? `[Regarding payment ${formatPaymentId(paymentContext.transferId)}: ${paymentContext.direction === 'sent' ? 'sent' : 'received'} ${paymentContext.amount.toLocaleString()} NOOB Points ${paymentContext.direction === 'sent' ? 'to' : 'from'} @${paymentContext.otherParty.username} on ${new Date(paymentContext.createdAt).toLocaleString()}]\n${userText}`
      : userText;

    // "end chat", "bye", ...: say goodbye, ask for the 5-star review, and end the session (no need to ask the AI)
    if (wantsToEndSession(userText)) {
      setMessages((prev) => [
        ...prev,
        { id: `msg_bot_${Date.now()}`, sender: 'bot', text: goodbyeMessage(currentUser.username, 'chat'), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      ]);
      finishChatByRequest();
      return;
    }

    setIsTyping(true);
    setErrorMessage('');

    try {
      const history = messages.map((m) => ({ sender: m.sender, text: m.text }));
      const response = await askAiSupportAssistant(messageForAssistant, history);

      if (response && response.reply) {
        const botMsgId = `msg_bot_${Date.now()}`;
        const botMsg: ChatMessage = {
          id: botMsgId,
          sender: 'bot',
          text: response.reply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          model: response.model
        };

        setMessages((prev) => [...prev, botMsg]);
        // (the assistant understood a request to end the chat in another language)
        if (response.action === 'END_SESSION') finishChatByRequest();
        // Note: Chat assistant does NOT speak aloud; voice is strictly reserved for Voice Calls
      } else {
        throw new Error(response.error || 'Failed to get answer');
      }
    } catch (err: any) {
      console.error('AI Support error:', err);
      const fallbackMsg: ChatMessage = {
        id: `msg_bot_${Date.now()}`,
        sender: 'bot',
        text: `Hey @${currentUser.username}! I am your official NOOB Support Assistant. I can help with every part of NOOB: the feed, reels, chat, mini-games (+10M win / +5M tie points), the music hub, your profile and settings, your wallet and NOOB Pro, Shop NOOB (real products, delivered or picked up), and our Terms & Conditions & Privacy Policy!`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  // "Payment Issue" quick action — a real, un-invented list of the person's own NOOB Points payments to
  // pick from. Never goes through the AI: fetched straight from the wallet, so there is nothing to hallucinate.
  const handlePaymentIssueQuickAction = async () => {
    if (loadingTransactions) return;
    setLoadingTransactions(true);
    try {
      const res = await fetchMyWalletTransfers(20);
      const text = res.transfers.length
        ? 'Here are your recent NOOB Points payments — tap the one you need help with.'
        : "You don't have any NOOB Points payments yet — nothing to show here.";
      setMessages((prev) => [
        ...prev,
        { id: `msg_bot_${Date.now()}`, sender: 'bot', text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), transactions: res.transfers }
      ]);
    } finally {
      setLoadingTransactions(false);
    }
  };

  // Picking one payment from that list: show its full detail, then ask what went wrong — the reply to
  // that question carries the same real detail along to the AI (see handleSendMessage above).
  const handleSelectTransaction = async (t: WalletTransferSummary) => {
    const res = await fetchWalletTransferDetail(t.transferId);
    if (!res.success || !res.transfer) {
      setMessages((prev) => [
        ...prev,
        { id: `msg_bot_${Date.now()}`, sender: 'bot', text: res.error || 'Could not load that payment.', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      ]);
      return;
    }
    setActivePaymentContext(res.transfer);
    setMessages((prev) => [
      ...prev,
      {
        id: `msg_bot_${Date.now()}`,
        sender: 'bot',
        text: 'What\'s the issue with this payment?',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        transactionDetail: res.transfer
      }
    ]);
  };

  // Quick prompt chip clicked
  const handleQuickPrompt = (prompt: string) => {
    setInputMessage(prompt);
    setTimeout(() => {
      const form = document.getElementById('ai-support-form') as HTMLFormElement;
      if (form) {
        form.requestSubmit();
      }
    }, 50);
  };

  const handleStartCall = () => {
    // iOS Safari (and other strict browsers) only allow speechSynthesis to
    // produce audio when triggered directly within a user gesture. Any
    // `await` before the first speak() call breaks that chain and causes
    // audio to fail silently forever after — including every reply for the
    // rest of the call, since AI replies are generated asynchronously too.
    // Fix: fire a silent "unlock" utterance synchronously, right here,
    // before anything else runs. This primes the engine for the whole
    // call session, so later async-triggered speech keeps working.
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const unlock = new SpeechSynthesisUtterance('');
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
    }

    setIsCallActive(true);
    setCallStatus('connected');
    setCallDuration(0);
    setIsMuted(false);
    micPermissionDeniedRef.current = false;
    stalledStopRef.current = false;
    setSpeechSupported(true);
    setMicStalled(false);

    const greeting = `Hello @${currentUser.username}! This is the NOOB AI voice assistant. I'm listening, so please tell me what you need help with.`;
    setCallTranscript([
      {
        sender: 'ai',
        text: greeting,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setLastAiReply(greeting);
    // Speak the greeting BEFORE anything else — any `await` here would break
    // the user-gesture chain that unlocked speechSynthesis above.
    speakText(greeting);
    if (!voiceEnabledRef.current) resumeListeningSoon(300);   // the voice is switched off: no greeting to wait for, just listen

    // Note: we deliberately do NOT call getUserMedia() here. SpeechRecognition
    // requests and manages its own microphone access internally — grabbing a
    // second, unused raw MediaStream in parallel held the mic device open for
    // the whole call and could starve SpeechRecognition of exclusive access,
    // which showed up as "the mic indicator is on but nothing is transcribed."
    // speakText() itself now guarantees the mic reopens once the greeting is done (event-driven,
    // with a polling backstop), so no separate fallback timer is needed here.
  };

  // The person asked to end the call (or the assistant understood that they did): say goodbye out loud (asking for the 5-star review),
  // wait until it has been said, then hang up; the review opens by itself when the call ends.
  const endCallByRequest = (speak: boolean) => {
    if (!speak) {
      setTimeout(() => handleEndCall(), 1800);
      return;
    }
    let waited = 0;
    setTimeout(() => {
      const timer = setInterval(() => {
        waited += 250;
        if (!isSpeakingRef.current || waited > 13000) {
          clearInterval(timer);
          handleEndCall();
        }
      }, 250);
    }, 900);
  };

  // Submit and answer an issue live during the voice call
  const handleAskCallQuestion = async (queryText: string) => {
    if (!queryText.trim() || isCallProcessingRef.current) return;
    const cleanQuery = queryText.trim();
    setCallInputText('');
    isCallProcessingRef.current = true;
    stopMicNow();             // the microphone is off while the answer is fetched and said (see stopMicNow)
    setIsCallProcessing(true);
    setMicStalled(false);

    const userEntry = {
      sender: 'user' as const,
      text: cleanQuery,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setCallTranscript((prev) => [...prev, userEntry]);

    // "end call", "hang up", "bye", ...: say goodbye (asking for the 5-star review) and hang up
    if (wantsToEndSession(cleanQuery)) {
      const text = goodbyeMessage(currentUser.username, 'call');
      setCallTranscript((prev) => [...prev, { sender: 'ai' as const, text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }]);
      setLastAiReply(text);
      const speak = isSpeakerOnRef.current && voiceEnabledRef.current;
      if (speak) speakText(goodbyeSpoken(currentUser.username));
      isCallProcessingRef.current = false;
      setIsCallProcessing(false);
      endCallByRequest(speak);
      return;
    }

    try {
      const history = callTranscript.map((t) => ({ sender: t.sender === 'ai' ? 'bot' : 'user', text: t.text }));
      const response = await askAiSupportAssistant(cleanQuery, history, 'call');

      const aiReply = response?.reply || `Sorry, I couldn't find an answer to that just now. Could you please ask me again, in a few different words?`;
      
      const aiEntry = {
        sender: 'ai' as const,
        text: aiReply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setCallTranscript((prev) => [...prev, aiEntry]);
      setLastAiReply(aiReply);

      if (isSpeakerOnRef.current && voiceEnabledRef.current) {
        speakText(aiReply);
      } else if (response?.action !== 'END_SESSION') {
        resumeListeningSoon();        // nothing to say out loud: just listen again
      }
      // (the assistant understood a request to end the call in another language)
      if (response?.action === 'END_SESSION') endCallByRequest(isSpeakerOnRef.current && voiceEnabledRef.current);
    } catch (err) {
      const fallbackReply = `Sorry, I couldn't reach the support service just now. Please check your internet connection, and then ask me again.`;
      setCallTranscript((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: fallbackReply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setLastAiReply(fallbackReply);
      if (isSpeakerOnRef.current && voiceEnabledRef.current) speakText(fallbackReply);
      else resumeListeningSoon();
    } finally {
      isCallProcessingRef.current = false;
      setIsCallProcessing(false);
    }
  };

  const handleEndCall = () => {
    stopSpeaking();
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
    }
    stalledStopRef.current = false;
    setMicStalled(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setIsListening(false);
    setCallStatus('ended');
    setTimeout(() => {
      setIsCallActive(false);
      setCallDuration(0);
      setCallTranscript([]);
      setShowReviewModal(true); // Automatically open 5-star review modal upon call conclusion
    }, 450);
  };

  // A ticket is saved in the NOOB team's Suggestion Box (as an "issue"): the administrator reads it there and answers, and the answer shows in the person's Suggestion Box.
  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const subject = ticketSubject.trim();
    const description = ticketDescription.trim();
    if (!subject || !description || ticketSending) return;
    if (description.length < 5) { setTicketError('Please write a little more (at least 5 characters).'); return; }
    setTicketSending(true);
    setTicketError('');
    const res = await submitAppSuggestion('issue', `[Support ticket - ${ticketCategory}]
${subject}

${description}`.slice(0, 2000));
    setTicketSending(false);
    if (!res.success) { setTicketError(res.error || 'Could not send that right now. Please try again.'); return; }
    setTicketSubmitted(true);
    confetti({ particleCount: 35, spread: 65, origin: { y: 0.6 } });
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const FAQs = [
    {
      q: 'What are the official Terms & Conditions on NOOB?',
      a: 'Users must be 13+ years old. NOOB has zero tolerance for hate speech, harassment, spam, and copyright infringement. You retain 100% ownership of your original photos and videos while granting NOOB a hosting license to display them.'
    },
    {
      q: 'What is the Privacy Policy regarding personal data & storage?',
      a: 'NOOB NEVER sells your data. All media files are encrypted in secure cloud storage. You have full GDPR/CCPA rights to edit your details, set your account to Private, or delete your account anytime.'
    },
    {
      q: 'How does automated media routing work?',
      a: 'When you upload files, our automated MIME analyzer checks format: Photos (.jpg, .png, .webp) route to the Feed & Profile, videos (.mp4, .mov, .webm) route to Reels, and audio (.mp3, .wav) routes to Music Hub.'
    },
    {
      q: 'How do Story Highlights work?',
      a: 'Click "+ New" on your Profile page. You can name your highlight, and the first uploaded photo automatically becomes its circular cover icon. You can edit existing highlights anytime to add more photos and videos.'
    },
    {
      q: 'How do I earn NOOB points & climb the Leaderboard?',
      a: 'Play any of our Mini-Games! Winning an arcade match awards +10,000,000 NOOB points, and tying awards +5,000,000 NOOB points. Your rank updates in real-time on the Global Leaderboard.'
    },
    {
      q: 'Does Shop NOOB sell real products, and how do I order?',
      a: 'Yes. Shop NOOB sells real, physical products (like mugs and sticker sheets) priced in rupees. Open it from Profile → the ⋮ menu → Shop NOOB, add items to your cart, and check out with Pickup or Delivery. There is no online payment: you pay when you pick the order up or when it is delivered. You can follow your order under Orders, and cancel it yourself until the shop confirms it.'
    },
    {
      q: 'Can I use NOOB in my own language?',
      a: 'Yes. Choose your language on the sign-up or login page, or later from Profile → the ⋮ menu → Language. Menus, buttons and messages switch to it; posts, reels and what people write stay as they were written. In a chat, tap the globe icon on a message to translate it into your language.'
    },
    {
      q: 'How does background music work?',
      a: 'When you start playing any track from the Community Music Hub, it keeps playing smoothly across the entire app as you browse Feeds, watch Reels, chat, or play mini-games without stopping.'
    }
  ];

  // ---- what the person picks on the "Need help?" screen
  const openChatWith = (prompt: string) => {
    setActiveSupportTab('ai_chat');
    window.setTimeout(() => handleQuickPrompt(prompt), 160);
  };
  const openPaymentHelp = () => {
    setActiveSupportTab('ai_chat');
    void handlePaymentIssueQuickAction();
  };
  const handleTopic = (t: Topic) => {
    if (t.action === 'payment') openPaymentHelp();
    else if (t.action === 'report') setActiveSupportTab('safety_report');
    else if (t.prompt) openChatWith(t.prompt);
  };
  const leaveTo = (open?: () => void) => () => { onClose(); open?.(); };

  const endChatNow = () => { stopSpeaking(); setIsChatEnded(true); setShowReviewModal(true); };
  const startNewConversation = () => {
    stopSpeaking();
    setMessages(buildGreeting());
    setInputMessage('');
    setIsChatEnded(false);
    setReviewSubmitted(false);
    setShowReviewModal(false);
    setActivePaymentContext(null);
  };
  const submitReview = (rating: number, feedback: string) => {
    setReviewSubmitted(true);
    if (rating >= 4) confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
    submitSupportReview(rating, feedback)
      .then((res) => { if (res && typeof res.average === 'number') setRatingSummary({ average: res.average, count: res.count }); })
      .catch(() => {});
    window.setTimeout(() => { setShowReviewModal(false); setActiveSupportTab('home'); }, 1600);
  };

  const onBack = () => { if (activeSupportTab === 'home') onClose(); else setActiveSupportTab('home'); };
  const TITLES: Record<SupportScreen, string> = { home: 'Help & Support', ai_chat: 'NOOB Support', call_us: 'Call us', safety_report: 'Report someone', ticket: 'Raise a ticket', faq: 'FAQs' };

  const callStatus2: { cls: string; icon: React.ReactNode; text: string } = !speechSupported
    ? { cls: 'warn', icon: <MicOff />, text: 'Voice input is not available. Type below.' }
    : isMuted
    ? { cls: 'bad', icon: <MicOff />, text: 'Microphone is muted' }
    : isSpeaking
    ? { cls: 'ok', icon: <Volume2 />, text: 'Speaking...' }
    : isCallProcessing
    ? { cls: 'warn', icon: <Loader2 className="animate-spin" />, text: 'Thinking...' }
    : isListening
    ? { cls: 'ok', icon: <Mic />, text: 'Listening... speak now' }
    : micStalled
    ? { cls: 'warn', icon: <MicOff />, text: "Didn't catch that. Type your question below." }
    : { cls: '', icon: <Mic />, text: 'Microphone ready' };
  const callActive = isSpeaking || (isListening && !isMuted) || isCallProcessing;

  return (
    <div className="fixed inset-0 z-50 sd-root" style={visibleAreaStyle(visibleArea)} data-testid="support-page">
      <div className="sd-panel">
        {/* The bar on top: back (to the options, or out of help from the options), and who is helping in the chat */}
        {activeSupportTab === 'ai_chat' ? (
          <SupportHeader
            title="NOOB Support"
            subtitle="AI support executive"
            avatar="/noob-support-logo.png"
            onBack={onBack}
            right={(
              <>
                <button
                  type="button"
                  className="sd-icon-btn"
                  onClick={() => { if (voiceEnabled) interruptSpeech(); setVoiceEnabled(!voiceEnabled); }}
                  aria-label={voiceEnabled ? 'Turn the assistant voice off' : 'Turn the assistant voice on'}
                  title={voiceEnabled ? 'Voice on' : 'Voice off'}
                  data-testid="support-voice-toggle"
                >
                  {voiceEnabled ? <Volume2 /> : <VolumeX />}
                </button>
                {!isChatEnded && <button type="button" className="sd-head-link red" onClick={endChatNow} data-testid="support-end">End chat</button>}
              </>
            )}
          />
        ) : (
          <SupportHeader title={TITLES[activeSupportTab]} onBack={onBack} />
        )}

        {activeSupportTab === 'home' && (
          <SupportHub
            username={currentUser.username}
            rating={ratingSummary}
            onOpen={setActiveSupportTab}
            onPayment={openPaymentHelp}
            onTopic={handleTopic}
            onOpenTerms={onOpenTerms ? leaveTo(onOpenTerms) : undefined}
            onOpenPrivacy={onOpenPrivacy ? leaveTo(onOpenPrivacy) : undefined}
          />
        )}

        {activeSupportTab === 'ai_chat' && (
          <SupportChatPanel
            messages={messages}
            isTyping={isTyping}
            inputMessage={inputMessage}
            setInputMessage={setInputMessage}
            onSend={handleSendMessage}
            onQuickPrompt={handleQuickPrompt}
            onPaymentIssue={handlePaymentIssueQuickAction}
            loadingTransactions={loadingTransactions}
            onReport={() => setActiveSupportTab('safety_report')}
            isChatEnded={isChatEnded}
            reviewSubmitted={reviewSubmitted}
            onOpenReview={() => setShowReviewModal(true)}
            onNewConversation={startNewConversation}
            onSelectTransaction={handleSelectTransaction}
            speakText={speakText}
            stopSpeaking={stopSpeaking}
            speakingId={currentlySpeakingMsgId}
            ratingOpen={showReviewModal}
          />
        )}

        {activeSupportTab === 'call_us' && <CallPage username={currentUser.username} onStart={handleStartCall} />}

        {activeSupportTab === 'faq' && <FaqPage faqs={FAQs} onOpenTerms={onOpenTerms ? leaveTo(onOpenTerms) : undefined} onOpenPrivacy={onOpenPrivacy ? leaveTo(onOpenPrivacy) : undefined} />}

        {activeSupportTab === 'safety_report' && (
          <ReportPage
            targetId={reportTargetId} setTargetId={setReportTargetId}
            reason={reportReason} setReason={setReportReason}
            details={reportDetails} setDetails={setReportDetails}
            successMsg={reportSuccessMsg} errorMsg={reportErrorMsg} clearError={() => { if (reportErrorMsg) setReportErrorMsg(''); }} submitting={isSubmittingReport}
            searchOpen={reportSearchOpen} setSearchOpen={setReportSearchOpen} searching={reportSearching} choices={reportChoices} onPick={pickReportTarget}
            fieldRef={reportFieldRef}
            onSubmit={handleSafetyReportSubmit}
            onAnother={() => { setReportSuccessMsg(''); setReportErrorMsg(''); setReportTargetId(''); setReportDetails(''); }}
          />
        )}

        {activeSupportTab === 'ticket' && (
          <TicketPage
            category={ticketCategory} setCategory={setTicketCategory}
            subject={ticketSubject} setSubject={setTicketSubject}
            description={ticketDescription} setDescription={setTicketDescription}
            sending={ticketSending} error={ticketError} sent={ticketSubmitted}
            onSubmit={handleTicketSubmit}
            onAnother={() => { setTicketSubmitted(false); setTicketSubject(''); setTicketDescription(''); setTicketError(''); }}
          />
        )}

        {/* "How would you like to rate my assistance?": the five faces, when a chat or a call ends */}
        {showReviewModal && (
          <SupportRatingSheet
            flat={activeSupportTab === 'ai_chat'}
            submitted={reviewSubmitted}
            onSkip={() => setShowReviewModal(false)}
            onSubmit={submitReview}
          />
        )}
      </div>

      {/* The live voice call: a full screen of its own */}
      {isCallActive && (
        <div className="sd-call" data-testid="support-call">
          <div className="sd-call-top">
            <div className="sd-call-who">
              <img src="/noob-support-logo.png" alt="" />
              <div><strong>NOOB AI voice support</strong><span>Connected to @{currentUser.username}</span></div>
            </div>
            <span className="sd-call-time">{formatDuration(callDuration)}</span>
          </div>

          <div className="sd-call-mid">
            <div className={`sd-call-pic ${isSpeaking || isListening ? 'live' : ''}`}><img src="/noob-support-logo.png" alt="" /></div>
            <div className={`sd-call-status ${callStatus2.cls}`}>{callStatus2.icon}{callStatus2.text}</div>

            <div className={`sd-bars ${callActive ? '' : 'idle'}`} aria-hidden="true">
              {[12, 22, 10, 30, 16, 26, 12, 20, 32, 14, 28, 18, 24, 10, 22, 30, 14, 20].map((height, i) => (
                <i key={i} className={callActive ? 'animate-pulse' : ''} style={{ height: `${isSpeaking ? height : (isListening && !isMuted) || isCallProcessing ? Math.max(8, height * 0.7) : 4}px` }} />
              ))}
            </div>

            {/* what is being said right now (a call is not kept as a chat log) */}
            <div className={`sd-call-cap ${isSpeaking && lastAiReply ? '' : callInputText && isListening ? 'you' : 'small'}`}>
              {isSpeaking && lastAiReply ? <p className="line-clamp-3">{lastAiReply}</p> : callInputText && isListening ? <p>"{callInputText}"</p> : <p>This call is not recorded as a chat log. Just speak naturally.</p>}
            </div>
            <p className="sd-call-fine" data-testid="voice-info">Voice: {voiceInfo || 'not used yet'}{appVersion ? ` · App version ${appVersion}` : ''}</p>
          </div>

          <div className="sd-call-bottom">
            <div className="sd-call-type">
              <div className="box">
                <input
                  type="text"
                  value={callInputText}
                  onChange={(e) => setCallInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && callInputText.trim()) { e.preventDefault(); handleAskCallQuestion(callInputText); } }}
                  placeholder="Speak, or type your question..."
                  aria-label="Type your question"
                />
                <button type="button" className={`micbtn ${isListening ? 'on' : ''}`} onClick={toggleListening} disabled={!speechSupported} aria-label={isListening ? 'Stop listening' : 'Start voice input'} title={!speechSupported ? 'Voice input is not supported here' : isListening ? 'Stop listening' : 'Start voice input'}>
                  {isListening ? <Mic /> : <MicOff />}
                </button>
              </div>
              <button type="button" className="sd-call-solve" disabled={!callInputText.trim() || isCallProcessing} onClick={() => handleAskCallQuestion(callInputText)}><Send />Ask</button>
            </div>

            <div className="sd-call-btns">
              <button type="button" className={`sd-round ${isMuted ? 'on' : ''}`} onClick={() => setIsMuted(!isMuted)} aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'} title={isMuted ? 'Unmute microphone' : 'Mute microphone'}>
                {isMuted ? <MicOff /> : <Mic />}
              </button>
              <button type="button" className="sd-hang" onClick={handleEndCall} title="End the call and rate it" data-testid="support-end-call"><PhoneOff />End call</button>
              <button type="button" className={`sd-round ${isSpeakerOn ? 'sp' : ''}`} onClick={() => { const on = !isSpeakerOn; setIsSpeakerOn(on); if (!on) interruptSpeech(); }} aria-label={isSpeakerOn ? 'Speaker on' : 'Speaker off'} title={isSpeakerOn ? 'Speaker on' : 'Speaker off'}>
                {isSpeakerOn ? <Volume2 /> : <VolumeX />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

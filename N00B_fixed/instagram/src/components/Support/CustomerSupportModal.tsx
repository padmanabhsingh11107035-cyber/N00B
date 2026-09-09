import React, { useState, useEffect, useRef } from 'react';
import {
  Headphones,
  Bot,
  MessageSquare,
  Send,
  Sparkles,
  HelpCircle,
  CheckCircle2,
  X,
  FileText,
  ShieldCheck,
  Check,
  Zap,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  RotateCcw,
  User as UserIcon,
  ShieldAlert,
  Crown,
  Phone,
  PhoneCall,
  PhoneOff,
  PhoneForwarded,
  Clock,
  Radio,
  ExternalLink,
  Star,
  LogOut
} from 'lucide-react';
import { User } from '../../types';
import { askAiSupportAssistant, submitSafetyReport, submitSupportReview, fetchSupportRatingSummary } from '../../services/api';
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
}

export const CustomerSupportModal: React.FC<CustomerSupportModalProps> = ({
  currentUser,
  onClose,
  onOpenTerms,
  onOpenPrivacy
}) => {
  const [activeSupportTab, setActiveSupportTab] = useState<'ai_chat' | 'call_us' | 'safety_report' | 'ticket' | 'faq'>('ai_chat');
  
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
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [ratingSummary, setRatingSummary] = useState<{ average: number | null; count: number }>({ average: null, count: 0 });
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [isChatEnded, setIsChatEnded] = useState(false);

  // Trust & Safety Report State (Moved from chat)
  const [reportTargetId, setReportTargetId] = useState('');
  const [reportReason, setReportReason] = useState('Cyber Bullying & Harassment');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSuccessMsg, setReportSuccessMsg] = useState('');
  const [reportErrorMsg, setReportErrorMsg] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const handleSafetyReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReportErrorMsg('');
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
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const userGender = (currentUser.gender || '').toLowerCase();
    let greetingTone = `Hey @${currentUser.username}!`;
    if (userGender.includes('female') || userGender.includes('woman') || userGender.includes('she')) {
      greetingTone = `✨ Welcome, ${currentUser.displayName || currentUser.username}!`;
    }
    return [
      {
        id: 'welcome_init',
        sender: 'bot',
        text: `${greetingTone} I am your official NOOB AI Support Assistant. I have instant, complete knowledge of all 50 mini-games, leaderboard scoring, continuous background music, automated feed/reels routing, and our full Terms & Conditions & Privacy Policy. How can I help you today?`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ];
  });

  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Ticket form state
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketCategory, setTicketCategory] = useState('Account & Verification');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketSubmitted, setTicketSubmitted] = useState(false);
  const [ticketId, setTicketId] = useState('');

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

  // Soft Indian-accented FEMALE TTS narrator (used in the voice call)
  const speakText = (text: string, msgId?: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    if (!voiceEnabled) return;

    // Clean emojis and markdown characters for clear speech
    const cleanSpeech = text
      .replace(/[#*_`~🎮✨🎵📸🔐👋✏️💬🛡️👑•]/g, '')
      .replace(/@\w+/g, (match) => match.replace('@', 'at '))
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    // Soft, gentle conversational cadence
    utterance.rate = 0.94;
    utterance.pitch = 1.08;
    utterance.volume = 0.88;

    const voices = window.speechSynthesis.getVoices();
    const isIndian = (v: SpeechSynthesisVoice) =>
      v.lang === 'en-IN' || v.lang.startsWith('hi') || v.name.toLowerCase().includes('india') || v.name.toLowerCase().includes('hindi');
    // Only unambiguous female names/markers — "Ravi" and "Prabhat" (both
    // common male Indian names) were previously in this list by mistake,
    // which could silently pick a male voice.
    const FEMALE_NAMES = [
      'heera', 'veena', 'lekha', 'neerja', 'kavya', 'samantha', 'victoria', 'karen', 'moira', 'tessa',
      'fiona', 'susan', 'zira', 'aria', 'jenny', 'salli', 'joanna', 'kendra', 'kimberly', 'ivy', 'zoe',
      'emma', 'amy', 'nicole', 'female'
    ];
    const isFemale = (v: SpeechSynthesisVoice) => {
      const n = v.name.toLowerCase();
      return FEMALE_NAMES.some((name) => n.includes(name));
    };
    const isMale = (v: SpeechSynthesisVoice) => v.name.toLowerCase().includes('male') && !isFemale(v);

    const englishVoices = voices.filter((v) => v.lang.startsWith('en') || isIndian(v));
    const chosenVoice =
      englishVoices.find((v) => isIndian(v) && isFemale(v) && !isMale(v)) ||
      englishVoices.find((v) => isFemale(v) && !isMale(v)) ||
      englishVoices.find((v) => isIndian(v) && !isMale(v)) ||
      englishVoices.find((v) => !isMale(v)) ||
      englishVoices[0];

    if (chosenVoice) {
      utterance.voice = chosenVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      if (msgId) setCurrentlySpeakingMsgId(msgId);
      // Pause microphone listening so AI does not transcribe its own audio output
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsListening(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setCurrentlySpeakingMsgId(null);
      // Auto-resume microphone listening after AI finishes speaking
      if (isCallActiveRef.current && !isMutedRef.current && !isCallProcessingRef.current) {
        setTimeout(() => {
          startVoiceListening();
        }, 400);
      }
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      setCurrentlySpeakingMsgId(null);
      if (isCallActiveRef.current && !isMutedRef.current) {
        setTimeout(() => {
          startVoiceListening();
        }, 400);
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setCurrentlySpeakingMsgId(null);
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
      recognition.lang = 'en-US';

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
    setIsTyping(true);
    setErrorMessage('');

    try {
      const history = messages.map((m) => ({ sender: m.sender, text: m.text }));
      const response = await askAiSupportAssistant(userText, history);

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
        // Note: Chat assistant does NOT speak aloud; voice is strictly reserved for Voice Calls
      } else {
        throw new Error(response.error || 'Failed to get answer');
      }
    } catch (err: any) {
      console.error('AI Support error:', err);
      const fallbackMsg: ChatMessage = {
        id: `msg_bot_${Date.now()}`,
        sender: 'bot',
        text: `Hey @${currentUser.username}! I am your official NOOB Support Assistant. I can help with 50 mini-games (+100 win / +50 tie points), continuous background music playback, story highlights, automated feed/reels media sorting, and our full Terms & Conditions & Privacy Policy!`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsTyping(false);
    }
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

    const greeting = `Hello @${currentUser.username}! You are connected to the NOOB AI Voice Support Specialist. I am listening to your microphone—what issue can I solve for your account today?`;
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

    // Note: we deliberately do NOT call getUserMedia() here. SpeechRecognition
    // requests and manages its own microphone access internally — grabbing a
    // second, unused raw MediaStream in parallel held the mic device open for
    // the whole call and could starve SpeechRecognition of exclusive access,
    // which showed up as "the mic indicator is on but nothing is transcribed."
    // Also initiate listening as fallback if speech finishes fast or user interrupts
    setTimeout(() => {
      if (isCallActiveRef.current && !isMutedRef.current && !isSpeakingRef.current) {
        startVoiceListening();
      }
    }, 2500);
  };

  // Submit and answer an issue live during the voice call
  const handleAskCallQuestion = async (queryText: string) => {
    if (!queryText.trim() || isCallProcessing) return;
    const cleanQuery = queryText.trim();
    setCallInputText('');
    setIsCallProcessing(true);
    setMicStalled(false);

    const userEntry = {
      sender: 'user' as const,
      text: cleanQuery,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setCallTranscript((prev) => [...prev, userEntry]);

    try {
      const history = callTranscript.map((t) => ({ sender: t.sender === 'ai' ? 'bot' : 'user', text: t.text }));
      const response = await askAiSupportAssistant(cleanQuery, history);

      const aiReply = response?.reply || `For @${currentUser.username}: Our 50 mini-games grant +100 points for wins and +50 points for ties, your media is encrypted and automatically routed by format, and your privacy is 100% protected. What else can I solve for you?`;
      
      const aiEntry = {
        sender: 'ai' as const,
        text: aiReply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setCallTranscript((prev) => [...prev, aiEntry]);
      setLastAiReply(aiReply);

      if (isSpeakerOn && voiceEnabled) {
        speakText(aiReply);
      }
    } catch (err) {
      const fallbackReply = `I understand your question regarding ${cleanQuery}. On NOOB, all features operate instantly in real-time. You have complete data control and 24/7 access to mini-games, music, and encrypted media routing.`;
      setCallTranscript((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: fallbackReply,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setLastAiReply(fallbackReply);
      if (isSpeakerOn && voiceEnabled) speakText(fallbackReply);
    } finally {
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

  const handleTicketSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketDescription.trim()) return;

    const generatedId = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;
    setTicketId(generatedId);
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
      a: 'NOOB NEVER sells your data. All media files are encrypted in Backblaze B2 S3 storage. You have full GDPR/CCPA rights to edit your details, set your account to Private, or delete your account anytime.'
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
      a: 'Play any of our 50 Mini-Games! Winning an arcade match awards +100 NOOB points, and tying awards +50 NOOB points. Your rank updates in real-time on the Global Leaderboard.'
    },
    {
      q: 'How does background music work?',
      a: 'When you start playing any track from the Community Music Hub, it keeps playing smoothly across the entire app as you browse Feeds, watch Reels, chat, or play mini-games without stopping.'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <header className="p-4 sm:p-5 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#00FF66] via-emerald-400 to-teal-400 p-[2px] shadow-lg shadow-[#00FF66]/20">
                <div className="w-full h-full bg-black rounded-[14px] flex items-center justify-center">
                  <Bot className="w-6 h-6 text-[#00FF66]" />
                </div>
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[#00FF66] border-2 border-black rounded-full animate-pulse" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  NOOB Support &amp; Help Desk
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00FF66]/20 text-[#00FF66] font-bold border border-[#00FF66]/30 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5" /> Instant AI
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                24/7 AI Chat &amp; Community Support Specialist
              </p>
              {ratingSummary.average !== null && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  <span className="text-[11px] font-bold text-amber-400">{ratingSummary.average}</span>
                  <span className="text-[10px] text-zinc-500">
                    average from {ratingSummary.count} review{ratingSummary.count === 1 ? '' : 's'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* End Chat Button */}
            {activeSupportTab === 'ai_chat' && (
              <button
                onClick={() => {
                  stopSpeaking();
                  setShowReviewModal(true);
                }}
                className="px-2.5 py-1.5 bg-rose-600/20 hover:bg-rose-600 border border-rose-500/40 hover:border-rose-600 text-rose-300 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                title="End support chat and rate session"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">End Chat</span>
              </button>
            )}

            {/* Voice Toggle */}
            <button
              onClick={() => {
                if (voiceEnabled) stopSpeaking();
                setVoiceEnabled(!voiceEnabled);
              }}
              title={voiceEnabled ? 'Mute AI Voice' : 'Enable AI Voice'}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                voiceEnabled
                  ? 'bg-[#00FF66]/10 border-[#00FF66]/40 text-[#00FF66]'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* User Context Bar */}
        <div className="bg-zinc-900/60 border-b border-zinc-800/80 px-4 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <img
              src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
              alt={currentUser.username}
              className="w-6 h-6 rounded-full object-cover ring-1 ring-[#00FF66]"
              referrerPolicy="no-referrer"
            />
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-bold text-white truncate">{currentUser.displayName || currentUser.username}</span>
              <span className="text-[11px] text-zinc-400">(@{currentUser.username})</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 capitalize border border-zinc-700">
                {currentUser.gender || 'Member'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-yellow-400 font-bold flex items-center gap-1">
              <Crown className="w-3 h-3 text-yellow-400" /> {currentUser.noobPoints || 100} NOOBs
            </span>
          </div>
        </div>

        {/* Tab Navigation (Differentiates Chat vs Call Us vs Safety vs Ticket vs FAQs) */}
        <div className="grid grid-cols-5 border-b border-zinc-800 bg-zinc-900/40 px-2 pt-2 gap-1 text-center">
          <button
            onClick={() => setActiveSupportTab('ai_chat')}
            className={`pb-2.5 text-xs font-bold transition-all border-b-2 flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
              activeSupportTab === 'ai_chat'
                ? 'text-[#00FF66] border-[#00FF66]'
                : 'text-zinc-400 border-transparent hover:text-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" /> <span className="hidden sm:inline">AI</span> Chat
          </button>

          <button
            onClick={() => setActiveSupportTab('call_us')}
            className={`pb-2.5 text-xs font-bold transition-all border-b-2 flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
              activeSupportTab === 'call_us'
                ? 'text-cyan-400 border-cyan-400'
                : 'text-zinc-400 border-transparent hover:text-white'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Voice</span> Call
          </button>

          <button
            onClick={() => setActiveSupportTab('safety_report')}
            className={`pb-2.5 text-xs font-bold transition-all border-b-2 flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
              activeSupportTab === 'safety_report'
                ? 'text-rose-400 border-rose-400'
                : 'text-zinc-400 border-transparent hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Trust &</span> Safety
          </button>

          <button
            onClick={() => setActiveSupportTab('ticket')}
            className={`pb-2.5 text-xs font-bold transition-all border-b-2 flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
              activeSupportTab === 'ticket'
                ? 'text-[#00FF66] border-[#00FF66]'
                : 'text-zinc-400 border-transparent hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Ticket
          </button>

          <button
            onClick={() => setActiveSupportTab('faq')}
            className={`pb-2.5 text-xs font-bold transition-all border-b-2 flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap ${
              activeSupportTab === 'faq'
                ? 'text-[#00FF66] border-[#00FF66]'
                : 'text-zinc-400 border-transparent hover:text-white'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" /> FAQs
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* TAB 1: AI ASSISTANT CHAT */}
          {activeSupportTab === 'ai_chat' && (
            <div className="flex flex-col h-[400px]">
              {/* Support Session Header Controls: End Chat & Quick Actions */}
              <div className="flex items-center justify-between pb-2.5 border-b border-zinc-800/80 mb-2 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#00FF66] animate-pulse" />
                  <span className="text-xs font-bold text-white">Live Support Session</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsChatEnded(true);
                      setShowReviewModal(true);
                    }}
                    className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    title="End Support Chat & Rate Experience"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>End Chat</span>
                  </button>
                </div>
              </div>

              {/* Session Concluded Banner */}
              {isChatEnded && (
                <div className="px-3.5 py-2 bg-gradient-to-r from-amber-950/40 via-zinc-900 to-amber-950/40 border border-amber-500/30 rounded-2xl flex items-center justify-between gap-2 mb-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs text-amber-200 font-medium">
                      This support session has concluded.
                    </span>
                  </div>
                  <button
                    onClick={() => setShowReviewModal(true)}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Star className="w-3 h-3 fill-black" />
                    {reviewSubmitted ? 'Update Review' : 'Rate & Review'}
                  </button>
                </div>
              )}

              {/* Quick Prompt Suggestions */}
              <div className="flex items-center gap-1.5 pb-2.5 overflow-x-auto no-scrollbar shrink-0">
                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider shrink-0">
                  Quick Help:
                </span>
                <button
                  type="button"
                  onClick={() => handleQuickPrompt('What are the official Terms and Conditions?')}
                  className="px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  📜 Terms &amp; Conditions
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickPrompt('Explain NOOB Privacy Policy and data security')}
                  className="px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  🛡️ Privacy Policy
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickPrompt('How do 50 mini-games point scoring work?')}
                  className="px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  🎮 Mini-Games (+100 Win)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickPrompt('How does continuous background music work?')}
                  className="px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  🎵 Music Hub
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSupportTab('safety_report')}
                  className="px-2.5 py-1 rounded-full bg-rose-950/40 hover:bg-rose-900/40 border border-rose-500/30 text-[11px] text-rose-300 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
                >
                  🛡️ Report Cyber Bullying
                </button>
              </div>

              {/* Chat messages thread */}
              <div className="flex-1 overflow-y-auto space-y-3.5 pr-1.5 scroll-smooth">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex items-start gap-2.5 ${
                      m.sender === 'user' ? 'flex-row-reverse' : ''
                    }`}
                  >
                    {m.sender === 'bot' ? (
                      <div className="relative shrink-0">
                        <div className="w-8 h-8 rounded-2xl bg-gradient-to-tr from-[#00FF66] to-emerald-500 p-[1.5px] shadow-md shadow-[#00FF66]/20">
                          <div className="w-full h-full bg-black rounded-[14px] flex items-center justify-center">
                            <Bot className="w-4 h-4 text-[#00FF66]" />
                          </div>
                        </div>
                        {currentlySpeakingMsgId === m.id && (
                          <span className="absolute -top-1 -right-1 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00FF66] opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#00FF66]" />
                          </span>
                        )}
                      </div>
                    ) : (
                      <img
                        src={currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                        alt={currentUser.username}
                        className="w-8 h-8 rounded-2xl object-cover ring-1 ring-zinc-700 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    )}

                    <div
                      className={`max-w-[85%] rounded-2xl p-3.5 text-xs sm:text-sm leading-relaxed ${
                        m.sender === 'user'
                          ? 'bg-gradient-to-r from-emerald-600 to-[#00FF66] text-black font-medium'
                          : 'bg-zinc-900/95 border border-zinc-800 text-zinc-100'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.text}</div>

                      <div
                        className={`flex items-center justify-between gap-2 mt-2 pt-1 border-t ${
                          m.sender === 'user'
                            ? 'border-black/10 text-black/70'
                            : 'border-zinc-800 text-zinc-500'
                        } text-[10px]`}
                      >
                        <span>{m.time}</span>
                        {m.sender === 'bot' && (
                          <button
                            onClick={() => {
                              if (currentlySpeakingMsgId === m.id) {
                                stopSpeaking();
                              } else {
                                speakText(m.text, m.id);
                              }
                            }}
                            className="flex items-center gap-1 hover:text-[#00FF66] transition-colors cursor-pointer"
                          >
                            {currentlySpeakingMsgId === m.id ? (
                              <>
                                <VolumeX className="w-3 h-3" /> Stop Voice
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3 h-3" /> Speak
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-900/80 p-3 rounded-2xl border border-zinc-800 w-fit">
                    <div className="w-2 h-2 rounded-full bg-[#00FF66] animate-bounce" />
                    <div className="w-2 h-2 rounded-full bg-[#00FF66] animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 rounded-full bg-[#00FF66] animate-bounce [animation-delay:0.4s]" />
                    <span className="text-[11px] text-zinc-400 font-medium">Instant AI knowledge lookup...</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <form
                id="ai-support-form"
                onSubmit={handleSendMessage}
                className="mt-3 flex items-center gap-2 shrink-0"
              >
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Ask about Terms, Privacy, 50 Mini-Games, Music Hub..."
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-[#00FF66] rounded-2xl px-4 py-3 text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none transition-colors pr-10"
                  />
                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-xl transition-colors cursor-pointer ${
                      isListening
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                    title={isListening ? 'Stop listening' : 'Voice typing'}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={!inputMessage.trim() || isTyping}
                  className="px-4 py-3 bg-[#00FF66] text-black font-bold rounded-2xl hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all text-xs sm:text-sm cursor-pointer shadow-md shadow-[#00FF66]/20"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Ask AI</span>
                </button>
              </form>

              <div className="flex items-center justify-between px-1 text-[11px] text-zinc-500">
                <span>NOOB Smart Support Specialist • Online 24/7</span>
                <button
                  type="button"
                  onClick={() => {
                    stopSpeaking();
                    setShowReviewModal(true);
                  }}
                  className="text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <LogOut className="w-3 h-3" /> End Chat &amp; Rate
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: CALL US (DIRECT VOICE CALL TO LOGGED-IN ACCOUNT) */}
          {activeSupportTab === 'call_us' && (
            <div className="space-y-5">
              <div className="space-y-4">
                {/* Option 1: Direct Instant Call to Logged-In User */}
                <div className="p-5 rounded-3xl bg-gradient-to-br from-cyan-950/50 via-zinc-900 to-zinc-900 border border-cyan-500/30 shadow-xl space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-md">
                        <PhoneCall className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                          Instant AI Voice Call
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#00FF66]/20 text-[#00FF66] font-bold border border-[#00FF66]/30">
                            Direct Account Call
                          </span>
                        </h4>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Connects directly to your logged-in account (@{currentUser.username})
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-black/60 rounded-2xl p-3.5 border border-zinc-800/80 text-xs text-zinc-300 space-y-1.5">
                    <div className="flex items-center gap-2 text-cyan-400 font-bold">
                      <Sparkles className="w-3.5 h-3.5" /> Hands-Free Real-Time Voice:
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Tap below to launch a full-screen live AI voice call. The AI Specialist actively listens to your microphone, transcribes your questions in real-time, and speaks answers aloud.
                    </p>
                  </div>

                  <button
                    onClick={handleStartCall}
                    className="w-full py-3.5 bg-gradient-to-r from-cyan-400 via-teal-400 to-[#00FF66] text-black font-black rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer shadow-lg shadow-cyan-500/20"
                  >
                    <PhoneCall className="w-4 h-4 stroke-[2.5]" /> Request Instant Call to @{currentUser.username}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: TRUST & SAFETY / CYBER BULLYING REPORT & BLOCK */}
          {activeSupportTab === 'safety_report' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-rose-950/40 via-zinc-900 to-rose-950/30 border border-rose-500/30 p-4 sm:p-5 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
                  <ShieldAlert className="w-5 h-5 text-rose-400" />
                  Trust &amp; Safety: Cyber Bullying &amp; Harassment Defense
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  NOOB enforces zero tolerance against harassment, hate speech, bullying, toxicity, and impersonation. Submit the offender's username or ID below to take immediate action and block them from your profile.
                </p>
              </div>

              {reportSuccessMsg ? (
                <div className="p-6 text-center space-y-2 bg-rose-950/30 border border-rose-500/30 rounded-2xl">
                  <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-500 flex items-center justify-center mx-auto text-rose-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-white">Action Confirmed</h4>
                  <p className="text-xs text-zinc-300 leading-relaxed">{reportSuccessMsg}</p>
                  <button
                    onClick={() => {
                      setReportSuccessMsg('');
                      setReportErrorMsg('');
                      setReportTargetId('');
                      setReportDetails('');
                    }}
                    className="mt-3 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold cursor-pointer border border-zinc-700"
                  >
                    Submit Another Report
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleSafetyReportSubmit}
                  className="space-y-3.5 bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl"
                >
                  {reportErrorMsg && (
                    <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-bold flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
                      <span>{reportErrorMsg}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      Offender User ID or @Username
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. cyber_troll or u_123"
                      value={reportTargetId}
                      onChange={(e) => {
                        setReportTargetId(e.target.value);
                        if (reportErrorMsg) setReportErrorMsg('');
                      }}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-rose-500 rounded-xl p-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      Violation Category
                    </label>
                    <select
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-rose-500 rounded-xl p-2.5 text-xs text-white focus:outline-none"
                    >
                      <option value="Cyber Bullying & Harassment">Cyber Bullying &amp; Harassment</option>
                      <option value="Hate Speech & Toxicity">Hate Speech &amp; Toxicity</option>
                      <option value="Threats & Intimidation">Threats &amp; Intimidation</option>
                      <option value="Spam & Scam">Spam &amp; Scam</option>
                      <option value="Impersonation">Impersonation</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      Incident Details / Message Context
                    </label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Describe what occurred..."
                      value={reportDetails}
                      onChange={(e) => setReportDetails(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-rose-500 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none transition-colors"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!reportTargetId.trim() || isSubmittingReport}
                    className="w-full py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    {isSubmittingReport ? 'Verifying & Submitting...' : 'Submit Report & Block Account'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: SUBMIT TICKET */}
          {activeSupportTab === 'ticket' && (
            <div className="space-y-4">
              {ticketSubmitted ? (
                <div className="bg-emerald-950/40 border border-emerald-500/30 p-6 rounded-2xl text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-[#00FF66] flex items-center justify-center mx-auto">
                    <Check className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white">Ticket Submitted Successfully!</h3>
                  <p className="text-xs text-zinc-300 max-w-md mx-auto">
                    Your issue has been logged under Reference ID:{' '}
                    <span className="text-[#00FF66] font-mono font-bold">{ticketId}</span>.
                  </p>
                  <button
                    onClick={() => {
                      setTicketSubmitted(false);
                      setTicketSubject('');
                      setTicketDescription('');
                    }}
                    className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold cursor-pointer border border-zinc-700"
                  >
                    Submit Another Ticket
                  </button>
                </div>
              ) : (
                <form onSubmit={handleTicketSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      Category
                    </label>
                    <select
                      value={ticketCategory}
                      onChange={(e) => setTicketCategory(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-white focus:border-[#00FF66] focus:outline-none"
                    >
                      <option>Terms &amp; Copyright Inquiries</option>
                      <option>Account Security &amp; Bot Defense</option>
                      <option>Media Upload &amp; Automated MIME Routing</option>
                      <option>Mini-Games Score &amp; Leaderboard</option>
                      <option>Music Hub Track Uploads</option>
                      <option>Other / General Support</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Brief overview of your issue..."
                      value={ticketSubject}
                      onChange={(e) => setTicketSubject(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-white focus:border-[#00FF66] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-1">
                      Detailed Description
                    </label>
                    <textarea
                      required
                      rows={4}
                      placeholder="Explain your issue in detail..."
                      value={ticketDescription}
                      onChange={(e) => setTicketDescription(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 text-xs text-white focus:border-[#00FF66] focus:outline-none resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-[#00FF66] text-black font-bold rounded-xl hover:bg-emerald-400 transition-all text-xs cursor-pointer shadow-lg shadow-[#00FF66]/20"
                  >
                    Submit Support Ticket
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 4: QUICK FAQS & RULES */}
          {activeSupportTab === 'faq' && (
            <div className="space-y-3">
              {FAQs.map((f, i) => (
                <div
                  key={i}
                  className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-3.5 space-y-1.5 hover:border-zinc-700 transition-colors"
                >
                  <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-[#00FF66] shrink-0" />
                    {f.q}
                  </h4>
                  <p className="text-xs text-zinc-400 leading-relaxed pl-6">{f.a}</p>
                </div>
              ))}

              <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-xs">
                {onOpenTerms && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenTerms();
                    }}
                    className="text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#00FF66]" /> View Terms &amp; Conditions
                  </button>
                )}
                {onOpenPrivacy && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenPrivacy();
                    }}
                    className="text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" /> View Privacy Policy
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="p-3 bg-zinc-950 border-t border-zinc-900 flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-3">
            {onOpenTerms && (
              <button
                onClick={() => {
                  onClose();
                  onOpenTerms();
                }}
                className="hover:text-zinc-300 transition-colors cursor-pointer flex items-center gap-1"
              >
                <FileText className="w-3 h-3 text-[#00FF66]" /> Terms
              </button>
            )}
            {onOpenPrivacy && (
              <button
                onClick={() => {
                  onClose();
                  onOpenPrivacy();
                }}
                className="hover:text-zinc-300 transition-colors cursor-pointer flex items-center gap-1"
              >
                <ShieldCheck className="w-3 h-3 text-cyan-400" /> Privacy
              </button>
            )}
          </div>
          <span>NOOB AI Support Engine v2.4</span>
        </footer>
      </div>

      {/* Full Screen Live AI Voice Call Overlay */}
      {isCallActive && (
        <div className="fixed inset-0 z-[160] w-screen h-screen bg-black/98 sm:bg-black text-white flex flex-col justify-between p-4 sm:p-6 force-dark select-none overflow-hidden">
          {/* Top Bar */}
          <div className="w-full flex items-center justify-between pb-3 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-400">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm sm:text-base font-black text-white">NOOB AI Voice Specialist</h3>
                  <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-ping" />
                </div>
                <p className="text-[11px] text-cyan-300/80 font-medium">Connected to @{currentUser.username}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-xs font-mono font-bold text-white bg-zinc-900/90 px-3 py-1.5 rounded-full border border-zinc-700 shadow-inner">
                ⏱️ {formatDuration(callDuration)}
              </div>
              <button
                type="button"
                onClick={handleEndCall}
                className="px-3.5 py-1.5 rounded-full bg-rose-600/20 hover:bg-rose-600 border border-rose-500/50 hover:border-rose-500 text-rose-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="End Call & Rate"
              >
                <PhoneOff className="w-3.5 h-3.5" /> End Call
              </button>
            </div>
          </div>

          {/* Center Stage: Glowing Visualizer + Status + Live Dialogue */}
          <div className="flex-1 flex flex-col items-center justify-center max-w-2xl w-full mx-auto my-auto space-y-4 px-2 min-h-0">
            {/* Center Avatar with dynamic pulse ripples */}
            <div className="relative my-2">
              <div className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-tr from-cyan-400 via-teal-400 to-[#00FF66] p-1 shadow-2xl transition-transform ${
                isSpeaking || isListening ? 'scale-105 shadow-cyan-500/40' : 'scale-100 shadow-cyan-500/10'
              }`}>
                <div className="w-full h-full bg-zinc-950 rounded-full flex items-center justify-center">
                  <Bot className={`w-12 h-12 transition-colors ${isSpeaking ? 'text-[#00FF66]' : 'text-cyan-400'}`} />
                </div>
              </div>
              {(isSpeaking || isListening) && (
                <span className="absolute inset-0 rounded-full border-4 border-cyan-400/60 animate-ping" />
              )}
            </div>

            {/* Dynamic Status Indicator */}
            <div className="text-center space-y-1">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-zinc-900/90 border border-zinc-700/80 text-xs font-bold shadow-md">
                {!speechSupported ? (
                  <span className="text-amber-400 flex items-center gap-1.5">
                    <MicOff className="w-3.5 h-3.5" /> Voice input unavailable — type below
                  </span>
                ) : isMuted ? (
                  <span className="text-rose-400 flex items-center gap-1.5">
                    <MicOff className="w-3.5 h-3.5" /> Microphone Muted
                  </span>
                ) : isSpeaking ? (
                  <span className="text-[#00FF66] flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 animate-pulse" /> Speaking Resolution...
                  </span>
                ) : isCallProcessing ? (
                  <span className="text-yellow-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 animate-spin" /> Analyzing Issue...
                  </span>
                ) : isListening ? (
                  <span className="text-cyan-400 flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 animate-pulse" /> Listening to your microphone... (Speak now)
                  </span>
                ) : micStalled ? (
                  <span className="text-amber-400 flex items-center gap-1.5">
                    <MicOff className="w-3.5 h-3.5" /> Didn't catch that — type your question below
                  </span>
                ) : (
                  <span className="text-zinc-400">Microphone Ready</span>
                )}
              </div>
            </div>

            {/* 18-bar Animated Voice Equalizer */}
            <div className="flex items-center justify-center gap-1.5 h-8 w-full max-w-xs">
              {[12, 22, 10, 30, 16, 26, 12, 20, 32, 14, 28, 18, 24, 10, 22, 30, 14, 20].map((height, i) => (
                <div
                  key={i}
                  className={`w-1.5 bg-gradient-to-t from-cyan-500 to-[#00FF66] rounded-full transition-all duration-150 ${
                    isSpeaking || (isListening && !isMuted) || isCallProcessing ? 'animate-pulse' : 'opacity-25'
                  }`}
                  style={{
                    height: `${
                      isSpeaking
                        ? height
                        : (isListening && !isMuted) || isCallProcessing
                        ? Math.max(8, height * 0.7)
                        : 4
                    }px`
                  }}
                />
              ))}
            </div>

            {/* Live Caption: shows only what's being said right now — no persisted chat history */}
            <div className="w-full min-h-[3.5rem] flex items-center justify-center text-center px-3">
              {isSpeaking && lastAiReply ? (
                <p className="max-w-md text-sm text-cyan-100 leading-relaxed line-clamp-3">
                  {lastAiReply}
                </p>
              ) : callInputText && isListening ? (
                <p className="max-w-md text-sm text-white font-medium leading-relaxed animate-pulse">
                  🗣️ "{callInputText}"
                </p>
              ) : (
                <p className="text-[11px] text-zinc-500">
                  This call isn't recorded as a chat log — just speak naturally.
                </p>
              )}
            </div>

          </div>

          {/* Bottom Bar: Input Fallback + High-Visibility Call Controls */}
          <div className="w-full max-w-xl mx-auto space-y-3 shrink-0 pt-2 border-t border-zinc-800/80">
            {/* Fallback Text Input Bar */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={callInputText}
                  onChange={(e) => setCallInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && callInputText.trim()) {
                      e.preventDefault();
                      handleAskCallQuestion(callInputText);
                    }
                  }}
                  placeholder="Speak into microphone or type question..."
                  className="w-full bg-zinc-900/90 border border-zinc-800 focus:border-cyan-400 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none pr-9"
                />
                <button
                  type="button"
                  onClick={toggleListening}
                  disabled={!speechSupported}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed ${
                    isListening ? 'text-cyan-400 animate-pulse' : 'text-zinc-400 hover:text-white'
                  }`}
                  title={!speechSupported ? 'Voice input not supported in this browser' : isListening ? 'Stop listening' : 'Start Voice Input'}
                >
                  {isListening ? <Mic className="w-3.5 h-3.5 text-cyan-400" /> : <MicOff className="w-3.5 h-3.5" />}
                </button>
              </div>

              <button
                type="button"
                disabled={!callInputText.trim() || isCallProcessing}
                onClick={() => handleAskCallQuestion(callInputText)}
                className="px-3.5 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-xl text-xs flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" /> Solve
              </button>
            </div>

            {/* Bottom Call Action Buttons */}
            <div className="flex items-center justify-center gap-5">
              {/* Mic Mute / Unmute */}
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className={`p-3.5 rounded-full border transition-all cursor-pointer ${
                  isMuted
                    ? 'bg-rose-500/20 border-rose-500 text-rose-400 shadow-lg shadow-rose-500/20'
                    : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                }`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* End Call Button */}
              <button
                type="button"
                onClick={handleEndCall}
                className="px-7 py-3.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-black text-sm flex items-center gap-2 shadow-xl shadow-rose-600/40 transition-transform active:scale-95 cursor-pointer"
                title="End Call and Rate Experience"
              >
                <PhoneOff className="w-5 h-5 stroke-[2.5]" /> End Call &amp; Rate
              </button>

              {/* Speaker On / Off */}
              <button
                type="button"
                onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                className={`p-3.5 rounded-full border transition-all cursor-pointer ${
                  isSpeakerOn
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                    : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}
                title={isSpeakerOn ? 'Speaker On' : 'Speaker Off'}
              >
                {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-Chat / Post-Call 1-5 Star Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 force-dark">
          <div className="bg-zinc-950 border border-[#00FF66]/50 w-full max-w-sm rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#00FF66]/20 border border-[#00FF66]/40 flex items-center justify-center mx-auto text-[#00FF66]">
              <Star className="w-6 h-6 fill-[#00FF66]" />
            </div>

            <div>
              <h3 className="text-base font-black text-white">How was your support experience?</h3>
              <p className="text-xs text-zinc-400 mt-1">Please rate your AI support session out of 5 stars</p>
            </div>

            {reviewSubmitted ? (
              <div className="p-4 rounded-2xl bg-[#00FF66]/10 border border-[#00FF66]/30 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-[#00FF66] mx-auto animate-bounce" />
                <p className="text-xs font-bold text-white">Thank you for your review!</p>
                <p className="text-[11px] text-zinc-400">Your feedback helps us continuously improve NOOB.</p>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setReviewSubmitted(true);
                  confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
                  submitSupportReview(reviewRating, reviewFeedback)
                    .then((res) => {
                      if (res && typeof res.average === 'number') {
                        setRatingSummary({ average: res.average, count: res.count });
                      }
                    })
                    .catch(() => {});
                  setTimeout(() => {
                    setShowReviewModal(false);
                    onClose();
                  }, 1500);
                }}
                className="space-y-4"
              >
                {/* 5-Star Rating Buttons */}
                <div className="flex items-center justify-center gap-2 py-1">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const isFilled = (hoverRating || reviewRating) >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={() => setReviewRating(star)}
                        className="p-1 transition-transform hover:scale-125 cursor-pointer"
                      >
                        <Star
                          className={`w-7 h-7 transition-colors ${
                            isFilled ? 'text-amber-400 fill-amber-400' : 'text-zinc-700'
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs font-bold text-[#00FF66]">
                  {reviewRating === 5
                    ? '⭐⭐⭐⭐⭐ Excellent'
                    : reviewRating === 4
                    ? '⭐⭐⭐⭐ Great'
                    : reviewRating === 3
                    ? '⭐⭐⭐ Good'
                    : reviewRating === 2
                    ? '⭐⭐ Fair'
                    : '⭐ Needs Improvement'}
                </span>

                <textarea
                  rows={3}
                  value={reviewFeedback}
                  onChange={(e) => setReviewFeedback(e.target.value)}
                  placeholder="Optional feedback: Did the AI pinpoint your issue accurately?"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00FF66]"
                />

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowReviewModal(false);
                      onClose();
                    }}
                    className="px-3 py-2 text-xs text-zinc-400 hover:text-white"
                  >
                    Skip
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#00FF66] hover:bg-emerald-400 text-black font-bold text-xs rounded-xl transition-all shadow-md shadow-[#00FF66]/20 cursor-pointer"
                  >
                    Submit Review
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

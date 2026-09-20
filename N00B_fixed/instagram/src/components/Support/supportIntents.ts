// What the person asks for in the support chat / voice call that the app itself must act on (not the AI): ending the session.
// When somebody asks to end the chat or hang up, the session ends straight away and they are asked for a 5-star review.
// (Other languages are recognised by the AI, which answers with the marker [[END]]; see supabase/functions/ai/index.ts.)

const QUESTION_START = /^(how|what|why|where|when|which|who|explain|tell me|is there|is it|does|do i|can i see|can i find)\b/;

const END_ENGLISH: RegExp[] = [
  // "end the chat", "please close this call", "stop our conversation", "leave the session"
  /\b(end|close|stop|finish|terminate|quit|leave|exit)\s+(the\s+|this\s+|our\s+|my\s+|that\s+|it\s+)?(support\s+|voice\s+|live\s+)?(chat|call|conversation|session|talk)\b/,
  /\bhang\s?up\b/,
  /\b(cut|drop|disconnect)\s+(the\s+|this\s+|my\s+)?call\b/,
  /^(please\s+)?disconnect(\s+now)?$/,
  // goodbyes
  /^(ok(ay)?\s+|alright\s+|thanks?\s+|thank you\s+|so\s+)?(good\s?bye|bye(\s?bye)?|see you|see ya|take care|cya|gtg|got to go)\b/,
  /\b(that'?s|thats|that is)\s+all\b/,
  /\b(i am|i'm|im|we are|we're)\s+(all\s+)?done\b/,
  /^(nothing else|no more questions?|no other questions?|no further questions?)\b/
];

// Hindi / Hinglish (written in Latin letters) and Devanagari
const END_HINDI: RegExp[] = [
  /\b(call|chat|baat|baatcheet)\s+(band|khatam|kat|cut)\s*(karo|kar\s?do|kardo|kijiye|kijiyega|kro|do)\b/,
  /\b(call|phone)\s+(kaat|kat)\s*(do|dijiye|dena)\b/,
  /\bphone\s+rakh\s*(do|dijiye|rahi|raha)?\b/,
  /^(band\s+karo|band\s+kar\s?do|bas\s+itna\s+hi|bas\s+ho\s+gaya|alvida|chalo\s+bye)\b/
];
const END_DEVANAGARI = ['कॉल बंद', 'चैट बंद', 'बात बंद', 'बंद करो', 'बंद कर दो', 'फोन रख', 'कॉल कट', 'अलविदा', 'बस इतना ही', 'बस हो गया'];

// Does this message ask to end the chat or the call?
export function wantsToEndSession(text: string): boolean {
  const norm = String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!norm || norm.length > 90) return false; // a long message is a question or a story, not "end the chat"
  if (END_DEVANAGARI.some((w) => norm.includes(w))) return true;
  const bare = norm.replace(/^((please|kindly|hey|hi|ok|okay|so|and|but|just)\s+)+/, '');
  if (QUESTION_START.test(bare)) return false; // "how do I end the chat?" is a question about it, not the request
  return END_ENGLISH.some((re) => re.test(norm)) || END_HINDI.some((re) => re.test(norm));
}

// What the assistant says when it ends the session, asking for the 5-star review that opens right after.
export function goodbyeMessage(username: string, kind: 'chat' | 'call'): string {
  return `Thank you for contacting NOOB Support, @${username}! I'm ending this ${kind} now. If I was able to help, please rate your experience with 5 stars ⭐⭐⭐⭐⭐. Your review helps us improve.`;
}

// The same, worded for the voice (no emoji to be read out loud).
export function goodbyeSpoken(username: string): string {
  return `Thank you for calling NOOB Support, ${username}! If I helped, please rate your experience with five stars. Goodbye!`;
}

const SPEECH_LOCALE_BY_LANGUAGE: Record<string, string> = {
  en: 'en-US',
  'en-US': 'en-US',
  'en-GB': 'en-GB',
  es: 'es-ES',
  'es-ES': 'es-ES',
  tr: 'tr-TR',
  'pt-BR': 'pt-BR',
  'pt-br': 'pt-BR',
  fr: 'fr-FR',
  nl: 'nl-NL',
  de: 'de-DE',
  it: 'it-IT',
  ar: 'ar-SA',
  ru: 'ru-RU',
};

const speechQueue: string[] = [];
let isSpeaking = false;
let voicesReady = false;

const getSpeechLocale = (language: string) =>
  SPEECH_LOCALE_BY_LANGUAGE[language]
  ?? SPEECH_LOCALE_BY_LANGUAGE[language.split('-')[0] ?? '']
  ?? 'en-US';

const ensureVoices = () => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    voicesReady = true;
  }
};

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  ensureVoices();
  window.speechSynthesis.addEventListener('voiceschanged', ensureVoices);
}

const pickVoice = (language: string): SpeechSynthesisVoice | undefined => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return undefined;
  }

  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    return undefined;
  }

  const locale = getSpeechLocale(language);
  const exact = voices.find((v) => v.lang === locale);
  if (exact) {
    return exact;
  }

  const prefix = locale.split('-')[0];
  return voices.find((v) => v.lang.toLowerCase().startsWith(prefix.toLowerCase()));
};

const processSpeechQueue = (language: string) => {
  if (isSpeaking || speechQueue.length === 0 || typeof window === 'undefined') {
    return;
  }

  if (!('speechSynthesis' in window)) {
    speechQueue.length = 0;
    return;
  }

  // Chrome often leaves synthesis paused, which blocks speak().
  if (window.speechSynthesis.paused) {
    window.speechSynthesis.resume();
  }

  const text = speechQueue.shift();
  if (!text) {
    return;
  }

  isSpeaking = true;
  const utterance = new SpeechSynthesisUtterance(text);
  const locale = getSpeechLocale(language);
  utterance.lang = locale;
  utterance.rate = 0.95;
  utterance.volume = 1;

  const voice = pickVoice(language);
  if (voice) {
    utterance.voice = voice;
  }

  utterance.onend = () => {
    isSpeaking = false;
    processSpeechQueue(language);
  };
  utterance.onerror = () => {
    isSpeaking = false;
    processSpeechQueue(language);
  };

  try {
    window.speechSynthesis.speak(utterance);
  } catch {
    isSpeaking = false;
    processSpeechQueue(language);
    return;
  }

  // Chrome bug: speak() sometimes no-ops until a tick / cancel-retry.
  window.setTimeout(() => {
    if (!isSpeaking) {
      return;
    }
    if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch {
        isSpeaking = false;
        processSpeechQueue(language);
      }
    }
  }, 250);
};

export const speakOrderReady = (text: string, language: string) => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  const trimmed = text?.trim();
  if (!trimmed) {
    return;
  }

  ensureVoices();
  speechQueue.push(trimmed);

  // Defer if voices are not ready yet (first load).
  if (!voicesReady && window.speechSynthesis.getVoices().length === 0) {
    const onVoices = () => {
      voicesReady = true;
      window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
      processSpeechQueue(language);
    };
    window.speechSynthesis.addEventListener('voiceschanged', onVoices);
    // Fallback in case voiceschanged never fires.
    window.setTimeout(() => processSpeechQueue(language), 300);
    return;
  }

  processSpeechQueue(language);
};

/** Call once after a user gesture so browsers unlock speech. */
export const unlockSpeech = () => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  ensureVoices();
  try {
    // No-op utterance primes Chrome's autoplay policy after a click.
    const unlock = new SpeechSynthesisUtterance(' ');
    unlock.volume = 0;
    unlock.rate = 10;
    window.speechSynthesis.speak(unlock);
    window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
};

export const cancelOrderReadySpeech = () => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  speechQueue.length = 0;
  isSpeaking = false;
  window.speechSynthesis.cancel();
};

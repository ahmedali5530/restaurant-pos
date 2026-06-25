const SPEECH_LOCALE_BY_LANGUAGE: Record<string, string> = {
  en: 'en-US',
  es: 'es-ES',
  tr: 'tr-TR',
  'pt-BR': 'pt-BR',
  fr: 'fr-FR',
  nl: 'nl-NL',
  de: 'de-DE',
  it: 'it-IT',
  ar: 'ar-SA',
  ru: 'ru-RU',
};

const speechQueue: string[] = [];
let isSpeaking = false;

const getSpeechLocale = (language: string) =>
  SPEECH_LOCALE_BY_LANGUAGE[language] ?? 'en-US';

const processSpeechQueue = (language: string) => {
  if (isSpeaking || speechQueue.length === 0 || typeof window === 'undefined') {
    return;
  }

  if (!('speechSynthesis' in window)) {
    speechQueue.length = 0;
    return;
  }

  const text = speechQueue.shift();
  if (!text) {
    return;
  }

  isSpeaking = true;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = getSpeechLocale(language);
  utterance.rate = 0.95;
  utterance.onend = () => {
    isSpeaking = false;
    processSpeechQueue(language);
  };
  utterance.onerror = () => {
    isSpeaking = false;
    processSpeechQueue(language);
  };

  window.speechSynthesis.speak(utterance);
};

export const speakOrderReady = (text: string, language: string) => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  speechQueue.push(text);
  processSpeechQueue(language);
};

export const cancelOrderReadySpeech = () => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }

  speechQueue.length = 0;
  isSpeaking = false;
  window.speechSynthesis.cancel();
};

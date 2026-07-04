export const isCurrentSessionSalesPrompt = (prompt: string): boolean => {
  const mentionsSession = /\b(current|active|open)\s+sessions?\b|\bclocked\s+in\b|\bduring\s+their\s+(current\s+)?session\b/i.test(prompt);
  const mentionsStaff = /\b(order\s*takers?|servers?)\b/i.test(prompt);
  const mentionsSales = /\b(sales\s+summary|net\s+sales|session\s+sales)\b/i.test(prompt)
    || (/\b(sales|checks?|guests?)\b/i.test(prompt) && /\b(session|clocked\s+in)\b/i.test(prompt));

  return mentionsSession && mentionsStaff && mentionsSales;
};

export const isActiveSessionsPrompt = (prompt: string): boolean => {
  if (isCurrentSessionSalesPrompt(prompt)) {
    return false;
  }

  const mentionsSession = /\b(current|active|open)\s+sessions?\b|\bclocked\s+in\b|\bwho\s+is\s+working\b/i.test(prompt);
  const mentionsTimeEntry = /\btime[_\s-]?entries?\b/i.test(prompt);
  return mentionsSession || mentionsTimeEntry;
};

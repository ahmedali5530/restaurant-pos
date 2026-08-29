/**
 * HR employee prompts (Tables.employees) — not POS system users (Tables.users).
 */
export const extractEmployeeNumberFromPrompt = (prompt: string): string | undefined => {
  const patterns = [
    /\bemployee\s*#\s*([a-z0-9-]+)\b/i,
    /\bemployee\s*#\s*(\d+)\b/i,
    /\bemployee\s+(?:number|no\.?|#)\s*([a-z0-9-]+)\b/i,
    /\bemp(?:loyee)?\s*#\s*([a-z0-9-]+)\b/i,
    /\bemployee\s+([a-z]{0,3}\d{3,})\b/i,
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return undefined;
};

export const extractEmployeeIdFromPrompt = (prompt: string): string | undefined => {
  const recordMatch = prompt.match(/\bemployee:([a-z0-9]+)\b/i);
  if (recordMatch) {
    return `employee:${recordMatch[1]}`;
  }
  return undefined;
};

export const isHrEmployeePrompt = (prompt: string): boolean => {
  const text = prompt.trim();
  if (!text) {
    return false;
  }

  if (/\b(?:pos\s+)?users?\b/i.test(text) && !/\bemployees?\b/i.test(text)) {
    return false;
  }

  return (
    extractEmployeeNumberFromPrompt(text) !== undefined
    || extractEmployeeIdFromPrompt(text) !== undefined
    || /\bemployees?\b/i.test(text)
    || /\bemployee\s+(?:details?|profile|record|info)\b/i.test(text)
    || /\bhr\s+employee\b/i.test(text)
  );
};

const HR_OPERATION_KEYWORDS =
  /\b(?:leave\s+requests?|on\s+leave|departments?|positions?|cost\s+centers?|pay\s+profiles?|payroll|hr\s+)\b/i;

export const isHrOperationPrompt = (prompt: string): boolean =>
  isHrEmployeePrompt(prompt) || HR_OPERATION_KEYWORDS.test(prompt.trim());

export const isEmployeeDetailPrompt = (prompt: string): boolean => {
  const text = prompt.trim();
  if (!text) {
    return false;
  }

  return (
    extractEmployeeNumberFromPrompt(text) !== undefined
    || extractEmployeeIdFromPrompt(text) !== undefined
    || (/\b(?:details?|profile|info|about)\b/i.test(text) && /\bemployees?\b/i.test(text))
  );
};

export const resolveEmployeeQueryFromPrompt = (prompt: string): {
  employeeNumber?: string;
  employeeId?: string;
} | null => {
  const employeeId = extractEmployeeIdFromPrompt(prompt);
  if (employeeId) {
    return {employeeId};
  }

  const employeeNumber = extractEmployeeNumberFromPrompt(prompt);
  if (employeeNumber) {
    return {employeeNumber};
  }

  return null;
};

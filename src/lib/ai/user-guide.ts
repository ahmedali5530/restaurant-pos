import {
  ACCOUNTS,
  ADMIN,
  CLOCK,
  HR,
  INTEGRATIONS,
  INVENTORY,
  REPORTS,
  TIP_DISTRIBUTION,
} from "@/routes/posr.ts";

/** Chapter keys that have locale JSON (excludes meta files common/guides). */
export const USER_GUIDE_CHAPTER_KEYS = [
  "login",
  "menu",
  "cart",
  "payment",
  "orders",
  "session",
  "settings",
  "tables",
  "security-auth",
  "summary",
  "kitchen",
  "order-display",
  "delivery",
  "closing",
  "reports-ops",
  "tips-manager",
  "inventory-overview",
  "inventory-items",
  "inventory-purchases",
  "inventory-issues",
  "inventory-wastes",
  "inventory-counts",
  "inventory-reconciliation",
  "inventory-production",
  "inventory-buffet",
  "accounts-overview",
  "accounts-expenses",
  "accounts-ledgers",
  "hr-overview",
  "hr-employees",
  "hr-cost-centers",
  "hr-attendance",
  "hr-leave",
  "hr-pay",
  "hr-payroll",
  "hr-documents",
  "hr-performance",
  "tip-distribution",
  "admin-overview",
  "admin-menus",
  "admin-floors",
  "admin-promotions",
  "admin-kitchen",
  "admin-printing",
  "admin-payments",
  "admin-users",
  "reports-admin",
  "integrations",
  "settings-advanced",
] as const;

export type UserGuideChapterKey = (typeof USER_GUIDE_CHAPTER_KEYS)[number];

const CHAPTER_KEY_SET = new Set<string>(USER_GUIDE_CHAPTER_KEYS);

/** English titles for the tool catalog (model picks a chapter without loading every file). */
export const USER_GUIDE_CHAPTER_TITLES: Record<UserGuideChapterKey, string> = {
  login: "Login",
  menu: "Menu and order taking",
  cart: "Cart",
  payment: "Payment screen",
  orders: "Orders",
  session: "Session lock, logout, and clock",
  settings: "Settings",
  tables: "Tables and dine-in",
  "security-auth": "Security re-authentication",
  summary: "Summary",
  kitchen: "Kitchen",
  "order-display": "Order display",
  delivery: "Delivery",
  closing: "Closing",
  "reports-ops": "Reports (operations)",
  "tips-manager": "Tip oversight",
  "inventory-overview": "Inventory overview",
  "inventory-items": "Items and stock master data",
  "inventory-purchases": "Purchases",
  "inventory-issues": "Issues and returns",
  "inventory-wastes": "Wastes",
  "inventory-counts": "Stock counts and transfers",
  "inventory-reconciliation": "Kitchen reconciliation",
  "inventory-production": "Recipes & production",
  "inventory-buffet": "Buffet menus & sessions",
  "accounts-overview": "Accounts overview",
  "accounts-expenses": "Journal entries and account groups",
  "accounts-ledgers": "Ledgers, P&L, and cash flow",
  "hr-overview": "HR overview",
  "hr-employees": "Employees",
  "hr-cost-centers": "Cost centers",
  "hr-attendance": "Attendance",
  "hr-leave": "Leave",
  "hr-pay": "Pay profiles & rules",
  "hr-payroll": "Payroll periods & runs",
  "hr-documents": "Employee documents",
  "hr-performance": "Performance notes",
  "tip-distribution": "Tip distribution",
  "admin-overview": "Manage overview",
  "admin-menus": "Menus, categories, and dishes",
  "admin-floors": "Floors and tables",
  "admin-promotions": "Discounts and coupons",
  "admin-kitchen": "Kitchens and workflows",
  "admin-printing": "Printers and print settings",
  "admin-payments": "Payment types, taxes, and order types",
  "admin-users": "Users and roles",
  "reports-admin": "Reports hub (administrator packs)",
  integrations: "Integrations",
  "settings-advanced": "Advanced device settings",
};

export type UserGuideField = {name?: string; effect?: string};

export type UserGuideSection = {
  id?: string;
  title?: string;
  intro?: string;
  steps?: string[];
  note?: string;
  fields?: UserGuideField[];
  image?: string;
  caption?: string;
};

export type UserGuideChapter = {
  title?: string;
  intro?: string;
  sections?: UserGuideSection[];
};

const MAX_GUIDE_CHARS = 6000;

/** Vite lazy loaders — one chapter JSON per call. */
const guideModules = import.meta.glob(
  "../../../docs/user-guide/locales/*/*.json",
) as Record<string, () => Promise<{default?: UserGuideChapter} | UserGuideChapter>>;

export const guideLocaleFolder = (language: string): string => {
  const raw = (language || "en").trim();
  if (!raw) return "en";
  if (raw.toLowerCase() === "pt-br" || raw === "pt-BR") return "pt-br";
  const base = raw.split(/[-_]/)[0]?.toLowerCase() || "en";
  return base;
};

const modulePath = (folder: string, chapter: string) =>
  `../../../docs/user-guide/locales/${folder}/${chapter}.json`;

const loadModule = async (path: string): Promise<UserGuideChapter | null> => {
  const loader = guideModules[path];
  if (!loader) return null;
  const mod = await loader();
  const data = (mod as {default?: UserGuideChapter}).default ?? (mod as UserGuideChapter);
  return data && typeof data === "object" ? data : null;
};

export const isUserGuideChapterKey = (value: unknown): value is UserGuideChapterKey =>
  typeof value === "string" && CHAPTER_KEY_SET.has(value);

export const loadUserGuideChapter = async (
  chapter: string,
  language: string,
): Promise<{chapter: UserGuideChapterKey; language: string; data: UserGuideChapter} | null> => {
  if (!isUserGuideChapterKey(chapter)) return null;

  const preferred = guideLocaleFolder(language);
  const preferredData = await loadModule(modulePath(preferred, chapter));
  if (preferredData) {
    return {chapter, language: preferred, data: preferredData};
  }

  if (preferred !== "en") {
    const fallback = await loadModule(modulePath("en", chapter));
    if (fallback) {
      return {chapter, language: "en", data: fallback};
    }
  }

  return null;
};

const sectionMatchesQuery = (section: UserGuideSection, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    section.id,
    section.title,
    section.intro,
    section.note,
    ...(section.steps ?? []),
    ...(section.fields ?? []).flatMap(f => [f.name, f.effect]),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return haystack.includes(q);
};

/** Serialize a chapter to plain text for the model (no screenshot paths). */
export const serializeUserGuideChapter = (
  data: UserGuideChapter,
  options: {query?: string; maxChars?: number} = {},
): string => {
  const maxChars = options.maxChars ?? MAX_GUIDE_CHARS;
  const query = options.query?.trim() ?? "";
  const lines: string[] = [];

  if (data.title) lines.push(`# ${data.title}`);
  if (data.intro) lines.push(data.intro);

  const sections = (data.sections ?? []).filter(section => sectionMatchesQuery(section, query));
  const effectiveSections = query && sections.length === 0 ? (data.sections ?? []) : sections;

  for (const section of effectiveSections) {
    if (section.title) lines.push(`## ${section.title}`);
    if (section.intro) lines.push(section.intro);
    if (section.steps?.length) {
      section.steps.forEach((step, index) => {
        lines.push(`${index + 1}. ${step}`);
      });
    }
    if (section.fields?.length) {
      for (const field of section.fields) {
        if (!field.name && !field.effect) continue;
        lines.push(`- ${field.name ?? "?"}: ${field.effect ?? ""}`);
      }
    }
    if (section.note) lines.push(`Note: ${section.note}`);
  }

  const text = lines.filter(Boolean).join("\n\n").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 20).trimEnd()}\n\n…(truncated)`;
};

export const catalogUserGuideForPrompt = (): string =>
  USER_GUIDE_CHAPTER_KEYS.map(key => `${key}: ${USER_GUIDE_CHAPTER_TITLES[key]}`).join("; ");

/**
 * Best-effort chapter for the current back-office route (widget screens only).
 * Inventory/HR tabs are local state — coarse overview chapters are returned.
 */
export const suggestUserGuideChapterForPath = (pathname: string): UserGuideChapterKey | null => {
  if (!pathname) return null;

  if (pathname === CLOCK) return "session";
  if (pathname === ADMIN) return "admin-overview";
  if (pathname === HR) return "hr-overview";
  if (pathname === TIP_DISTRIBUTION) return "tip-distribution";
  if (pathname === ACCOUNTS) return "accounts-overview";
  if (pathname === INTEGRATIONS) return "integrations";

  if (pathname === INVENTORY || pathname.startsWith(`${INVENTORY}/`)) {
    return "inventory-overview";
  }

  if (pathname === REPORTS || pathname.startsWith(`${REPORTS}/`)) {
    return "reports-ops";
  }

  return null;
};

/**
 * How-to / UI-help intent in supported app languages.
 * Used to skip data fast-paths so lookup_user_guide can run.
 */
export const isUserGuideHowToPrompt = (prompt: string): boolean => {
  const text = prompt.trim();
  if (!text) return false;

  return (
    /\bhow\s+(do\s+i|to|can\s+i|does|should\s+i)\b/i.test(text)
    || /\bwhere\s+(is|do\s+i|can\s+i|are)\b/i.test(text)
    || /\b(steps?\s+to|walk\s*me\s+through|explain\s+how|show\s+me\s+how)\b/i.test(text)
    || /\b(what\s+does\s+this\s+page|how\s+does\s+this\s+(page|screen|work))\b/i.test(text)
    || /\bcómo\b/i.test(text)
    || /\bcomo\s+(hago|puedo|faço|fazer)\b/i.test(text)
    || /\bdonde\b/i.test(text)
    || /\bonde\b/i.test(text)
    || /\bcomment\s+(faire|puis|je)\b/i.test(text)
    || /\bwie\s+(kann|mache|geht)\b/i.test(text)
    || /\bhoe\s+(doe|kan|werkt)\b/i.test(text)
    || /\bcome\s+(si|posso|funziona)\b/i.test(text)
    || /\bnasıl\b/i.test(text)
    || /\bкак\b/i.test(text)
    || /كيف/.test(text)
    || /\b(hilfe|ayuda|aide|ajuda|aiuto|yardım|помощь|مساعدة)\b/i.test(text)
  );
};

export type LookupUserGuideResult = {
  chapter: UserGuideChapterKey;
  language: string;
  title: string;
  content: string;
};

export const lookupUserGuide = async (args: {
  chapter: string;
  language: string;
  query?: string;
}): Promise<LookupUserGuideResult | {error: string}> => {
  const loaded = await loadUserGuideChapter(args.chapter, args.language);
  if (!loaded) {
    return {
      error: `Unknown or missing user guide chapter "${args.chapter}". Valid keys: ${USER_GUIDE_CHAPTER_KEYS.join(", ")}.`,
    };
  }

  const content = serializeUserGuideChapter(loaded.data, {query: args.query});
  if (!content) {
    return {error: `Chapter "${args.chapter}" has no usable text.`};
  }

  return {
    chapter: loaded.chapter,
    language: loaded.language,
    title: loaded.data.title || USER_GUIDE_CHAPTER_TITLES[loaded.chapter],
    content,
  };
};

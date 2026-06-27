import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE } from '@/lib/languages.ts';

export const I18N_NAMESPACES = [
  'common',
  'navigation',
  'auth',
  'settings',
  'toast',
  'menu',
  'cart',
  'orders',
  'payment',
  'kitchen',
  'order-display',
  'closing',
  'summary',
  'inventory',
  'reports',
  'delivery',
  'admin',
  'accounts',
  'validation',
] as const;

export type I18nNamespace = (typeof I18N_NAMESPACES)[number];

const localeModules = import.meta.glob('../locales/*/*.json');

const localeFolder = (lng: string) => (lng === 'pt-BR' ? 'pt-br' : lng);

const loadLocale = (lng: string, ns: string) => {
  const path = `../locales/${localeFolder(lng)}/${ns}.json`;
  const loader = localeModules[path];
  if (!loader) {
    return Promise.reject(new Error(`Missing locale: ${lng}/${ns}`));
  }
  return loader().then((m) => {
    const data = (m as { default?: object }).default ?? m;
    return data as object;
  });
};

const backend = {
  type: 'backend' as const,
  init: () => {},
  read: (lng: string, ns: string, callback: (err: Error | null, data?: object) => void) => {
    loadLocale(lng, ns)
      .then((data) => callback(null, data))
      .catch((err) => callback(err));
  },
};

export const i18nReady = i18n
  .use(backend)
  .use(initReactI18next)
  .init({
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: 'common',
    ns: [...I18N_NAMESPACES],
    partialBundledLanguages: true,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  })
  .then(() => i18n.loadNamespaces(['common', 'auth', 'validation', 'toast']));

export default i18n;

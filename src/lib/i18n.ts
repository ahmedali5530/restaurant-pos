import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LANGUAGE } from '@/lib/languages.ts';

import enCommon from '@/locales/en/common.json';
import enNavigation from '@/locales/en/navigation.json';
import enAuth from '@/locales/en/auth.json';
import enSettings from '@/locales/en/settings.json';
import enToast from '@/locales/en/toast.json';
import enMenu from '@/locales/en/menu.json';
import enCart from '@/locales/en/cart.json';
import enOrders from '@/locales/en/orders.json';
import enPayment from '@/locales/en/payment.json';
import enKitchen from '@/locales/en/kitchen.json';
import enClosing from '@/locales/en/closing.json';
import enSummary from '@/locales/en/summary.json';
import enInventory from '@/locales/en/inventory.json';
import enReports from '@/locales/en/reports.json';
import enDelivery from '@/locales/en/delivery.json';
import enAdmin from '@/locales/en/admin.json';
import enValidation from '@/locales/en/validation.json';

import esCommon from '@/locales/es/common.json';
import esNavigation from '@/locales/es/navigation.json';
import esAuth from '@/locales/es/auth.json';
import esSettings from '@/locales/es/settings.json';
import esToast from '@/locales/es/toast.json';
import esMenu from '@/locales/es/menu.json';
import esCart from '@/locales/es/cart.json';
import esOrders from '@/locales/es/orders.json';
import esPayment from '@/locales/es/payment.json';
import esKitchen from '@/locales/es/kitchen.json';
import esClosing from '@/locales/es/closing.json';
import esSummary from '@/locales/es/summary.json';
import esInventory from '@/locales/es/inventory.json';
import esReports from '@/locales/es/reports.json';
import esDelivery from '@/locales/es/delivery.json';
import esAdmin from '@/locales/es/admin.json';
import esValidation from '@/locales/es/validation.json';

import trCommon from '@/locales/tr/common.json';
import trNavigation from '@/locales/tr/navigation.json';
import trAuth from '@/locales/tr/auth.json';
import trSettings from '@/locales/tr/settings.json';
import trToast from '@/locales/tr/toast.json';
import trMenu from '@/locales/tr/menu.json';
import trCart from '@/locales/tr/cart.json';
import trOrders from '@/locales/tr/orders.json';
import trPayment from '@/locales/tr/payment.json';
import trKitchen from '@/locales/tr/kitchen.json';
import trClosing from '@/locales/tr/closing.json';
import trSummary from '@/locales/tr/summary.json';
import trInventory from '@/locales/tr/inventory.json';
import trReports from '@/locales/tr/reports.json';
import trDelivery from '@/locales/tr/delivery.json';
import trAdmin from '@/locales/tr/admin.json';
import trValidation from '@/locales/tr/validation.json';

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
  'closing',
  'summary',
  'inventory',
  'reports',
  'delivery',
  'admin',
  'validation',
] as const;

export type I18nNamespace = (typeof I18N_NAMESPACES)[number];

const resources = {
  en: {
    common: enCommon,
    navigation: enNavigation,
    auth: enAuth,
    settings: enSettings,
    toast: enToast,
    menu: enMenu,
    cart: enCart,
    orders: enOrders,
    payment: enPayment,
    kitchen: enKitchen,
    closing: enClosing,
    summary: enSummary,
    inventory: enInventory,
    reports: enReports,
    delivery: enDelivery,
    admin: enAdmin,
    validation: enValidation,
  },
  es: {
    common: esCommon,
    navigation: esNavigation,
    auth: esAuth,
    settings: esSettings,
    toast: esToast,
    menu: esMenu,
    cart: esCart,
    orders: esOrders,
    payment: esPayment,
    kitchen: esKitchen,
    closing: esClosing,
    summary: esSummary,
    inventory: esInventory,
    reports: esReports,
    delivery: esDelivery,
    admin: esAdmin,
    validation: esValidation,
  },
  tr: {
    common: trCommon,
    navigation: trNavigation,
    auth: trAuth,
    settings: trSettings,
    toast: trToast,
    menu: trMenu,
    cart: trCart,
    orders: trOrders,
    payment: trPayment,
    kitchen: trKitchen,
    closing: trClosing,
    summary: trSummary,
    inventory: trInventory,
    reports: trReports,
    delivery: trDelivery,
    admin: trAdmin,
    validation: trValidation,
  },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: 'common',
  ns: [...I18N_NAMESPACES],
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;

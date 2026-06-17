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

import ptBrCommon from '@/locales/pt-br/common.json';
import ptBrNavigation from '@/locales/pt-br/navigation.json';
import ptBrAuth from '@/locales/pt-br/auth.json';
import ptBrSettings from '@/locales/pt-br/settings.json';
import ptBrToast from '@/locales/pt-br/toast.json';
import ptBrMenu from '@/locales/pt-br/menu.json';
import ptBrCart from '@/locales/pt-br/cart.json';
import ptBrOrders from '@/locales/pt-br/orders.json';
import ptBrPayment from '@/locales/pt-br/payment.json';
import ptBrKitchen from '@/locales/pt-br/kitchen.json';
import ptBrClosing from '@/locales/pt-br/closing.json';
import ptBrSummary from '@/locales/pt-br/summary.json';
import ptBrInventory from '@/locales/pt-br/inventory.json';
import ptBrReports from '@/locales/pt-br/reports.json';
import ptBrDelivery from '@/locales/pt-br/delivery.json';
import ptBrAdmin from '@/locales/pt-br/admin.json';
import ptBrValidation from '@/locales/pt-br/validation.json';
import frCommon from '@/locales/fr/common.json';
import frNavigation from '@/locales/fr/navigation.json';
import frAuth from '@/locales/fr/auth.json';
import frSettings from '@/locales/fr/settings.json';
import frToast from '@/locales/fr/toast.json';
import frMenu from '@/locales/fr/menu.json';
import frCart from '@/locales/fr/cart.json';
import frOrders from '@/locales/fr/orders.json';
import frPayment from '@/locales/fr/payment.json';
import frKitchen from '@/locales/fr/kitchen.json';
import frClosing from '@/locales/fr/closing.json';
import frSummary from '@/locales/fr/summary.json';
import frInventory from '@/locales/fr/inventory.json';
import frReports from '@/locales/fr/reports.json';
import frDelivery from '@/locales/fr/delivery.json';
import frAdmin from '@/locales/fr/admin.json';
import frValidation from '@/locales/fr/validation.json';
import nlCommon from '@/locales/nl/common.json';
import nlNavigation from '@/locales/nl/navigation.json';
import nlAuth from '@/locales/nl/auth.json';
import nlSettings from '@/locales/nl/settings.json';
import nlToast from '@/locales/nl/toast.json';
import nlMenu from '@/locales/nl/menu.json';
import nlCart from '@/locales/nl/cart.json';
import nlOrders from '@/locales/nl/orders.json';
import nlPayment from '@/locales/nl/payment.json';
import nlKitchen from '@/locales/nl/kitchen.json';
import nlClosing from '@/locales/nl/closing.json';
import nlSummary from '@/locales/nl/summary.json';
import nlInventory from '@/locales/nl/inventory.json';
import nlReports from '@/locales/nl/reports.json';
import nlDelivery from '@/locales/nl/delivery.json';
import nlAdmin from '@/locales/nl/admin.json';
import nlValidation from '@/locales/nl/validation.json';
import deCommon from '@/locales/de/common.json';
import deNavigation from '@/locales/de/navigation.json';
import deAuth from '@/locales/de/auth.json';
import deSettings from '@/locales/de/settings.json';
import deToast from '@/locales/de/toast.json';
import deMenu from '@/locales/de/menu.json';
import deCart from '@/locales/de/cart.json';
import deOrders from '@/locales/de/orders.json';
import dePayment from '@/locales/de/payment.json';
import deKitchen from '@/locales/de/kitchen.json';
import deClosing from '@/locales/de/closing.json';
import deSummary from '@/locales/de/summary.json';
import deInventory from '@/locales/de/inventory.json';
import deReports from '@/locales/de/reports.json';
import deDelivery from '@/locales/de/delivery.json';
import deAdmin from '@/locales/de/admin.json';
import deValidation from '@/locales/de/validation.json';
import itCommon from '@/locales/it/common.json';
import itNavigation from '@/locales/it/navigation.json';
import itAuth from '@/locales/it/auth.json';
import itSettings from '@/locales/it/settings.json';
import itToast from '@/locales/it/toast.json';
import itMenu from '@/locales/it/menu.json';
import itCart from '@/locales/it/cart.json';
import itOrders from '@/locales/it/orders.json';
import itPayment from '@/locales/it/payment.json';
import itKitchen from '@/locales/it/kitchen.json';
import itClosing from '@/locales/it/closing.json';
import itSummary from '@/locales/it/summary.json';
import itInventory from '@/locales/it/inventory.json';
import itReports from '@/locales/it/reports.json';
import itDelivery from '@/locales/it/delivery.json';
import itAdmin from '@/locales/it/admin.json';
import itValidation from '@/locales/it/validation.json';
import arCommon from '@/locales/ar/common.json';
import arNavigation from '@/locales/ar/navigation.json';
import arAuth from '@/locales/ar/auth.json';
import arSettings from '@/locales/ar/settings.json';
import arToast from '@/locales/ar/toast.json';
import arMenu from '@/locales/ar/menu.json';
import arCart from '@/locales/ar/cart.json';
import arOrders from '@/locales/ar/orders.json';
import arPayment from '@/locales/ar/payment.json';
import arKitchen from '@/locales/ar/kitchen.json';
import arClosing from '@/locales/ar/closing.json';
import arSummary from '@/locales/ar/summary.json';
import arInventory from '@/locales/ar/inventory.json';
import arReports from '@/locales/ar/reports.json';
import arDelivery from '@/locales/ar/delivery.json';
import arAdmin from '@/locales/ar/admin.json';
import arValidation from '@/locales/ar/validation.json';
import ruCommon from '@/locales/ru/common.json';
import ruNavigation from '@/locales/ru/navigation.json';
import ruAuth from '@/locales/ru/auth.json';
import ruSettings from '@/locales/ru/settings.json';
import ruToast from '@/locales/ru/toast.json';
import ruMenu from '@/locales/ru/menu.json';
import ruCart from '@/locales/ru/cart.json';
import ruOrders from '@/locales/ru/orders.json';
import ruPayment from '@/locales/ru/payment.json';
import ruKitchen from '@/locales/ru/kitchen.json';
import ruClosing from '@/locales/ru/closing.json';
import ruSummary from '@/locales/ru/summary.json';
import ruInventory from '@/locales/ru/inventory.json';
import ruReports from '@/locales/ru/reports.json';
import ruDelivery from '@/locales/ru/delivery.json';
import ruAdmin from '@/locales/ru/admin.json';
import ruValidation from '@/locales/ru/validation.json';

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
  'pt-BR': {
    common: ptBrCommon,
    navigation: ptBrNavigation,
    auth: ptBrAuth,
    settings: ptBrSettings,
    toast: ptBrToast,
    menu: ptBrMenu,
    cart: ptBrCart,
    orders: ptBrOrders,
    payment: ptBrPayment,
    kitchen: ptBrKitchen,
    closing: ptBrClosing,
    summary: ptBrSummary,
    inventory: ptBrInventory,
    reports: ptBrReports,
    delivery: ptBrDelivery,
    admin: ptBrAdmin,
    validation: ptBrValidation,
  },
  fr: {
    common: frCommon,
    navigation: frNavigation,
    auth: frAuth,
    settings: frSettings,
    toast: frToast,
    menu: frMenu,
    cart: frCart,
    orders: frOrders,
    payment: frPayment,
    kitchen: frKitchen,
    closing: frClosing,
    summary: frSummary,
    inventory: frInventory,
    reports: frReports,
    delivery: frDelivery,
    admin: frAdmin,
    validation: frValidation,
  },
  nl: {
    common: nlCommon,
    navigation: nlNavigation,
    auth: nlAuth,
    settings: nlSettings,
    toast: nlToast,
    menu: nlMenu,
    cart: nlCart,
    orders: nlOrders,
    payment: nlPayment,
    kitchen: nlKitchen,
    closing: nlClosing,
    summary: nlSummary,
    inventory: nlInventory,
    reports: nlReports,
    delivery: nlDelivery,
    admin: nlAdmin,
    validation: nlValidation,
  },
  de: {
    common: deCommon,
    navigation: deNavigation,
    auth: deAuth,
    settings: deSettings,
    toast: deToast,
    menu: deMenu,
    cart: deCart,
    orders: deOrders,
    payment: dePayment,
    kitchen: deKitchen,
    closing: deClosing,
    summary: deSummary,
    inventory: deInventory,
    reports: deReports,
    delivery: deDelivery,
    admin: deAdmin,
    validation: deValidation,
  },
  it: {
    common: itCommon,
    navigation: itNavigation,
    auth: itAuth,
    settings: itSettings,
    toast: itToast,
    menu: itMenu,
    cart: itCart,
    orders: itOrders,
    payment: itPayment,
    kitchen: itKitchen,
    closing: itClosing,
    summary: itSummary,
    inventory: itInventory,
    reports: itReports,
    delivery: itDelivery,
    admin: itAdmin,
    validation: itValidation,
  },
  ar: {
    common: arCommon,
    navigation: arNavigation,
    auth: arAuth,
    settings: arSettings,
    toast: arToast,
    menu: arMenu,
    cart: arCart,
    orders: arOrders,
    payment: arPayment,
    kitchen: arKitchen,
    closing: arClosing,
    summary: arSummary,
    inventory: arInventory,
    reports: arReports,
    delivery: arDelivery,
    admin: arAdmin,
    validation: arValidation,
  },
  ru: {
    common: ruCommon,
    navigation: ruNavigation,
    auth: ruAuth,
    settings: ruSettings,
    toast: ruToast,
    menu: ruMenu,
    cart: ruCart,
    orders: ruOrders,
    payment: ruPayment,
    kitchen: ruKitchen,
    closing: ruClosing,
    summary: ruSummary,
    inventory: ruInventory,
    reports: ruReports,
    delivery: ruDelivery,
    admin: ruAdmin,
    validation: ruValidation,
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

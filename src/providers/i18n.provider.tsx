import React, { ReactNode, useEffect } from 'react';
import { useAtomValue } from 'jotai';
import { Settings } from 'luxon';
import i18n from '@/lib/i18n.ts';
import { DEFAULT_LANGUAGE, DEFAULT_TEXT_DIRECTION, isSupportedLanguage, isTextDirection } from '@/lib/languages.ts';
import { appPage } from '@/store/jotai.ts';

interface I18nProviderProps {
  children: ReactNode;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children }) => {
  const page = useAtomValue(appPage);
  const language = isSupportedLanguage(page.language) ? page.language : DEFAULT_LANGUAGE;
  const direction = isTextDirection(page.direction) ? page.direction : DEFAULT_TEXT_DIRECTION;

  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
    Settings.defaultLocale = language;
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [language, direction]);

  return <>{children}</>;
};

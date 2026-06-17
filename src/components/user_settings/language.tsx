import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { appPage } from '@/store/jotai.ts';
import {
  AppTextDirection,
  SUPPORTED_LANGUAGES,
  TEXT_DIRECTIONS,
} from '@/lib/languages.ts';
import { cn } from '@/lib/utils.ts';

export const LanguageSettings = () => {
  const [page, setPage] = useAtom(appPage);
  const { t } = useTranslation('settings');
  const currentLanguage = page.language ?? 'en';
  const currentDirection: AppTextDirection = page.direction ?? 'ltr';

  return (
    <div className="shadow p-5 rounded bg-white">
      <div className="flex items-start mb-5">
        <div>
          <h2 className="text-xl font-semibold mb-1">{t('language.title')}</h2>
          <p className="text-sm text-neutral-500">{t('language.description')}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            type="button"
            className={cn(
              'btn btn-filled lg',
              currentLanguage === lang.code
                ? '!bg-success-500 text-white border-success-500'
                : '!bg-neutral-100 text-neutral-900 border-neutral-200'
            )}
            onClick={() => {
              setPage((prev) => ({
                ...prev,
                language: lang.code,
                direction: lang.code === 'ar' ? 'rtl' : 'ltr',
              }));
            }}
          >
            {lang.label}
          </button>
        ))}
      </div>

      <div className="flex items-start mb-5">
        <div>
          <h2 className="text-xl font-semibold mb-1">{t('direction.title')}</h2>
          <p className="text-sm text-neutral-500">{t('direction.description')}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {TEXT_DIRECTIONS.map((item) => (
          <button
            key={item.code}
            type="button"
            className={cn(
              'btn btn-filled lg',
              currentDirection === item.code
                ? '!bg-success-500 text-white border-success-500'
                : '!bg-neutral-100 text-neutral-900 border-neutral-200'
            )}
            onClick={() => {
              setPage((prev) => ({
                ...prev,
                direction: item.code,
              }));
            }}
          >
            {t(item.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
};

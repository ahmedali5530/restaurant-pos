import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { appPage } from '@/store/jotai.ts';
import { cn } from '@/lib/utils.ts';
import { Button } from '@/components/common/input/button.tsx';
import {
  BRAND_IDS,
  DEFAULT_BRAND,
  DEFAULT_THEME,
  THEME_PREFERENCES,
  type AppBrandId,
  type AppThemePreference,
} from '@/lib/theme.ts';

export const ThemeSettings = () => {
  const [page, setPage] = useAtom(appPage);
  const { t } = useTranslation('settings');
  const currentTheme: AppThemePreference = page.theme ?? DEFAULT_THEME;
  const currentBrand: AppBrandId = page.brand ?? DEFAULT_BRAND;

  return (
    <div className="shadow p-5 rounded-xl bg-surface-elevated" data-testid="settings-card-theme">
      <div className="flex items-start mb-5">
        <div>
          <h2 className="text-xl font-semibold mb-1">{t('theme.title')}</h2>
          <p className="text-sm text-muted">{t('theme.description')}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {THEME_PREFERENCES.map((mode) => (
          <Button
            key={mode}
            type="button"
            variant="primary"
            className={cn(currentTheme === mode ? 'active' : '')}
            size="lg"
            onClick={() => {
              setPage((prev) => ({
                ...prev,
                theme: mode,
              }));
            }}
          >
            {t(`theme.${mode}`)}
          </Button>
        ))}
      </div>

      <div className="mb-3">
        <h3 className="text-base font-semibold mb-1">{t('theme.brandTitle')}</h3>
        <p className="text-sm text-muted">{t('theme.brandDescription')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {BRAND_IDS.map((brandId) => (
          <Button
            key={brandId}
            type="button"
            variant="primary"
            className={cn(currentBrand === brandId ? 'active' : '')}
            size="lg"
            onClick={() => {
              setPage((prev) => ({
                ...prev,
                brand: brandId,
              }));
            }}
          >
            {t(`theme.brand.${brandId}`)}
          </Button>
        ))}
      </div>
    </div>
  );
};

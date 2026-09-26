import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { appPage } from '@/store/jotai.ts';
import { cn } from '@/lib/utils.ts';
import { Button } from '@/components/common/input/button.tsx';
import { Input } from '@/components/common/input/input.tsx';
import { useTheme } from '@/providers/theme.provider.tsx';
import {
  BRAND_IDS,
  DEFAULT_BRAND,
  DEFAULT_THEME,
  THEME_PREFERENCES,
  rgbChannelsToHex,
  type AppBrandId,
  type AppThemePreference,
} from '@/lib/theme.ts';
import {
  DEFAULT_CUSTOM_PRIMARY,
  normalizeHex,
} from '@/lib/derive-brand-palette.ts';
import { resolveBrandPalette } from '@/lib/brand-palettes.ts';

export const ThemeSettings = () => {
  const [page, setPage] = useAtom(appPage);
  const { t } = useTranslation('settings');
  const { resolvedTheme } = useTheme();
  const currentTheme: AppThemePreference = page.theme ?? DEFAULT_THEME;
  const currentBrand: AppBrandId = page.brand ?? DEFAULT_BRAND;
  const storedPrimary = normalizeHex(page.customPrimary) ?? DEFAULT_CUSTOM_PRIMARY;
  const [hexDraft, setHexDraft] = useState(storedPrimary);

  const preview = useMemo(() => {
    const hex = normalizeHex(hexDraft) ?? storedPrimary;
    return resolveBrandPalette('custom', resolvedTheme, hex);
  }, [hexDraft, storedPrimary, resolvedTheme]);

  const applyCustomPrimary = (raw: string) => {
    const hex = normalizeHex(raw);
    if (!hex) return;
    setHexDraft(hex);
    setPage((prev) => ({
      ...prev,
      brand: 'custom',
      customPrimary: hex,
    }));
  };

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
      <div className="flex flex-wrap gap-2 mb-6">
        {BRAND_IDS.map((brandId) => (
          <Button
            key={brandId}
            type="button"
            variant="primary"
            className={cn(currentBrand === brandId ? 'active' : '')}
            size="lg"
            onClick={() => {
              const nextPrimary = normalizeHex(page.customPrimary) ?? DEFAULT_CUSTOM_PRIMARY;
              setPage((prev) => ({
                ...prev,
                brand: brandId,
                ...(brandId === 'custom' ? { customPrimary: nextPrimary } : {}),
              }));
              if (brandId === 'custom') {
                setHexDraft(nextPrimary);
              }
            }}
          >
            {t(`theme.brand.${brandId}`)}
          </Button>
        ))}
      </div>

      {currentBrand === 'custom' ? (
        <div className="rounded-lg border border-border bg-surface p-4" data-testid="settings-custom-brand">
          <p className="text-sm text-muted mb-3">{t('theme.customDescription')}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="form-label" htmlFor="theme-custom-color">
                {t('theme.customPrimary')}
              </label>
              <div>
                <Input
                  id="theme-custom-color"
                  type="color"
                  className="h-12 w-16 cursor-pointer p-1"
                  value={normalizeHex(hexDraft) ?? storedPrimary}
                  onChange={(e) => applyCustomPrimary(e.target.value)}
                />
              </div>
            </div>
            <div className="min-w-[9rem] flex-1">
              <label className="form-label" htmlFor="theme-custom-hex">
                {t('theme.customHex')}
              </label>
              <div>
                <Input
                  id="theme-custom-hex"
                  type="text"
                  value={hexDraft}
                  placeholder={DEFAULT_CUSTOM_PRIMARY}
                  onChange={(e) => setHexDraft(e.target.value)}
                  onBlur={() => applyCustomPrimary(hexDraft)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyCustomPrimary(hexDraft);
                  }}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="primary"
              filled
              size="lg"
              onClick={() => applyCustomPrimary(hexDraft)}
            >
              {t('theme.customApply')}
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted">{t('theme.customPreview')}</span>
            <span
              className="inline-block h-6 w-6 rounded-md border border-border"
              style={{ backgroundColor: rgbChannelsToHex(preview.primary) }}
              title="primary"
            />
            <span
              className="inline-block h-6 w-6 rounded-md border border-border"
              style={{ backgroundColor: rgbChannelsToHex(preview.surface) }}
              title="surface"
            />
            <span
              className="inline-block h-6 w-6 rounded-md border border-border"
              style={{ backgroundColor: rgbChannelsToHex(preview.canvas) }}
              title="canvas"
            />
            <span
              className="inline-block h-6 w-6 rounded-md border border-border"
              style={{ backgroundColor: rgbChannelsToHex(preview.border) }}
              title="border"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
};

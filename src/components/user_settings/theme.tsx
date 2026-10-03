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
      // Drop any four-color base saved by the earlier experiment.
      customPaletteBase: undefined,
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
      <div className="mb-6 inline-flex overflow-hidden rounded-full border border-border">
        {THEME_PREFERENCES.map((mode) => {
          const active = currentTheme === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setPage((prev) => ({
                  ...prev,
                  theme: mode,
                }));
              }}
              className={cn(
                'px-4 py-1.5 text-sm transition-colors',
                active ? 'bg-primary text-primary-fg font-semibold' : 'text-muted',
              )}
            >
              {t(`theme.${mode}`)}
            </button>
          );
        })}
      </div>

      <div className="mb-3">
        <h3 className="text-base font-semibold mb-1">{t('theme.brandTitle')}</h3>
        <p className="text-sm text-muted">{t('theme.brandDescription')}</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {BRAND_IDS.map((brandId) => {
          const swatchPrimary = normalizeHex(hexDraft) ?? storedPrimary;
          const palette = resolveBrandPalette(brandId, resolvedTheme, swatchPrimary);
          const active = currentBrand === brandId;
          return (
            <button
              key={brandId}
              type="button"
              onClick={() => {
                setPage((prev) => ({
                  ...prev,
                  brand: brandId,
                  ...(brandId === 'custom'
                    ? { customPrimary: normalizeHex(prev.customPrimary) ?? DEFAULT_CUSTOM_PRIMARY, customPaletteBase: undefined }
                    : {}),
                }));
                if (brandId === 'custom') {
                  setHexDraft(storedPrimary);
                }
              }}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                active ? 'border-primary bg-primary/10 font-semibold' : 'border-border',
              )}
            >
              <span className="flex h-4 w-4 overflow-hidden rounded-full border border-border" aria-hidden>
                <span className="h-full w-1/2" style={{ background: `rgb(${palette.canvas})` }} />
                <span className="h-full w-1/2" style={{ background: `rgb(${palette.primary})` }} />
              </span>
              {t(`theme.brand.${brandId}`)}
            </button>
          );
        })}
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
            <div className="min-w-0 flex-1">
              <label className="form-label" htmlFor="theme-custom-hex">
                {t('theme.customHex')}
              </label>
              <div>
                <Input
                  id="theme-custom-hex"
                  type="text"
                  value={hexDraft}
                  placeholder={DEFAULT_CUSTOM_PRIMARY}
                  onChange={(e) => {
                    setHexDraft(e.target.value);
                    const hex = normalizeHex(e.target.value);
                    if (hex) applyCustomPrimary(hex);
                  }}
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
              onClick={() => applyCustomPrimary(hexDraft)}
            >
              {t('theme.customApply')}
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted">{t('theme.customPreview')}</span>
            {[preview.primary, preview.surface, preview.canvas, preview.border].map((channels, index) => (
              <span
                key={index}
                className="inline-block h-6 w-6 rounded-md border border-border"
                style={{ backgroundColor: rgbChannelsToHex(channels) }}
                title={['primary', 'surface', 'canvas', 'border'][index]}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

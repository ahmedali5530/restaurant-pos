import {useDB} from "@/api/db/db.ts";
import {toast} from "sonner";
import {useTranslation} from 'react-i18next';
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Setting} from "@/api/model/setting.ts";
import {Controller, useForm} from "react-hook-form";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Switch} from "@/components/common/input/switch.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {useEffect, useState, useMemo} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faTimes} from "@fortawesome/free-solid-svg-icons";
import {detectMimeType, toArrayBuffer} from "@/utils/files.ts";
import {ReceiptSectionEditor} from "@/components/settings/prints/receipt-section.editor.tsx";
import {DEFAULT_SECTION_IMAGE_PX, ReceiptSection} from "@/api/model/receipt-section.ts";

type SelectOption = { label: string; value: string };

const DEFAULT_LOGO_PX = 150;
const MIN_IMAGE_PX = 8;

const LOGO_PRESET_SIZES: Array<{ width: number; height: number }> = [
  { width: 80, height: 80 },
  { width: 120, height: 120 },
  { width: 150, height: 150 },
  { width: 200, height: 80 },
  { width: 256, height: 80 },
  { width: 384, height: 100 },
];

type PrintFormValues = {
  printMode?: SelectOption | string
  paperWidthMm?: SelectOption | number | string
  rasterThreshold?: number
  rasterMaxHeightPx?: number | string
  showLogo?: boolean
  logo?: ArrayBuffer | null
  logoWidth?: number
  logoHeight?: number
  logoOffsetX?: number
  headerSections?: ReceiptSection[]
  footerSections?: ReceiptSection[]
  showVatNumber?: boolean
  vatName?: string
  vatNumber?: string
  topMargin?: number
  bottomMargin?: number
  leftMargin?: number
  rightMargin?: number
  showItemNumber?: boolean
  showItemName?: boolean
  showItemQuantity?: boolean
  showItemPrice?: boolean
  showItemTotal?: boolean
}

function toSelectOption(value: unknown, options: SelectOption[]): SelectOption {
  const raw = typeof value === 'object' && value != null && 'value' in (value as object)
    ? String((value as SelectOption).value)
    : String(value ?? '');
  return options.find((o) => o.value === raw) ?? options[0];
}

function selectValue(v: SelectOption | string | number | undefined, fallback: string): string {
  if (v == null || v === '') return fallback;
  if (typeof v === 'object' && 'value' in v) return String(v.value);
  return String(v);
}

function clampImageDim(value: unknown, fallback: number, maxWidth: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(MIN_IMAGE_PX, Math.min(maxWidth, Math.round(n)));
}

function parseSectionDim(value: unknown): number {
  return clampImageDim(value, DEFAULT_SECTION_IMAGE_PX, 576);
}

function logoPresetValue(width: number, height: number): string {
  return `${width}x${height}`;
}

interface Props {
  open: boolean
  onClose: () => void;
  data?: Setting
}

function normalizeSectionsFromDb(sections: unknown): ReceiptSection[] {
  if (!Array.isArray(sections)) return [];
  return sections.map((section) => {
    const s = section as Partial<ReceiptSection>;
    return {
      enabled: s.enabled !== false,
      type: s.type === 'image' ? 'image' : 'text',
      align: s.align === 'left' || s.align === 'right' ? s.align : 'center',
      size: s.size === 'medium' || s.size === 'large' ? s.size : 'normal',
      content: s.content ?? '',
      width: parseSectionDim(s.width),
      height: parseSectionDim(s.height),
    };
  });
}

function preserveSectionImages(
  sections: ReceiptSection[] | undefined,
  existing: ReceiptSection[] | undefined,
): ReceiptSection[] {
  if (!sections) return [];
  return sections.map((section, index) => {
    const next: ReceiptSection = {
      ...section,
      width: parseSectionDim(section.width),
      height: parseSectionDim(section.height),
    };
    if (next.type !== 'image') return next;
    const hasNewImage = next.content instanceof ArrayBuffer
      || (Array.isArray(next.content) && next.content.length > 0);
    if (hasNewImage) return next;
    const prev = existing?.[index];
    if (prev?.type === 'image' && prev.content) {
      return {...next, content: prev.content};
    }
    return next;
  });
}

export const PrintForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoArrayBuffer, setLogoArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);

  const db = useDB();
  const {handleSubmit, control, reset, setValue, getValues, watch} = useForm<PrintFormValues>();
  const watchedPrintMode = watch('printMode');
  const watchedPaperWidthMm = watch('paperWidthMm');
  const watchedLogoWidth = watch('logoWidth');
  const watchedLogoHeight = watch('logoHeight');

  const printModeOptions: SelectOption[] = useMemo(() => [
    { label: t('forms.printModeText'), value: 'text' },
    { label: t('forms.printModeRaster'), value: 'raster' },
  ], [t]);

  const paperWidthOptions: SelectOption[] = useMemo(() => [
    { label: t('forms.paperWidth58'), value: '58' },
    { label: t('forms.paperWidth80'), value: '80' },
  ], [t]);

  const logoPresetOptions: SelectOption[] = useMemo(() => {
    const presets = LOGO_PRESET_SIZES.map(({ width, height }) => ({
      label: `${width} × ${height}`,
      value: logoPresetValue(width, height),
    }));
    return [
      ...presets,
      { label: t('forms.logoPresetCustom'), value: 'custom' },
    ];
  }, [t]);

  const isRasterMode = selectValue(watchedPrintMode, 'text') === 'raster';
  const paperWidthMm = Number(selectValue(watchedPaperWidthMm, '80'));
  const maxLogoWidthPx = paperWidthMm === 58 ? 384 : 576;

  const selectedLogoPreset = useMemo(() => {
    const w = Number(watchedLogoWidth) || DEFAULT_LOGO_PX;
    const h = Number(watchedLogoHeight) || DEFAULT_LOGO_PX;
    const match = LOGO_PRESET_SIZES.find((p) => p.width === w && p.height === h);
    if (match) {
      return logoPresetOptions.find((o) => o.value === logoPresetValue(match.width, match.height))
        ?? logoPresetOptions[logoPresetOptions.length - 1];
    }
    return logoPresetOptions.find((o) => o.value === 'custom')
      ?? logoPresetOptions[logoPresetOptions.length - 1];
  }, [watchedLogoWidth, watchedLogoHeight, logoPresetOptions]);

  const existingLogoUrl = useMemo(() => {
    if (!data?.values?.logo) return null;

    try {
      const buffer = toArrayBuffer(data.values.logo);
      const mimeType = detectMimeType(buffer, 'image/png');
      const blob = new Blob([buffer], { type: mimeType });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.log('Failed to create logo preview', e);
      return null;
    }
  }, [data?.values?.logo]);

  const currentLogoUrl = logoPreview || existingLogoUrl;

  useEffect(() => {
    if(data?.values){
      reset({
        ...data.values,
        printMode: toSelectOption(data.values.printMode ?? 'text', printModeOptions),
        paperWidthMm: toSelectOption(data.values.paperWidthMm ?? 80, paperWidthOptions),
        rasterThreshold: data.values.rasterThreshold != null ? Number(data.values.rasterThreshold) : 180,
        rasterMaxHeightPx: data.values.rasterMaxHeightPx != null && data.values.rasterMaxHeightPx !== ''
          ? Number(data.values.rasterMaxHeightPx)
          : '',
        logoWidth: clampImageDim(data.values.logoWidth, DEFAULT_LOGO_PX, 576),
        logoHeight: clampImageDim(data.values.logoHeight, DEFAULT_LOGO_PX, 576),
        logo: null,
        headerSections: normalizeSectionsFromDb(data.values.headerSections),
        footerSections: normalizeSectionsFromDb(data.values.footerSections),
      });
      setLogoPreview(null);
      setLogoArrayBuffer(data?.values?.logo || null);
      setLogoRemoved(false);
    }
  }, [data?.values, reset, printModeOptions, paperWidthOptions]);

  useEffect(() => {
    return () => {
      if (existingLogoUrl) {
        URL.revokeObjectURL(existingLogoUrl);
      }
      if (logoPreview) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [existingLogoUrl, logoPreview]);

  const handleLogoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setLogoPreview(null);
      setLogoArrayBuffer(null);
      setValue('logo', null);
      setLogoRemoved(false);
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      setLogoArrayBuffer(buffer);
      setLogoRemoved(false);

      const blob = new Blob([buffer], { type: file.type || 'image/png' });
      const objectUrl = URL.createObjectURL(blob);

      if (logoPreview) {
        URL.revokeObjectURL(logoPreview);
      }

      setLogoPreview(objectUrl);
      setValue('logo', buffer);
    } catch (err) {
      console.log('Failed to read logo file', err);
      setLogoPreview(null);
      setLogoArrayBuffer(null);
      setValue('logo', null);
      setLogoRemoved(false);
    }
  };

  const handleRemoveLogo = () => {
    if (logoPreview) {
      URL.revokeObjectURL(logoPreview);
    }
    setLogoPreview(null);
    setLogoArrayBuffer(null);
    setValue('logo', null);
    setLogoRemoved(true);
  };

  const handleLogoPresetChange = (option: SelectOption | null) => {
    if (!option || option.value === 'custom') return;
    const [wRaw, hRaw] = option.value.split('x');
    const width = Number(wRaw);
    const height = Number(hRaw);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    setValue('logoWidth', clampImageDim(width, DEFAULT_LOGO_PX, maxLogoWidthPx));
    setValue('logoHeight', clampImageDim(height, DEFAULT_LOGO_PX, 576));
  };

  const closeModal = () => {
    onClose();
  }

  const onSubmit = async (values: PrintFormValues) => {
    const maxHRaw = values.rasterMaxHeightPx;
    const maxH = maxHRaw === '' || maxHRaw == null ? null : Number(maxHRaw);
    const paperMm = Number(selectValue(values.paperWidthMm, '80'));
    const maxW = paperMm === 58 ? 384 : 576;
    const vals: Record<string, unknown> = {
      ...values,
      printMode: selectValue(values.printMode, 'text'),
      paperWidthMm: paperMm,
      rasterThreshold: values.rasterThreshold != null && values.rasterThreshold !== ('' as unknown)
        ? Number(values.rasterThreshold)
        : 180,
      rasterMaxHeightPx: maxH != null && !Number.isNaN(maxH) && maxH > 0 ? maxH : null,
      logoWidth: clampImageDim(values.logoWidth, DEFAULT_LOGO_PX, maxW),
      logoHeight: clampImageDim(values.logoHeight, DEFAULT_LOGO_PX, 576),
      renderOptions: (data?.values?.renderOptions && typeof data.values.renderOptions === 'object')
        ? data.values.renderOptions
        : {},
    };

    if (logoRemoved) {
      vals.logo = null;
    } else if (logoArrayBuffer) {
      vals.logo = logoArrayBuffer;
    } else if (data?.values?.logo) {
      vals.logo = data.values.logo;
    } else {
      vals.logo = null;
    }

    vals.headerSections = preserveSectionImages(
      values.headerSections,
      normalizeSectionsFromDb(data?.values?.headerSections),
    );
    vals.footerSections = preserveSectionImages(
      values.footerSections,
      normalizeSectionsFromDb(data?.values?.footerSections),
    );

    try {
      if (data?.id) {
        await db.merge(data.id, {
          values: {
            ...data.values,
            ...vals
          }
        })
      }

      closeModal();
      toast.success(t('toast:admin.printSettingsSaved'));
    } catch (e) {
      toast.error(e);
      console.log(e)
    }
  }

  return (
    <>
      <Modal
        testId="admin-form-print-setting"
        title={data ? t('forms.updatePrintSettings', { key: data?.key }) : t('forms.createPrintSettings')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-5 flex-col mb-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block mb-1">{t('forms.printMode')}</label>
                <Controller
                  name="printMode"
                  control={control}
                  render={({field}) => (
                    <div>
                      <ReactSelect
                        value={field.value as SelectOption}
                        onChange={field.onChange}
                        options={printModeOptions}
                      />
                      <p className="text-xs text-muted mt-1">{t('forms.printModeHint')}</p>
                    </div>
                  )}
                />
              </div>
              <div>
                <label className="block mb-1">{t('forms.paperWidthMm')}</label>
                <Controller
                  name="paperWidthMm"
                  control={control}
                  render={({field}) => (
                    <div>
                      <ReactSelect
                        value={field.value as SelectOption}
                        onChange={field.onChange}
                        options={paperWidthOptions}
                      />
                      <p className="text-xs text-muted mt-1">{t('forms.paperWidthMmHint')}</p>
                    </div>
                  )}
                />
              </div>
            </div>

            {isRasterMode && (
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Controller
                    name="rasterThreshold"
                    control={control}
                    render={({field}) => (
                      <div>
                        <Input
                          label={t('forms.rasterThreshold')}
                          type="number"
                          value={field.value ?? 180}
                          onChange={(e) => {
                            const raw = e.target.value;
                            field.onChange(raw === '' ? 180 : Number(raw));
                          }}
                        />
                        <p className="text-xs text-muted mt-1">{t('forms.rasterThresholdHint')}</p>
                      </div>
                    )}
                  />
                </div>
                <div>
                  <Controller
                    name="rasterMaxHeightPx"
                    control={control}
                    render={({field}) => (
                      <div>
                        <Input
                          label={t('forms.rasterMaxHeightPx')}
                          type="number"
                          value={field.value ?? ''}
                          onChange={(e) => {
                            const raw = e.target.value;
                            field.onChange(raw === '' ? '' : Number(raw));
                          }}
                        />
                        <p className="text-xs text-muted mt-1">{t('forms.rasterMaxHeightPxHint')}</p>
                      </div>
                    )}
                  />
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3">
              <div className="flex items-end">
                <Controller
                  name="showLogo"
                  control={control}
                  render={({field}) => (
                    <Switch
                      checked={field.value}
                      onChange={field.onChange}
                    >
                      {t('forms.showLogo')}
                    </Switch>
                  )}
                />
              </div>
              <div className="flex-1">
                {currentLogoUrl && !logoRemoved ? (
                  <div className="relative inline-block">
                    <img
                      src={currentLogoUrl}
                      alt={t('forms.logoPreview')}
                      className="max-h-20 max-w-full object-contain border border-border rounded p-2"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="absolute -top-2 -right-2 bg-danger-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-danger-600 transition-colors"
                      aria-label={t('forms.removeLogo')}
                    >
                      <FontAwesomeIcon icon={faTimes} size="xs" />
                    </button>
                  </div>
                ) : (
                  <Controller
                    name="logo"
                    control={control}
                    render={({field}) => (
                      <input
                        type="file"
                        accept="image/*"
                        className="input"
                        onChange={(e) => {
                          handleLogoChange(e);
                          field.onChange(e);
                        }}
                      />
                    )}
                  />
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-4 gap-3">
              <div>
                <label className="block mb-1">{t('forms.logoPreset')}</label>
                <div>
                  <ReactSelect
                    value={selectedLogoPreset}
                    onChange={handleLogoPresetChange}
                    options={logoPresetOptions}
                  />
                </div>
              </div>
              <div>
                <Controller
                  name="logoWidth"
                  control={control}
                  render={({field}) => (
                    <div>
                      <Input
                        label={t('forms.logoWidth')}
                        type="number"
                        value={field.value ?? DEFAULT_LOGO_PX}
                        onChange={(e) => {
                          const raw = e.target.value;
                          field.onChange(raw === '' ? DEFAULT_LOGO_PX : Number(raw));
                        }}
                      />
                    </div>
                  )}
                />
              </div>
              <div>
                <Controller
                  name="logoHeight"
                  control={control}
                  render={({field}) => (
                    <div>
                      <Input
                        label={t('forms.logoHeight')}
                        type="number"
                        value={field.value ?? DEFAULT_LOGO_PX}
                        onChange={(e) => {
                          const raw = e.target.value;
                          field.onChange(raw === '' ? DEFAULT_LOGO_PX : Number(raw));
                        }}
                      />
                    </div>
                  )}
                />
              </div>
              <div>
                <Controller
                  name="logoOffsetX"
                  control={control}
                  render={({field}) => (
                    <div>
                      <Input
                        label={t('forms.logoOffsetX')}
                        type="number"
                        value={field.value ?? 0}
                        onChange={(e) => {
                          const raw = e.target.value;
                          field.onChange(raw === '' ? 0 : Number(raw));
                        }}
                        allowNegative
                      />
                      <p className="text-xs text-muted mt-1">{t('forms.logoOffsetXHint')}</p>
                    </div>
                  )}
                />
              </div>
            </div>
            <p className="text-xs text-muted -mt-2">{t('forms.logoDimensionsHint')}</p>

            <ReceiptSectionEditor
              control={control}
              name="headerSections"
              label={t('forms.headerSections')}
              setValue={setValue}
              getValues={getValues}
            />

            <ReceiptSectionEditor
              control={control}
              name="footerSections"
              label={t('forms.footerSections')}
              setValue={setValue}
              getValues={getValues}
            />

            <div className="grid md:grid-cols-3 gap-3">
              <div className="flex items-end">
                <Controller
                  name="showVatNumber"
                  control={control}
                  render={({field}) => (
                    <Switch
                      checked={field.value}
                      onChange={field.onChange}
                    >
                      {t('forms.showVatNumber')}
                    </Switch>
                  )}
                />
              </div>
              <div className="flex-1">
                <Controller
                  name="vatName"
                  control={control}
                  render={({field}) => (
                    <Input label={t('forms.vatName')} value={field.value} onChange={field.onChange}/>
                  )}
                />
              </div>
              <div className="flex-1">
                <Controller
                  name="vatNumber"
                  control={control}
                  render={({field}) => (
                    <Input label={t('forms.vatNumber')} value={field.value} onChange={field.onChange}/>
                  )}
                />
              </div>
            </div>
            <div className="grid md:grid-cols-4 gap-3">
              <div>
                <Controller
                  name="topMargin"
                  control={control}
                  render={({field}) => (
                    <Input label={t('forms.topMargin')} type="number" value={field.value} onChange={field.onChange}/>
                  )}
                />
              </div>
              <div>
                <Controller
                  name="bottomMargin"
                  control={control}
                  render={({field}) => (
                    <Input label={t('forms.bottomMargin')} type="number" value={field.value} onChange={field.onChange}/>
                  )}
                />
              </div>
              <div>
                <Controller
                  name="leftMargin"
                  control={control}
                  render={({field}) => (
                    <Input label={t('forms.leftMargin')} type="number" value={field.value} onChange={field.onChange}/>
                  )}
                />
              </div>
              <div>
                <Controller
                  name="rightMargin"
                  control={control}
                  render={({field}) => (
                    <Input label={t('forms.rightMargin')} type="number" value={field.value} onChange={field.onChange}/>
                  )}
                />
              </div>
            </div>
            <div className="grid md:grid-cols-5 gap-3">
              <div>
                <Controller
                  name="showItemNumber"
                  control={control}
                  render={({field}) => (
                    <Switch
                      checked={field.value}
                      onChange={field.onChange}
                    >
                      Show item number
                    </Switch>
                  )}
                />
              </div>
              <div>
                <Controller
                  name="showItemName"
                  control={control}
                  render={({field}) => (
                    <Switch
                      checked={field.value}
                      onChange={field.onChange}
                    >
                      Show item name
                    </Switch>
                  )}
                />
              </div>
              <div>
                <Controller
                  name="showItemQuantity"
                  control={control}
                  render={({field}) => (
                    <Switch
                      checked={field.value}
                      onChange={field.onChange}
                    >
                      Show quantity
                    </Switch>
                  )}
                />
              </div>
              <div>
                <Controller
                  name="showItemPrice"
                  control={control}
                  render={({field}) => (
                    <Switch
                      checked={field.value}
                      onChange={field.onChange}
                    >
                      Show item price
                    </Switch>
                  )}
                />
              </div>
              <div>
                <Controller
                  name="showItemTotal"
                  control={control}
                  render={({field}) => (
                    <Switch
                      checked={field.value}
                      onChange={field.onChange}
                    >
                      Show item total
                    </Switch>
                  )}
                />
              </div>
            </div>
          </div>
          <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
        </form>
      </Modal>
    </>
  )
}

import {useEffect, useMemo, useState} from "react";
import {Controller, Control, useFieldArray, useWatch, UseFormSetValue, UseFormGetValues} from "react-hook-form";
import {useTranslation} from "react-i18next";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faTimes} from "@fortawesome/free-solid-svg-icons";
import {Switch} from "@/components/common/input/switch.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Textarea} from "@/components/common/input/textarea.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {DeleteConfirm} from "@/components/common/table/delete.confirm.tsx";
import {DEFAULT_SECTION_IMAGE_PX, emptyReceiptSection} from "@/api/model/receipt-section.ts";
import {detectMimeType, toArrayBuffer} from "@/utils/files.ts";

interface Props {
  control: Control<any>
  name: 'headerSections' | 'footerSections'
  label: string
  setValue?: UseFormSetValue<any>
  getValues?: UseFormGetValues<any>
}

interface SectionRowProps {
  control: Control<any>
  name: 'headerSections' | 'footerSections'
  index: number
  fieldId: string
  imagePreview?: string
  setValue?: UseFormSetValue<any>
  getValues?: UseFormGetValues<any>
  onImageChange: (
    index: number,
    event: React.ChangeEvent<HTMLInputElement>,
    onChange: (value: string | ArrayBuffer | null) => void,
  ) => void
  onInitPreview: (index: number, value: string | ArrayBuffer | null | undefined) => void
  onClearPreview: (index: number) => void
  onRemove: (index: number) => void
}

const SectionRow = ({
  control,
  name,
  index,
  fieldId,
  imagePreview,
  setValue,
  getValues,
  onImageChange,
  onInitPreview,
  onClearPreview,
  onRemove,
}: SectionRowProps) => {
  const {t} = useTranslation(['admin', 'common']);
  const sectionType = useWatch({
    control,
    name: `${name}.${index}.type`,
    defaultValue: 'text',
  }) as string;

  const isImage = sectionType === 'image';

  const ensureImageDims = () => {
    if (!setValue || !getValues) return;
    const width = getValues(`${name}.${index}.width`);
    const height = getValues(`${name}.${index}.height`);
    if (width == null || width === '') {
      setValue(`${name}.${index}.width`, DEFAULT_SECTION_IMAGE_PX);
    }
    if (height == null || height === '') {
      setValue(`${name}.${index}.height`, DEFAULT_SECTION_IMAGE_PX);
    }
  };

  useEffect(() => {
    if (isImage) ensureImageDims();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when type becomes image
  }, [isImage]);

  return (
    <div key={fieldId} className="border border-border rounded-lg p-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Controller
          name={`${name}.${index}.enabled`}
          control={control}
          render={({field: f}) => (
            <Switch checked={!!f.value} onChange={f.onChange}>
              {t('forms.sectionEnabled')}
            </Switch>
          )}
        />

        <Controller
          name={`${name}.${index}.type`}
          control={control}
          render={({field: f}) => (
            <div className="min-w-[120px]">
              <label className="">{t('forms.sectionType')}</label>
              <select
                className="input w-full"
                value={f.value || 'text'}
                onChange={(e) => {
                  f.onChange(e);
                  if (e.target.value === 'image') ensureImageDims();
                }}
              >
                <option value="text">{t('forms.sectionTypeText')}</option>
                <option value="image">{t('forms.sectionTypeImage')}</option>
              </select>
            </div>
          )}
        />

        <Controller
          name={`${name}.${index}.align`}
          control={control}
          render={({field: f}) => (
            <div className="min-w-[120px]">
              <label className="">{t('forms.sectionAlign')}</label>
              <select className="input w-full" value={f.value || 'center'} onChange={f.onChange}>
                <option value="left">{t('forms.sectionAlignLeft')}</option>
                <option value="center">{t('forms.sectionAlignCenter')}</option>
                <option value="right">{t('forms.sectionAlignRight')}</option>
              </select>
            </div>
          )}
        />

        {!isImage && (
          <Controller
            name={`${name}.${index}.size`}
            control={control}
            render={({field: f}) => (
              <div className="min-w-[120px]">
                <label className="">{t('forms.sectionSize')}</label>
                <select className="input w-full" value={f.value || 'normal'} onChange={f.onChange}>
                  <option value="normal">{t('forms.sectionSizeNormal')}</option>
                  <option value="medium">{t('forms.sectionSizeMedium')}</option>
                  <option value="large">{t('forms.sectionSizeLarge')}</option>
                </select>
              </div>
            )}
          />
        )}

        {isImage && (
          <>
            <div className="min-w-[100px]">
              <Controller
                name={`${name}.${index}.width`}
                control={control}
                defaultValue={DEFAULT_SECTION_IMAGE_PX}
                render={({field: f}) => (
                  <div>
                    <Input
                      label={t('forms.sectionImageWidth')}
                      type="number"
                      value={f.value ?? DEFAULT_SECTION_IMAGE_PX}
                      onChange={(e) => {
                        const raw = e.target.value;
                        f.onChange(raw === '' ? DEFAULT_SECTION_IMAGE_PX : Number(raw));
                      }}
                    />
                  </div>
                )}
              />
            </div>
            <div className="min-w-[100px]">
              <Controller
                name={`${name}.${index}.height`}
                control={control}
                defaultValue={DEFAULT_SECTION_IMAGE_PX}
                render={({field: f}) => (
                  <div>
                    <Input
                      label={t('forms.sectionImageHeight')}
                      type="number"
                      value={f.value ?? DEFAULT_SECTION_IMAGE_PX}
                      onChange={(e) => {
                        const raw = e.target.value;
                        f.onChange(raw === '' ? DEFAULT_SECTION_IMAGE_PX : Number(raw));
                      }}
                    />
                  </div>
                )}
              />
            </div>
          </>
        )}

        <div className="flex-1 min-w-[200px]">
          <Controller
            name={`${name}.${index}.content`}
            control={control}
            render={({field: contentField}) => {
              if (isImage) {
                onInitPreview(index, contentField.value);
                return imagePreview ? (
                  <div className="relative inline-block">
                    <img
                      src={imagePreview}
                      alt={t('forms.sectionImagePreview')}
                      className="max-h-20 max-w-full object-contain border border-border rounded p-2"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onClearPreview(index);
                        contentField.onChange('');
                      }}
                      className="absolute -top-2 -right-2 bg-danger-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-danger-600 transition-colors"
                      aria-label={t('forms.removeSectionImage')}
                    >
                      <FontAwesomeIcon icon={faTimes} size="xs" />
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept="image/*"
                    className="input"
                    onChange={(e) => onImageChange(index, e, contentField.onChange)}
                  />
                );
              }

              return (
                <div>
                  <label className="">{t('forms.sectionContent')}</label>
                  <Textarea
                    className="w-full min-h-[72px]"
                    value={typeof contentField.value === 'string' ? contentField.value : ''}
                    onChange={contentField.onChange}
                  />
                </div>
              );
            }}
          />
        </div>

        <DeleteConfirm
          message={t('forms.deleteReceiptSection')}
          onConfirm={() => onRemove(index)}
        />
      </div>
    </div>
  );
};

export const ReceiptSectionEditor = ({control, name, label, setValue, getValues}: Props) => {
  const {t} = useTranslation(['admin', 'common']);
  const {fields, append, remove} = useFieldArray({
    control,
    name,
  });
  const [imagePreviews, setImagePreviews] = useState<Record<string, string>>({});

  const previewUrls = useMemo(() => Object.values(imagePreviews), [imagePreviews]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const setPreview = (key: string, buffer: ArrayBuffer | null | undefined) => {
    setImagePreviews((prev) => {
      const next = {...prev};
      if (next[key]) {
        URL.revokeObjectURL(next[key]);
        delete next[key];
      }
      if (buffer) {
        const mimeType = detectMimeType(buffer, 'image/png');
        const blob = new Blob([buffer], {type: mimeType});
        next[key] = URL.createObjectURL(blob);
      }
      return next;
    });
  };

  const handleImageChange = async (
    index: number,
    event: React.ChangeEvent<HTMLInputElement>,
    onChange: (value: string | ArrayBuffer | null) => void,
  ) => {
    const file = event.target.files?.[0] ?? null;
    const key = `${name}-${index}`;
    if (!file) {
      setPreview(key, null);
      onChange('');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      setPreview(key, buffer);
      onChange(buffer);
    } catch (err) {
      console.log('Failed to read section image', err);
      setPreview(key, null);
      onChange('');
    }
  };

  const initPreviewFromValue = (index: number, value: string | ArrayBuffer | null | undefined) => {
    const key = `${name}-${index}`;
    if (imagePreviews[key]) return;
    if (value == null || value === '') return;
    try {
      const buffer = toArrayBuffer(value as string | ArrayBuffer | Uint8Array);
      setPreview(key, buffer);
    } catch {
      // ignore invalid stored image
    }
  };

  const clearPreview = (index: number) => {
    setPreview(`${name}-${index}`, null);
  };

  const handleRemoveSection = (index: number) => {
    clearPreview(index);
    remove(index);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{label}</h3>
        <Button
          type="button"
          variant="secondary"
          icon={faPlus}
          onClick={() => append(emptyReceiptSection())}
        >
          {t('forms.addSection')}
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-sm text-muted">{t('forms.noReceiptSections')}</p>
      )}

      {fields.map((field, index) => (
        <SectionRow
          key={field.id}
          control={control}
          name={name}
          index={index}
          fieldId={field.id}
          imagePreview={imagePreviews[`${name}-${index}`]}
          setValue={setValue}
          getValues={getValues}
          onImageChange={handleImageChange}
          onInitPreview={initPreviewFromValue}
          onClearPreview={clearPreview}
          onRemove={handleRemoveSection}
        />
      ))}
    </div>
  );
};

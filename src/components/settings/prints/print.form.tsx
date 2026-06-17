import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {toast} from "sonner";
import {useTranslation} from 'react-i18next';
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Setting} from "@/api/model/setting.ts";
import {Controller, useForm} from "react-hook-form";
import {Input} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Switch} from "@/components/common/input/switch.tsx";
import {useEffect, useState, useMemo} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faTimes} from "@fortawesome/free-solid-svg-icons";
import i18n from '@/lib/i18n.ts';
import {detectMimeType, toArrayBuffer} from "@/utils/files.ts";

interface Props {
  open: boolean
  onClose: () => void;
  data?: Setting
}

export const PrintForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoArrayBuffer, setLogoArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);

  const db = useDB();
  const {handleSubmit, control, reset, setValue} = useForm();

  // Create preview URL from existing logo in database
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

  // Use existing logo URL or new preview
  const currentLogoUrl = logoPreview || existingLogoUrl;

  useEffect(() => {
    if(data?.values){
      reset({
        ...data?.values,
        logo: null
      });
      setLogoPreview(null);
      setLogoArrayBuffer(data?.values?.logo || null);
      setLogoRemoved(false);
    }
  }, [data?.values, reset]);

  // Clean up object URLs on unmount
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
      
      // Revoke previous preview if exists
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
    // Only revoke logoPreview (newly selected), not existingLogoUrl (managed by useMemo)
    if (logoPreview) {
      URL.revokeObjectURL(logoPreview);
    }
    setLogoPreview(null);
    setLogoArrayBuffer(null);
    setValue('logo', null);
    setLogoRemoved(true);
  };

  const closeModal = () => {
    onClose();
  }

  const onSubmit = async (values: any) => {
    const vals = {...values};
    
    // Handle logo: if removed, set to null; if new one selected, use it; otherwise keep existing
    if (logoRemoved) {
      vals.logo = null;
    } else if (logoArrayBuffer) {
      // New logo was selected
      vals.logo = logoArrayBuffer;
    } else if (data?.values?.logo) {
      // Keep existing logo
      vals.logo = data.values.logo;
    } else {
      // No logo
      vals.logo = null;
    }

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
        title={data ? t('forms.updatePrintSettings', { key: data?.key }) : t('forms.createPrintSettings')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-5 flex-col mb-3">
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
                      Show logo
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
                      className="max-h-20 max-w-full object-contain border border-neutral-300 rounded p-2"
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
            <div className="grid md:grid-cols-2 gap-3">
              <div className="flex items-end">
                <Controller
                  name="showCompanyName"
                  control={control}
                  render={({field}) => (
                    <Switch
                      checked={field.value}
                      onChange={field.onChange}
                    >
                      Show company name
                    </Switch>
                  )}
                />
              </div>
              <div className="flex-1">
                <Controller
                  name="companyName"
                  control={control}
                  render={({field}) => (
                    <Input label={t('forms.companyName')} value={field.value} onChange={field.onChange}/>
                  )}
                />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="flex items-end">
                <Controller
                  name="showCompanyAddress"
                  control={control}
                  render={({field}) => (
                    <Switch
                      checked={field.value}
                      onChange={field.onChange}
                    >
                      Show company address
                    </Switch>
                  )}
                />
              </div>
              <div className="flex-1">
                <Controller
                  name="companyAddress"
                  control={control}
                  render={({field}) => (
                    <Input label={t('forms.companyAddress')} value={field.value} onChange={field.onChange}/>
                  )}
                />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="flex items-end">
                <Controller
                  name="showTopDescription"
                  control={control}
                  render={({field}) => (
                    <Switch
                      checked={field.value}
                      onChange={field.onChange}
                    >
                      Show top description
                    </Switch>
                  )}
                />
              </div>
              <div className="flex-1">
                <Controller
                  name="topDescription"
                  control={control}
                  render={({field}) => (
                    <Input label={t('forms.topDescription')} value={field.value} onChange={field.onChange}/>
                  )}
                />
              </div>
            </div>
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
                      Show VAT number
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
            <div className="grid md:grid-cols-2 gap-3">
              <div className="flex items-end">
                <Controller
                  name="showBottomDescription"
                  control={control}
                  render={({field}) => (
                    <Switch
                      checked={field.value}
                      onChange={field.onChange}
                    >
                      Show bottom description
                    </Switch>
                  )}
                />
              </div>
              <div className="flex-1">
                <Controller
                  name="bottomDescription"
                  control={control}
                  render={({field}) => (
                    <Input label={t('forms.bottomDescription')} value={field.value} onChange={field.onChange}/>
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

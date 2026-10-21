import { Printer } from "@/api/model/printer.ts";
import { useEffect } from "react";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import {Controller, useForm, useWatch} from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { toast } from "sonner";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { InputField } from "@/components/common/form/rhf-fields.tsx";
import { Button } from "@/components/common/input/button.tsx";
import * as yup from "yup";
import { transformValue } from "@/lib/utils.ts";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";

import { emitEntityCrudSave } from '@/integrations/events/entity-write.ts';
interface Props {
  open: boolean
  onClose: () => void;
  data?: Printer
}

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  priority: yup.mixed().optional(),
  ip_address: yup.string().optional(),
  port: yup.number().typeError(i18n.t('validation:invalidPort')).optional(),
  type: yup.object({
    label: yup.string(),
    value: yup.string()
  }).nullable().optional(),
  vid: yup.string().optional(),
  pid: yup.string().optional(),
  path: yup.string().optional(),
  print_mode: yup.object({
    label: yup.string(),
    value: yup.string()
  }).nullable().optional(),
  paper_width_mm: yup.object({
    label: yup.string(),
    value: yup.string()
  }).nullable().optional(),
  command_set: yup.object({
    label: yup.string(),
    value: yup.string()
  }).nullable().optional(),
});

export const PrinterForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const closeModal = () => {
    onClose();
  }

  const { control, handleSubmit, formState: {errors}, reset } = useForm({
    resolver: yupResolver(validationSchema)
  });

  useEffect(() => {
    if(data){
      const modeVal = data.print_mode ? String(data.print_mode) : '';
      const widthVal = data.paper_width_mm != null && data.paper_width_mm !== ''
        ? String(data.paper_width_mm)
        : '';
      const commandVal = data.command_set ? String(data.command_set) : '';
      reset({
        ...data,
        name: data.name,
        priority: data.priority,
        ip_address: data.ip_address,
        port: data.port,
        type: data.type ? {
          label: data.type,
          value: data.type
        } : null,
        print_mode: modeVal
          ? { label: modeVal === 'raster' ? t('forms.printModeRaster') : t('forms.printModeText'), value: modeVal }
          : null,
        paper_width_mm: widthVal
          ? {
              label: widthVal === '58' ? t('forms.paperWidth58') : t('forms.paperWidth80'),
              value: widthVal,
            }
          : null,
        command_set: commandVal
          ? {
              label: commandVal === 'star-graphic' ? t('forms.commandSetStar') : t('forms.commandSetEscpos'),
              value: commandVal,
            }
          : null,
      });
    }
  }, [data, reset, t]);

  const db = useDB();

  const onSubmit = async (values: any) => {
    const vals = {
      ...values,
      type: values?.type ? values.type.value : null,
      print_mode: values?.print_mode?.value ? values.print_mode.value : null,
      paper_width_mm: values?.paper_width_mm?.value
        ? Number(values.paper_width_mm.value)
        : null,
      command_set: values?.command_set?.value ? values.command_set.value : null,
    };

    try {
      if(data?.id){
        await db.update(data.id, {
          ...vals,
        })
      }else{
        await db.create(Tables.printers, {
          ...vals
        });
      }

      
      await emitEntityCrudSave({
        domain: 'manage',
        table: Tables.printers,
        entityId: data?.id ? String(data.id) : Tables.printers,
        isUpdate: Boolean(data?.id),
        source: 'settings-form',
      });

      closeModal();
      toast.success(t('toast:admin.printerSaved', { name: values.name }));
    }catch(e){
      toast.error(e);
      console.log(e)
    }
  }

  const type = useWatch({
    name: 'type',
    control: control
  })

  return (
    <>
      <Modal
        testId="admin-form-printer"
        title={data ? t('forms.updatePrinter', { name: data?.name }) : t('forms.createPrinter')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-3 mb-3 flex-col">
            <div className="flex-1">
              <InputField name="name" control={control} label={t('columns.name')} autoFocus error={errors?.name?.message}/>
            </div>
            <div className="flex-1">
              <label htmlFor="type">{t('columns.type')}</label>
              <Controller
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={['Network', 'USB', 'Serial', 'Bluetooth'].map(item => ({
                      label: item,
                      value: item
                    }))}
                  />
                )}
                name="type"
                control={control}
              />
            </div>
            {type?.value === 'Network' && (
              <div className="flex-1 flex gap-3">
                <div className="flex-1">
                  <Controller
                    name="ip_address"
                    control={control}
                    render={({field}) => (
                      <Input
                        label={t('columns.path')}
                        value={field.value}
                        onChange={field.onChange}
                        error={errors?.ip_address?.message}/>
                    )}
                  />

                </div>
                <div className="flex-1">
                  <Controller
                    render={({ field }) => (
                      <Input
                        type="number"
                        label={t('columns.port')}
                        error={errors?.port?.message}
                        value={transformValue.input(field.value)}
                        onChange={(e) => field.onChange(transformValue.output(e))}
                      />
                    )}
                    name="port"
                    control={control}
                  />
                </div>
              </div>
            )}

            {type?.value === 'USB' && (
              <div className="flex-1 flex gap-3">
                <div className="flex-1">
                  <Controller
                    name="vid"
                    control={control}
                    render={({field}) => (
                      <Input
                        label={t('forms.vid')}
                        value={field.value}
                        onChange={field.onChange}
                        error={errors?.vid?.message}/>
                    )}
                  />

                </div>
                <div className="flex-1">
                  <Controller
                    render={({ field }) => (
                      <Input
                        label={t('forms.pid')}
                        error={errors?.pid?.message}
                        value={field.value}
                        onChange={field.onChange}
                      />
                    )}
                    name="pid"
                    control={control}
                  />
                </div>
              </div>
            )}

            {(type?.value === 'Bluetooth' || type?.value === 'Serial') && (
              <div className="flex-1 flex gap-3">
                <div className="flex-1">
                  <Controller
                    name="path"
                    control={control}
                    render={({field}) => (
                      <Input
                        label={t('columns.path')}
                        value={field.value}
                        onChange={field.onChange}
                        error={errors?.path?.message}/>
                    )}
                  />
                </div>
              </div>
            )}

            <div className="flex-1">
              <label htmlFor="command_set">{t('forms.printerCommandSet')}</label>
              <Controller
                render={({field}) => (
                  <div>
                    <ReactSelect
                      value={field.value}
                      onChange={field.onChange}
                      isClearable
                      placeholder={t('forms.commandSetEscpos')}
                      options={[
                        { label: t('forms.commandSetEscpos'), value: 'escpos' },
                        { label: t('forms.commandSetStar'), value: 'star-graphic' },
                      ]}
                    />
                    <p className="text-xs text-muted mt-1">{t('forms.printerCommandSetHint')}</p>
                  </div>
                )}
                name="command_set"
                control={control}
              />
            </div>
            <div className="flex-1">
              <label htmlFor="print_mode">{t('forms.printerPrintMode')}</label>
              <Controller
                render={({field}) => (
                  <div>
                    <ReactSelect
                      value={field.value}
                      onChange={field.onChange}
                      isClearable
                      placeholder={t('forms.usePrintSettings')}
                      options={[
                        { label: t('forms.printModeText'), value: 'text' },
                        { label: t('forms.printModeRaster'), value: 'raster' },
                      ]}
                    />
                    <p className="text-xs text-muted mt-1">{t('forms.printerPrintModeHint')}</p>
                  </div>
                )}
                name="print_mode"
                control={control}
              />
            </div>
            <div className="flex-1">
              <label htmlFor="paper_width_mm">{t('forms.printerPaperWidth')}</label>
              <Controller
                render={({field}) => (
                  <div>
                    <ReactSelect
                      value={field.value}
                      onChange={field.onChange}
                      isClearable
                      placeholder={t('forms.usePrintSettings')}
                      options={[
                        { label: t('forms.paperWidth58'), value: '58' },
                        { label: t('forms.paperWidth80'), value: '80' },
                      ]}
                    />
                    <p className="text-xs text-muted mt-1">{t('forms.printerPaperWidthHint')}</p>
                  </div>
                )}
                name="paper_width_mm"
                control={control}
              />
            </div>
          </div>
          <div>
            <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

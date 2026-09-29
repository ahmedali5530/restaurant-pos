import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { InputField } from "@/components/common/form/rhf-fields.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { toast } from 'sonner';
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { useEffect } from "react";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import { Tax } from "@/api/model/tax.ts";
import { emitEntityCrudSave } from '@/integrations/events/entity-write.ts';
import { useHqCatalogBranchEdit } from '@/hooks/useHqCatalogBranchEdit.ts';

interface Props {
  open: boolean
  onClose: () => void;
  data?: Tax
}

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  rate: yup.number().required(i18n.t('validation:required')),
  priority: yup.string().required(i18n.t('validation:required')),
});

export const TaxForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);
  const { isBranchEditMode, loadMerged, save } = useHqCatalogBranchEdit(Tables.taxes);

  const closeModal = () => {
    onClose();
    reset({
      name: null,
      rate: null,
      priority: null
    });
  }

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      const merged = isBranchEditMode
        ? await loadMerged(data.id)
        : null;
      if (cancelled) return;
      const src: any = merged || data;
      reset({
        ...src,
        name: src.name,
        rate: src.rate,
        priority: String(src.priority ?? ''),
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isBranchEditMode]);

  const db = useDB();

  const { control, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: yupResolver(validationSchema)
  });

  const onSubmit = async (values: any) => {
    const vals = { ...values };
    vals.priority = parseInt(vals.priority);

    try {
      if (isBranchEditMode && !data?.id) {
        toast.error(t('admin:hqBranchEdit.createBlocked'));
        return;
      }

      await save({
        id: data?.id,
        nextValues: {
          rate: vals.rate,
          priority: vals.priority,
        },
        structuralWrite: async () => {
          if (data?.id) {
            await db.update(data.id, { ...vals });
          } else {
            await db.create(Tables.taxes, { ...vals });
          }
          await emitEntityCrudSave({
            domain: 'manage',
            table: Tables.taxes,
            entityId: data?.id ? String(data.id) : Tables.taxes,
            isUpdate: Boolean(data?.id),
            source: 'settings-form',
          });
        },
      });

      closeModal();
      toast.success(
        isBranchEditMode
          ? t('admin:hqBranchEdit.overrideSaved')
          : t('toast:admin.taxSaved', { name: values.name })
      );
    } catch ( e: any ) {
      toast.error(e?.message || e);
      console.log(e)
    }
  }

  return (
    <>
      <Modal
        testId="admin-form-tax"
        title={data ? t('forms.updateTax', { name: data?.name }) : t('forms.createTax')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          {isBranchEditMode && (
            <p className="text-xs text-muted mb-3">{t('admin:hqBranchEdit.structuralLocked')}</p>
          )}
          <div className="flex gap-3 flex-col mb-3">
            <div className="flex-1">
              <InputField
                name="name"
                control={control}
                label={t('columns.name')}
                autoFocus
                error={errors?.name?.message}
                disabled={isBranchEditMode}
              />
            </div>
            <div className="flex-1">
              <Controller
                render={({ field }) => (
                  <Input
                    label={t('columns.ratePercent')}
                    value={field.value}
                    onChange={field.onChange}
                    error={errors?.rate?.message}
                  />
                )}
                name="rate"
                control={control}
              />
            </div>

            <div className="flex-1">
              <Controller
                render={({ field }) => (
                  <Input
                    type="number"
                    label={t('columns.priority')}
                    error={errors?.priority?.message}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
                name="priority"
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

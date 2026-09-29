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
import React, { useMemo,  useEffect } from "react";
import { OrderType } from "@/api/model/order_type.ts";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import {Switch} from "@/components/common/input/switch.tsx";

import { emitEntityCrudSave } from '@/integrations/events/entity-write.ts';
import { useHqCatalogBranchEdit } from '@/hooks/useHqCatalogBranchEdit.ts';

interface Props {
  open: boolean
  onClose: () => void;
  data?: OrderType
}

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  priority: yup.string().required(i18n.t('validation:required')),
  allow_service_charges: yup.boolean(),
});

export const OrderTypeForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);
  const { isBranchEditMode, loadMerged, save } = useHqCatalogBranchEdit(Tables.order_types);

  const closeModal = () => {
    onClose();
    reset({
      name: null,
      priority: null,
      allow_service_charges: false
    });
  }

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      const merged = isBranchEditMode ? await loadMerged(data.id) : null;
      if (cancelled) return;
      const src: any = merged || data;
      reset({
        ...src,
        priority: String(src.priority ?? ''),
        allow_service_charges: !!src.allow_service_charges,
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
          priority: vals.priority,
          allow_service_charges: vals.allow_service_charges,
        },
        structuralWrite: async () => {
          if( data?.id ) {
            await db.update(data.id, {
              ...vals
            })
          } else {
            await db.create(Tables.order_types, {
              ...vals
            });
          }

          await emitEntityCrudSave({
            domain: 'manage',
            table: Tables.order_types,
            entityId: data?.id ? String(data.id) : Tables.order_types,
            isUpdate: Boolean(data?.id),
            source: 'settings-form',
          });
        },
      });

      closeModal();
      toast.success(
        isBranchEditMode
          ? t('admin:hqBranchEdit.overrideSaved')
          : t('toast:admin.orderTypeSaved', { name: values.name })
      );
    } catch ( e ) {
      toast.error(e);
      console.log(e)
    }
  }

  return (
    <>
      <Modal
        testId="admin-form-order-type"
        title={data ? t('forms.updateOrderType', { name: data?.name }) : t('forms.createOrderType')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          {isBranchEditMode && (
            <p className="text-xs text-muted mb-3">{t('admin:hqBranchEdit.structuralLocked')}</p>
          )}
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <InputField name="name" control={control} label={t('columns.name')} autoFocus error={errors?.name?.message} disabled={isBranchEditMode}/>
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

          <div className="mb-3 flex-1">
            <div className="flex-1">
              <Controller
                name={`allow_service_charges`}
                control={control}
                render={({ field }) => (
                  <Switch checked={!!field.value} onChange={field.onChange}>
                    Allow service charges
                  </Switch>
                )}
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

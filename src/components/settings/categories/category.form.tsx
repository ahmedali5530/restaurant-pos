import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { InputField } from "@/components/common/form/rhf-fields.tsx";
import { Button } from "@/components/common/input/button.tsx";
import { Controller, useForm } from "react-hook-form";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { Category } from "@/api/model/category.ts";
import { toast } from 'sonner';
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { useEffect } from "react";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import {Switch} from "@/components/common/input/switch.tsx";
import { emitEntityCrudSave } from '@/integrations/events/entity-write.ts';
import { useHqCatalogBranchEdit } from '@/hooks/useHqCatalogBranchEdit.ts';

interface Props {
  open: boolean
  onClose: () => void;
  data?: Category
}

const validationSchema = yup.object({
  name: yup.string().required(i18n.t('validation:required')),
  priority: yup.string().required(i18n.t('validation:required')).typeError(i18n.t('validation:mustBeNumber')),
  show_in_menu: yup.boolean()
});

export const CategoryForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);
  const { isBranchEditMode, loadMerged, save } = useHqCatalogBranchEdit(Tables.categories);

  const closeModal = () => {
    onClose();
    reset({
      name: null,
      priority: null,
      show_in_menu: null
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
        name: src.name,
        priority: String(src.priority ?? ''),
        show_in_menu: src.show_in_menu,
      });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isBranchEditMode]);

  const db = useDB();

  const { control, handleSubmit, formState: {errors}, reset } = useForm({
    resolver: yupResolver(validationSchema)
  });

  const onSubmit = async (values: any) => {
    const vals = {...values};
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
          show_in_menu: vals.show_in_menu,
        },
        structuralWrite: async () => {
          if (data?.id) {
            await db.update(data.id, { ...vals });
          } else {
            await db.create(Tables.categories, { ...vals });
          }
          await emitEntityCrudSave({
            domain: 'manage',
            table: Tables.categories,
            entityId: data?.id ? String(data.id) : Tables.categories,
            isUpdate: Boolean(data?.id),
            source: 'settings-form',
          });
        },
      });

      closeModal();
      toast.success(
        isBranchEditMode
          ? t('admin:hqBranchEdit.overrideSaved')
          : t('toast:admin.categorySaved', { name: values.name })
      );
    }catch(e: any){
      toast.error(e?.message || e);
      console.log(e)
    }
  }

  return (
    <>
      <Modal
        testId="admin-form-category"
        title={data ? t('forms.updateCategory', { name: data?.name }) : t('forms.createCategory')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          {isBranchEditMode && (
            <p className="text-xs text-muted mb-3">{t('admin:hqBranchEdit.structuralLocked')}</p>
          )}
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <InputField
                name="name"
                control={control}
                label={t('forms.nameOfCategory')}
                autoFocus
                error={errors?.name?.message}
                disabled={isBranchEditMode}
              />
            </div>
            <div className="flex-1">
              <Controller
                render={({field}) => (
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
          <div className="mb-3">
            <div className="flex-1">
              <Controller
                name={`show_in_menu`}
                control={control}
                render={({ field }) => (
                  <Switch checked={field.value} onChange={field.onChange}>
                    Show this category in menu
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

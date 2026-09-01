import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {Controller, useForm} from "react-hook-form";
import {useDB} from "@/api/db/db.ts";
import {toast} from "sonner";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import * as yup from "yup";
import {yupResolver} from "@hookform/resolvers/yup";
import {Category} from "@/api/model/category.ts";
import {Switch} from "@/components/common/input/switch.tsx";

interface Props {
  open: boolean
  onClose: () => void;
  data: Category[]
}

const validationSchema = yup.object({
  show_in_menu: yup.boolean().required(i18n.t('validation:required'))
});

export const CategoryBulkForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const db = useDB();

  const closeModal = () => {
    onClose();
    reset({
      show_in_menu: false
    });
  };

  const {control, handleSubmit, reset} = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {
      show_in_menu: false
    }
  });

  const onSubmit = async (values: any) => {
    if (!data?.length) {
      toast.error(t('toast:admin.noCategoriesSelected'));
      return;
    }

    try {
      await Promise.all(
        data.map((category) => db.merge(category.id, {
          show_in_menu: values.show_in_menu
        }))
      );

      toast.success(t('toast:admin.categoriesBulkUpdated', { count: data.length }));
      closeModal();
    } catch (error) {
      toast.error(error);
      console.log(error);
    }
  };

  return (
    <Modal
      title={t('forms.bulkUpdateCategories', { count: data?.length || 0 })}
      open={open}
      onClose={closeModal}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="mb-3">
          <Controller
            name="show_in_menu"
            control={control}
            render={({field}) => (
              <Switch checked={field.value} onChange={field.onChange}>
                {t('forms.showCategoryInMenu')}
              </Switch>
            )}
          />
        </div>
        <div>
          <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};

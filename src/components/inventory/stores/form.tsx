import React, {useEffect} from "react";
import { useTranslation } from 'react-i18next';
import * as yup from "yup";
import {useForm} from "react-hook-form";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {InputField} from "@/components/common/form/rhf-fields.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {ensureLocationForStore} from "@/lib/inventory/location.service.ts";
import {recordIdToString} from "@/api/reports/shared/records.ts";

interface InventoryStoreFormValues {
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: InventoryStore;
}

const validationSchema = yup.object({
  name: yup.string().required("This is required"),
}).required();

export const InventoryStoreForm = ({open, onClose, data}: Props) => {
  const { t } = useTranslation('inventory');
  const db = useDB();

  const {control, handleSubmit, formState: {errors}, reset} = useForm({
    resolver: yupResolver(validationSchema),
  });

  const closeModal = () => {
    onClose();
    reset({
      name: "",
    });
  };

  useEffect(() => {
    if (data) {
      reset({
        name: data.name ?? "",
      });
    }
  }, [data, reset]);

  const onSubmit = async (values: InventoryStoreFormValues) => {
    try {
      const payload = {
        name: values.name,
      };

      let storeId = data?.id ? recordIdToString(data.id) : "";
      if (data?.id) {
        await db.update(data.id, payload);
      } else {
        const [created] = await db.create(Tables.inventory_stores, payload);
        storeId = recordIdToString(created?.id) || String(created?.id ?? "");
      }

      // Phase 8: keep inventory_location shim in sync with stores
      if (storeId) {
        await ensureLocationForStore(db, storeId, {name: values.name, type: "Store"});
      }

      toast.success(t('toast:inventory.storeSaved', { name: values.name }));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Modal
      title={data ? `Update ${data?.name}` : "Create new store"}
      open={open}
      onClose={closeModal}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex-1">
            <InputField name="name" control={control} label={t('columns.name')} autoFocus error={errors?.name?.message} />
          </div>
        </div>
        <div>
          <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};


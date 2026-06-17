import React, {useEffect} from "react";
import { useTranslation } from 'react-i18next';
import * as yup from "yup";
import {Controller, useFieldArray, useForm} from "react-hook-form";
import {yupResolver} from "@hookform/resolvers/yup";
import {toast} from "sonner";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {useDB} from "@/api/db/db.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {Input, InputError} from "@/components/common/input/input.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {InventoryItemGroup} from "@/api/model/inventory_item_group.ts";
import {InventoryItem} from "@/api/model/inventory_item.ts";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus, faTrash} from "@fortawesome/free-solid-svg-icons";
import {StringRecordId} from "surrealdb";
import _ from "lodash";

interface InventoryItemGroupFormValues {
  main_item: { label: string; value: string } | null;
  base_quantity: number;
  sub_items: Array<{
    item: { label: string; value: string } | null;
    base_quantity: number | string;
  }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data?: InventoryItemGroup;
}

const validationSchema = yup.object({
  main_item: yup.object({
    label: yup.string(),
    value: yup.string()
  }).required("This is required").nullable(),
  base_quantity: yup.number().typeError("This should be a number").required("This is required"),
  sub_items: yup.array().of(yup.object({
    item: yup.object({
      label: yup.string(),
      value: yup.string()
    }).required("This is required").nullable(),
    quantity: yup.number().typeError("This should be a number").required("This is required"),
  })).min(1, "Add at least one sub item"),
}).required();

export const InventoryItemGroupForm = ({open, onClose, data}: Props) => {
  const { t } = useTranslation('inventory');
  const db = useDB();

  const {
    data: items,
    fetchData: fetchItems,
    isFetching: loadingItems,
  } = useApi<SettingsData<InventoryItem>>(Tables.inventory_items, [], [], 0, 99999, [], {
    enabled: false
  });

  const {
    control,
    register,
    handleSubmit,
    formState: {errors},
    reset,
  } = useForm({
    resolver: yupResolver(validationSchema),
  });

  const {fields, append, remove} = useFieldArray({
    control,
    name: "sub_items"
  });

  useEffect(() => {
    if (open) {
      fetchItems();
    }
  }, [open, fetchItems]);

  useEffect(() => {
    if (data) {
      reset({
        main_item: data.main_item ? {
          label: `${data.main_item.name}-${data.main_item.code}`,
          value: data.main_item.id
        } : null,
        base_quantity: data.base_quantity ?? 1,
        sub_items: data.sub_items?.map((subItem) => ({
          item: subItem.item ? {
            label: `${subItem.item.name}-${subItem.item.code}`,
            value: subItem.item.id
          } : null,
          quantity: subItem.quantity ?? 1
        })) ?? [{
          item: null,
          quantity: 1
        }]
      });
    } else if (open) {
      reset({
        main_item: null,
        base_quantity: 1,
        sub_items: [{
          item: null,
          quantity: 1
        }]
      });
    }
  }, [data, open, reset]);

  const closeModal = () => {
    onClose();
    reset({
      main_item: null,
      base_quantity: 1,
        sub_items: [{
          item: null,
          quantity: 1
        }]
    });
  };

  const toRecordId = (value?: string | { toString(): string }) => {
    if (!value) return undefined;
    const stringValue = typeof value === "string" ? value : value.toString();
    return new StringRecordId(stringValue);
  };

  const onSubmit = async (values: any) => {
    try {
      const payload = {
        main_item: values.main_item ? toRecordId(values.main_item.value) : undefined,
        base_quantity: Number(values.base_quantity),
        sub_items: []
      };

      let groupId: any = data?.id;

      if (groupId) {
        await db.update(groupId, payload);
        if (data?.sub_items?.length) {
          await Promise.all(
            data.sub_items
              .filter((subItem) => subItem.id)
              .map((subItem) => db.delete(subItem.id!))
          );
        }
      } else {
        const [created] = await db.create(Tables.inventory_item_groups, payload);
        groupId = created?.id;
      }

      const groupIdString = groupId
        ? typeof groupId === "string"
          ? groupId
          : groupId
        : undefined;

      if (!groupIdString) {
        throw new Error("Failed to resolve item group identifier");
      }

      const itemRefs = [];
      await Promise.all(
        values.sub_items.map(async (subItem) => {
          const [c] = await db.create(Tables.inventory_item_group_items, {
            item: subItem.item ? toRecordId(subItem.item.value) : undefined,
            quantity: Number(subItem.quantity),
          });

          if (c?.id) {
            itemRefs.push(c?.id);
          }
        })
      );

      await db.merge(groupIdString, {
        sub_items: itemRefs,
      });

      toast.success(t('toast:inventory.itemGroupSaved'));
      closeModal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const itemOptions = items?.data?.map((item) => ({
    label: `${item.name}-${item.code}`,
    value: item.id
  })) ?? [];

  return (
    <Modal
      title={data ? `Update group for ${data?.main_item?.name ?? ""}` : "Create new item group"}
      open={open}
      onClose={closeModal}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-3 mb-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label>{t('columns.mainItem')}</label>
              <Controller
                name="main_item"
                control={control}
                render={({field}) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={itemOptions}
                    isLoading={loadingItems}
                  />
                )}
              />
              <InputError error={_.get(errors, ["main_item", "message"])}/>
            </div>
            <div className="flex-1">
              <Controller
                name="base_quantity"
                control={control}
                render={({field}) => (
                  <Input
                    label={t('columns.baseQuantity')}
                    type="number"
                    {...field}
                    value={field.value ?? ""}
                    error={errors?.base_quantity?.message}
                  />
                )}
              />
            </div>
          </div>

          <fieldset className="border-2 border-neutral-900 rounded-lg p-3">
            <legend>{t('columns.subItems')}</legend>
            <div className="mb-3">
              <Button
                type="button"
                icon={faPlus}
                variant="primary"
                onClick={() => append({item: null, quantity: 1})}
              >
                Add sub item
              </Button>
            </div>

            {fields.map((field, index) => (
              <div className="flex gap-3 mb-3" key={field.id}>
                <div className="flex-1">
                  <label>{t('buttons.item')}</label>
                  <Controller
                    name={`sub_items.${index}.item`}
                    control={control}
                    render={({field}) => (
                      <ReactSelect
                        value={field.value}
                        onChange={field.onChange}
                        options={itemOptions}
                        isLoading={loadingItems}
                      />
                    )}
                  />
                  <InputError error={_.get(errors, ["sub_items", index, "item", "message"])}/>
                </div>
                <div className="flex-1 self-end">
                  <Controller
                    name={`sub_items.${index}.quantity`}
                    control={control}
                    render={({field}) => (
                      <Input
                        label={t('forms.quantity')}
                        type="number"
                        value={field.value as number | string}
                        onChange={field.onChange}
                        error={_.get(errors, ["sub_items", index, "quantity", "message"])}
                      />
                    )}
                  />
                </div>
                <div className="flex-0 self-end">
                  <Button
                    type="button"
                    variant="danger"
                    iconButton
                    onClick={() => remove(index)}
                  >
                    <FontAwesomeIcon icon={faTrash}/>
                  </Button>
                </div>
              </div>
            ))}
          </fieldset>
        </div>

        <div>
          <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
        </div>
      </form>
    </Modal>
  );
};


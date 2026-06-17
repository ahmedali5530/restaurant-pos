import {InventoryItem} from "@/api/model/inventory_item.ts";
import * as yup from "yup";
import React, {useEffect, useState} from "react";
import { useTranslation } from 'react-i18next';
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {InventorySupplier} from "@/api/model/inventory_supplier.ts";
import {useDB} from "@/api/db/db.ts";
import {Controller, useForm} from "react-hook-form";
import {yupResolver} from "@hookform/resolvers/yup";
import {StringRecordId} from "surrealdb";
import {toast} from "sonner";
import {Input, InputError} from "@/components/common/input/input.tsx";
import {ReactSelect} from "@/components/common/input/custom.react.select.tsx";
import {Button} from "@/components/common/input/button.tsx";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faPlus} from "@fortawesome/free-solid-svg-icons";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import {SupplierForm} from "@/components/inventory/suppliers/form.tsx";
import {InventoryCategory} from "@/api/model/inventory_category.ts";
import {InventoryStore} from "@/api/model/inventory_store.ts";
import {InventoryCategoryForm} from "@/components/inventory/categories/form.tsx";
import {InventoryStoreForm} from "@/components/inventory/stores/form.tsx";

interface Props {
  open: boolean
  onClose: () => void;
  data?: InventoryItem
}

const validationSchema = yup.object({
  name: yup.string().required("This is required"),
  code: yup.string().required("This is required"),
  uom: yup.object({
    label: yup.string(),
    value: yup.string()
  }).required('This is required'),
  category: yup.object({
    label: yup.string(),
    value: yup.string()
  }).required("This is required").nullable(),
  base_quantity: yup.number().typeError("This should be a number").required("This is required"),
  suppliers: yup.array(yup.object({
    label: yup.string(),
    value: yup.string()
  })).min(1, 'This is required'),
  stores: yup.array(yup.object({
    label: yup.string(),
    value: yup.string()
  })).min(1, 'Select at least one store'),
  price: yup.number().typeError("This should be a number").nullable().optional(),
  average_price: yup.number().typeError("This should be a number").nullable().optional(),
});

export const InventoryItemForm = ({
  open, data, onClose
}: Props) => {
  const { t } = useTranslation('inventory');
  const closeModal = () => {
    onClose();
    reset({
      name: '',
      code: '',
      category: null,
      base_quantity: 0,
      suppliers: [],
      stores: [],
      price: undefined,
      average_price: undefined,
      uom: null
    });
  }

  const {
    data: suppliers,
    fetchData: fetchSuppliers,
    isFetching: loadingSuppliers,
  } = useApi<SettingsData<InventorySupplier>>(Tables.inventory_suppliers, [], [], 0, 99999, [], {
    enabled: false
  });

  const {
    data: categories,
    fetchData: fetchCategories,
    isFetching: loadingCategories,
  } = useApi<SettingsData<InventoryCategory>>(Tables.inventory_categories, [], [], 0, 99999, [], {
    enabled: false
  });

  const {
    data: stores,
    fetchData: fetchStores,
    isFetching: loadingStores,
  } = useApi<SettingsData<InventoryStore>>(Tables.inventory_stores, [], [], 0, 99999, [], {
    enabled: false
  });

  useEffect(() => {
    if( open ) {
      fetchSuppliers();
      fetchCategories();
      fetchStores();
    }
  }, [open]);

  const [suppliersModal, setSuppliersModal] = useState(false);
  const [categoriesModal, setCategoriesModal] = useState(false);
  const [storesModal, setStoresModal] = useState(false);

  const db = useDB();

  const { register, control, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: yupResolver(validationSchema)
  });

  useEffect(() => {
    if( data ) {
      reset({
        name: data.name,
        code: data.code ?? '',
        base_quantity: data.base_quantity ?? 0,
        uom: {
          label: data.uom ?? '',
          value: data.uom ?? ''
        },
        price: Number(data?.price),
        average_price: Number(data?.average_price),
        category: data?.category ? {
          label: data.category.name,
          value: data.category.id
        } : null,
        suppliers: data?.suppliers?.map(item => ({
          label: item.name,
          value: item.id
        })),
        stores: data?.stores?.map(store => ({
          label: store.name,
          value: store.id
        })) ?? [],
      });
    }
  }, [data]);

  const onSubmit = async (values: any) => {
    try {
      const datum = {
        ...values,
        base_quantity: parseInt(values.base_quantity),
        suppliers: values?.suppliers?.map(item => new StringRecordId(item.value)),
        stores: values?.stores?.map(item => new StringRecordId(item.value)),
        category: values?.category ? new StringRecordId(values.category.value) : undefined,
        uom: values.uom.value,
        price: values.price !== undefined && values.price !== null && values.price !== '' ? parseFloat(values.price) : undefined,
        average_price: values.average_price !== undefined && values.average_price !== null && values.average_price !== '' ? parseFloat(values.average_price) : undefined,
      };

      const itemsData = {
        name: datum.name,
        code: datum.code,
        uom: datum.uom,
        category: datum.category,
        base_quantity: datum.base_quantity,
        suppliers: datum.suppliers,
        stores: datum.stores,
        price: datum.price,
        average_price: datum.average_price
      };

      if( data?.id ) {
        await db.merge(data.id, itemsData);
      } else {
        await db.create(Tables.inventory_items, itemsData);
      }

      closeModal();
      toast.success(t('toast:inventory.itemSaved', { name: values.name }));
    } catch ( e ) {
      console.log(e)
      toast.error(e);
    }
  }

  return (
    <>
      <Modal
        title={data ? `Update ${data?.name}` : 'Create new item'}
        open={open}
        onClose={closeModal}
        size="lg"
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <Input label={t('forms.nameOfItem')} {...register('name')} autoFocus error={errors?.name?.message}/>
            </div>
            <div className="flex-1">
              <Input label={t('columns.code')} {...register('code')} error={errors?.code?.message}/>
            </div>
            <div className="flex-1 flex gap-2 items-end">
              <div className="flex-1">
                <label>{t('columns.category')}</label>
                <Controller
                  name="category"
                  render={({ field }) => (
                    <ReactSelect
                      options={categories?.data?.map(item => ({
                        label: item.name,
                        value: item.id
                      }))}
                      value={field.value}
                      onChange={field.onChange}
                      isLoading={loadingCategories}
                      isClearable
                    />
                  )}
                  control={control}
                />
                {errors?.category && <InputError error={errors?.category?.message}/>}
              </div>
              <Button type="button" variant="primary" iconButton onClick={() => setCategoriesModal(true)}>
                <FontAwesomeIcon icon={faPlus}/>
              </Button>
            </div>
          </div>
          <div className="mb-3">
            <Controller
              name="base_quantity"
              control={control}
              render={({field}) => (
                <Input
                  type="number"
                  label={t('columns.baseQuantity')}
                  {...field}
                  value={field.value ?? ""}
                  error={errors?.base_quantity?.message}
                />
              )}
            />
          </div>
          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label>{t('columns.uom')}</label>
              <Controller
                name="uom"
                render={({ field }) => (
                  <ReactSelect
                    options={['KG', 'G', 'L', 'ML', 'PC', 'DZN', 'PK'].map(item => ({
                      label: item,
                      value: item
                    }))}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
                control={control}
              />
              {errors?.uom?.message && <InputError error={errors?.uom?.message}/>}
            </div>
          </div>

          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <Controller render={({field}) => (
                <Input
                  type="number"
                  label={t('columns.price')}
                  value={field.value}
                  onChange={field.onChange}
                  error={errors?.price?.message}
                />
              )} name="price" control={control} />

            </div>
            <div className="flex-1">
              <Controller
                name="average_price"
                control={control}
                render={({field}) => (
                  <Input
                    type="number"
                    label={t('columns.averagePrice')}
                    {...field}
                    value={field.value ?? ""}
                    error={errors?.average_price?.message}
                  />
                )}
              />
            </div>
          </div>

          <div className="flex gap-3 mb-3 items-end">
            <div className="flex-1 flex gap-2 items-end">
              <div className="flex-1">
                <label>{t('tabs.stores')}</label>
                <Controller
                  name="stores"
                  render={({ field }) => (
                    <ReactSelect
                      options={stores?.data?.map(store => ({
                        label: store.name,
                        value: store.id
                      }))}
                      isMulti
                      value={field.value}
                      onChange={field.onChange}
                      isLoading={loadingStores}
                    />
                  )}
                  control={control}
                />
                {errors?.stores?.message && <InputError error={errors?.stores?.message}/>}
              </div>
              <Button type="button" variant="primary" iconButton onClick={() => setStoresModal(true)}>
                <FontAwesomeIcon icon={faPlus}/>
              </Button>
            </div>
          </div>

          <div className="flex gap-3 mb-3 items-end">
            <div className="flex-1">
              <label>{t('tabs.suppliers')}</label>
              <Controller
                name="suppliers"
                render={({ field }) => (
                  <ReactSelect
                    options={suppliers?.data?.map(item => ({
                      label: item.name,
                      value: item.id
                    }))}
                    isMulti
                    value={field.value}
                    onChange={field.onChange}
                    isLoading={loadingSuppliers}
                  />
                )}
                control={control}
              />
              {errors?.suppliers?.message && <InputError error={errors?.suppliers?.message}/>}
            </div>
            <div className="flex-0">
              <Button onClick={() => setSuppliersModal(true)} type="button" variant="primary">
                <FontAwesomeIcon icon={faPlus}/>
              </Button>
            </div>
          </div>

          <div>
            <Button type="submit" variant="primary">{t('common:actions.save')}</Button>
          </div>
        </form>
      </Modal>

      {suppliersModal && (
        <SupplierForm
          open={true}
          onClose={() => {
            fetchSuppliers();
            setSuppliersModal(false);
          }}
        />
      )}

      {categoriesModal && (
        <InventoryCategoryForm
          open={true}
          onClose={() => {
            fetchCategories();
            setCategoriesModal(false);
          }}
        />
      )}

      {storesModal && (
        <InventoryStoreForm
          open={true}
          onClose={() => {
            fetchStores();
            setStoresModal(false);
          }}
        />
      )}
    </>
  );
}
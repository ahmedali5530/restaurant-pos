import { Printer } from "@/api/model/printer.ts";
import { Kitchen } from "@/api/model/kitchen.ts";
import { Modal } from "@/components/common/react-aria/modal.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Controller, useForm } from "react-hook-form";
import { transformValue } from "@/lib/utils.ts";
import { Button } from "@/components/common/input/button.tsx";
import { useEffect, useState } from "react";
import { useDB } from "@/api/db/db.ts";
import { zodResolver } from "@hookform/resolvers/zod";
import { Tables } from "@/api/db/tables.ts";
import { toast } from "sonner";
import {useTranslation} from 'react-i18next';
import i18n from '@/lib/i18n.ts';
import * as z from "zod";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import useApi, { SettingsData } from "@/api/db/use.api.ts";
import { Dish } from "@/api/model/dish.ts";
import { StringRecordId } from "surrealdb";
import { Checkbox } from "@/components/common/input/checkbox.tsx";

interface Props {
  open: boolean
  onClose: () => void;
  data?: Kitchen
}

const validationSchema = z.object({
  name: z.string().min(1, i18n.t('validation:required')),
  printers: z.array(z.object({
    label: z.string(),
    value: z.string()
  })).nullable().optional(),
  items: z.array(z.object({
    label: z.string(),
    value: z.string()
  })),
  priority: z.number().min(1, i18n.t('validation:required')),
});

export const KitchenForm = ({
  open, onClose, data
}: Props) => {
  const { t } = useTranslation(['admin', 'common', 'validation', 'toast']);

  const [dishSearch, setDishSearch] = useState("");

  const closeModal = () => {
    onClose();
    setDishSearch("");
    reset({
      name: null,
      printers: [],
      priority: null,
      items: []
    });
  }

  useEffect(() => {
    if(data){
      reset({
        ...data,
        name: data.name,
        priority: data.priority,
        printers: data?.printers?.map(item => ({
          label: item.name,
          value: item.id.toString()
        })),
        items: data?.items?.map(item => ({
          label: item.name,
          value: item.id.toString()
        })),
      });
    }
  }, [data]);

  const db = useDB();

  const {
    data: printers,
    fetchData: fetchPrinters
  } = useApi<SettingsData<Printer>>(Tables.printers, [], ['priority asc'], 0, 99999, [], {
    enabled: false
  });

  const {
    data: dishes,
    fetchData: fetchDishes
  } = useApi<SettingsData<Dish>>(Tables.dishes, [], ['priority asc'], 0, 99999, ['categories'], {
    enabled: false
  });

  const { register, control, handleSubmit, formState: {errors}, reset } = useForm({
    resolver: zodResolver(validationSchema)
  });

  console.log(errors)

  const onSubmit = async (values: any) => {
    const vals = {...values};
    if(values.items){
      vals.items = values.items.map(item => new StringRecordId(item.value));
    }

    if(values.printers){
      vals.printers = values.printers.map(item => new StringRecordId(item.value));
    }

    vals.priority = Number(values.priority);

    try {
      if(data?.id){
        await db.update(data.id, {
          ...vals
        })
      }else{
        await db.create(Tables.kitchens, {
          ...vals
        });
      }

      closeModal();
      toast.success(t('toast:admin.kitchenSaved', { name: values.name }));
    }catch(e){
      toast.error(e);
      console.log(e)
    }
  }

  useEffect(() => {
    if(open){
      fetchPrinters();
      fetchDishes();
    }
  }, [open]);

  return (
    <>
      <Modal
        title={data ? t('forms.updateKitchen', { name: data?.name }) : t('forms.createKitchen')}
        open={open}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex gap-3 mb-3 flex-col">
            <div className="flex-1">
              <Input label={t('columns.name')} {...register('name')} autoFocus error={errors?.name?.message}/>
            </div>

            <div className="flex-1">
              <label htmlFor="">Dishes</label>
              <div className="mt-2">
                <Input
                  placeholder={t('forms.searchDishes')}
                  value={dishSearch}
                  onChange={(e) => setDishSearch(e.target.value)}
                />
              </div>
              <Controller
                render={({ field }) => (
                  <div className="mt-2 rounded border border-neutral-300 p-3 max-h-96 overflow-auto">
                    {(() => {
                      const searchTerm = dishSearch.trim().toLowerCase();
                      const selectedItems = Array.isArray(field.value) ? field.value : [];
                      const selectedMap = new Map(
                        selectedItems.map(item => [item.value, item])
                      );
                      const filteredDishes = (dishes?.data ?? []).filter((dish) => {
                        if (!searchTerm) return true;
                        return dish.name.toLowerCase().includes(searchTerm);
                      });

                      const groupedDishes = filteredDishes.reduce((acc, dish) => {
                        const categories = dish.categories?.length
                          ? dish.categories
                          : [{ id: "__uncategorized__", name: "Uncategorized" }];

                        categories.forEach((category) => {
                          const key = category.id?.toString?.() ?? "__uncategorized__";
                          if (!acc[key]) {
                            acc[key] = {
                              id: key,
                              name: category.name ?? "Uncategorized",
                              dishes: []
                            };
                          }

                          const alreadyExists = acc[key].dishes.some(item => item.id === dish.id);
                          if (!alreadyExists) {
                            acc[key].dishes.push(dish);
                          }
                        });

                        return acc;
                      }, {} as Record<string, { id: string; name: string; dishes: Dish[] }>);

                      const categories = Object.values(groupedDishes)
                        .sort((a, b) => a.name.localeCompare(b.name));

                      const toggleDish = (dish: Dish) => {
                        const dishId = dish.id.toString();
                        if (selectedMap.has(dishId)) {
                          field.onChange(selectedItems.filter(item => item.value !== dishId));
                          return;
                        }

                        field.onChange([
                          ...selectedItems,
                          {
                            label: dish.name,
                            value: dishId
                          }
                        ]);
                      };

                      const toggleCategory = (categoryDishes: Dish[]) => {
                        const categoryDishIds = categoryDishes.map(item => item.id.toString());
                        const isAllSelected = categoryDishIds.every(id => selectedMap.has(id));

                        if (isAllSelected) {
                          field.onChange(
                            selectedItems.filter(item => !categoryDishIds.includes(item.value))
                          );
                          return;
                        }

                        const nextItems = [...selectedItems];
                        categoryDishes.forEach((dish) => {
                          const dishId = dish.id.toString();
                          if (!selectedMap.has(dishId)) {
                            nextItems.push({
                              label: dish.name,
                              value: dishId
                            });
                          }
                        });
                        field.onChange(nextItems);
                      };

                      if (!categories.length) {
                        return (
                          <p className="text-neutral-500">
                            {searchTerm ? t('forms.noDishesMatch') : t('forms.noDishesFound')}
                          </p>
                        );
                      }

                      return (
                        <div className="space-y-2">
                          {categories.map((category) => {
                            const categoryDishIds = category.dishes.map(item => item.id.toString());
                            const selectedCount = categoryDishIds.filter(id => selectedMap.has(id)).length;
                            const isAllSelected = categoryDishIds.length > 0 && selectedCount === categoryDishIds.length;

                            return (
                              <div key={category.id} className="rounded border border-neutral-200">
                                <button
                                  type="button"
                                  onClick={() => toggleCategory(category.dishes)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-neutral-100"
                                >
                                  <Checkbox
                                    checked={isAllSelected}
                                    indeterminate={selectedCount > 0 && !isAllSelected}
                                    readOnly
                                    className="pointer-events-none"
                                  />
                                  <span className="font-medium">{category.name}</span>
                                </button>
                                <div className="pl-8 pr-3 pb-2 space-y-1">
                                  {category.dishes.map((dish) => {
                                    const dishId = dish.id.toString();
                                    return (
                                      <label
                                        key={`${category.id}-${dishId}`}
                                        className="flex items-center gap-2 py-1 cursor-pointer"
                                      >
                                        <Checkbox
                                          checked={selectedMap.has(dishId)}
                                          onChange={() => toggleDish(dish)}
                                        />
                                        <span>{dish.name}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
                name="items"
                control={control}
              />
            </div>

            <div className="flex-1">
              <label htmlFor="">Printers</label>
              <Controller
                render={({ field }) => (
                  <ReactSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={printers?.data?.map(item => ({
                      label: item.name,
                      value: item.id.toString()
                    }))}
                    isMulti
                  />
                )}
                name="printers"
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
                    value={transformValue.input(field.value)}
                    onChange={(e) => field.onChange(transformValue.output(e))}
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
